import { eq, sql, desc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  scoringRecords,
  scoringModelConfigs,
  distressEvents,
  signalAccumulation,
} from '../../db/schema/index.js';
import type { ScoringRecord, ScoringModelConfig, DistressEvent } from '../../db/schema/index.js';
import { generateId, exponentialDecay, daysBetween } from '../../lib/index.js';
import { domainEvents } from '../../events/bus.js';
import { logger } from '../../config/logger.js';

// ─── Types ─────────────────────────────────────────

interface WeightEntry {
  base_weight: number;
  half_life_days: number;
}

interface DecayConfig {
  function: 'exponential';
  floor: number;
}

interface ConfidenceConfig {
  min_signals_for_high: number;
  diversity_bonus: number;
  confirmed_presence_bonus: number;
  source_count_weight: number;
}

interface TierThresholds {
  A: number;
  B: number;
  C: number;
}

interface SignalContribution {
  eventId: string;
  eventType: string;
  eventLayer: string;
  baseWeight: number;
  reliabilityScore: number;
  timeDecay: number;
  finalContribution: number;
  daysSinceTrigger: number;
}

export interface ScoringResult {
  compositeScore: number;
  confidenceScore: number;
  signalContributions: SignalContribution[];
  timeDecayFactor: number;
  scoreDecayRate: number;
  daysSinceTrigger: number;
  firstDetectedAt: Date | null;
  modelVersion: string;
}

// ─── Config Loading ────────────────────────────────

let cachedConfig: ScoringModelConfig | null = null;
let configLoadedAt: number = 0;
const CONFIG_TTL_MS = 60_000; // Reload config every 60s

async function getActiveConfig(): Promise<ScoringModelConfig> {
  const now = Date.now();
  if (cachedConfig && now - configLoadedAt < CONFIG_TTL_MS) {
    return cachedConfig;
  }

  const [config] = await db
    .select()
    .from(scoringModelConfigs)
    .where(eq(scoringModelConfigs.active, true))
    .limit(1);

  if (!config) {
    throw new Error('No active scoring model configuration found. Seed the database first.');
  }

  cachedConfig = config;
  configLoadedAt = now;
  return config;
}

export function invalidateConfigCache(): void {
  cachedConfig = null;
  configLoadedAt = 0;
}

// ─── Core Scoring ──────────────────────────────────

/**
 * Score a property based on all its distress events.
 *
 * Algorithm:
 * 1. Load active scoring config
 * 2. Fetch all events for property (within scoring window)
 * 3. For each event: contribution = base_weight × reliability × time_decay
 * 4. Sum contributions → raw score
 * 5. Apply signal accumulation bonuses
 * 6. Normalize to 0–100 range
 * 7. Calculate confidence independently
 * 8. Store versioned scoring record (append-only)
 */
export async function scoreProperty(dominionLeadId: string): Promise<ScoringResult> {
  const config = await getActiveConfig();
  const confirmedWeights = config.confirmedWeights as Record<string, WeightEntry>;
  const predictiveWeights = config.predictiveWeights as Record<string, WeightEntry>;
  const decayConfig = config.decayConfig as DecayConfig;
  const confidenceConfig = config.confidenceConfig as ConfidenceConfig;
  const now = new Date();

  // Fetch events (last 365 days for scoring window)
  const events = await db
    .select()
    .from(distressEvents)
    .where(eq(distressEvents.dominionLeadId, dominionLeadId))
    .orderBy(sql`${distressEvents.createdAt} DESC`);

  if (events.length === 0) {
    return createZeroScore(dominionLeadId, config.version);
  }

  // Fetch signal accumulation
  const [signals] = await db
    .select()
    .from(signalAccumulation)
    .where(eq(signalAccumulation.dominionLeadId, dominionLeadId));

  // Calculate per-event contributions
  const contributions: SignalContribution[] = [];
  let totalContribution = 0;
  let earliestTrigger: Date | null = null;
  let hasConfirmedEvent = false;
  const uniqueSources = new Set<string>();
  const uniqueTypes = new Set<string>();

  for (const event of events) {
    const weights = event.eventLayer === 'confirmed' ? confirmedWeights : predictiveWeights;
    const weightEntry = weights[event.eventType];
    if (!weightEntry) continue;

    if (event.eventLayer === 'confirmed') hasConfirmedEvent = true;
    uniqueSources.add(event.sourceName);
    uniqueTypes.add(event.eventType);

    const referenceDate = event.triggerEventDate ?? event.filingDate ?? event.recordedDate ?? event.createdAt;
    const days = daysBetween(referenceDate, now);
    const decay = exponentialDecay(days, weightEntry.half_life_days, decayConfig.floor);
    const reliability = parseFloat(event.reliabilityScore);

    const contribution = weightEntry.base_weight * reliability * decay;
    totalContribution += contribution;

    if (!earliestTrigger || referenceDate < earliestTrigger) {
      earliestTrigger = referenceDate;
    }

    contributions.push({
      eventId: event.eventId,
      eventType: event.eventType,
      eventLayer: event.eventLayer,
      baseWeight: weightEntry.base_weight,
      reliabilityScore: reliability,
      timeDecay: decay,
      finalContribution: contribution,
      daysSinceTrigger: days,
    });
  }

  // Signal accumulation bonus
  const accelerationBonus = signals
    ? parseFloat(signals.signalAccelerationRate ?? '0') * 0.05
    : 0;
  const densityBonus = signals
    ? Math.min(parseFloat(signals.signalDensityScore ?? '0') * 0.02, 0.15)
    : 0;

  totalContribution *= (1 + accelerationBonus + densityBonus);

  // Normalize to 0–100
  // Max theoretical score ~ 5.0 for extreme multi-signal confirmed distress
  const compositeScore = Math.min(100, (totalContribution / 3.0) * 100);

  // Confidence scoring (independent of composite)
  const confidence = calculateConfidence(
    events.length,
    uniqueTypes.size,
    uniqueSources.size,
    hasConfirmedEvent,
    confidenceConfig,
  );

  // Average time decay across contributions
  const avgDecay = contributions.length > 0
    ? contributions.reduce((sum, c) => sum + c.timeDecay, 0) / contributions.length
    : 0;

  const daysSinceTrigger = earliestTrigger ? daysBetween(earliestTrigger, now) : 0;

  // Store scoring record (append-only, versioned)
  const scoreId = generateId();
  await db.insert(scoringRecords).values({
    scoreId,
    dominionLeadId,
    compositeScore: compositeScore.toFixed(4),
    confidenceScore: confidence.toFixed(4),
    scoreModelVersion: config.version,
    scoreInputsSnapshot: {
      eventCount: events.length,
      uniqueTypes: Array.from(uniqueTypes),
      uniqueSources: Array.from(uniqueSources),
      hasConfirmedEvent,
      accelerationBonus,
      densityBonus,
    },
    signalContributions: contributions,
    timeDecayFactor: avgDecay.toFixed(4),
    scoreDecayRate: (1 - avgDecay).toFixed(4),
    daysSinceTrigger,
    firstDetectedAt: earliestTrigger,
    lastScoredAt: now,
  });

  logger.info(
    {
      dominionLeadId,
      compositeScore: compositeScore.toFixed(2),
      confidence: confidence.toFixed(2),
      eventCount: events.length,
      modelVersion: config.version,
    },
    'Property scored',
  );

  domainEvents.emit('scoring.completed', {
    dominionLeadId,
    scoreId,
    compositeScore,
  });

  return {
    compositeScore,
    confidenceScore: confidence,
    signalContributions: contributions,
    timeDecayFactor: avgDecay,
    scoreDecayRate: 1 - avgDecay,
    daysSinceTrigger,
    firstDetectedAt: earliestTrigger,
    modelVersion: config.version,
  };
}

function calculateConfidence(
  eventCount: number,
  typeCount: number,
  sourceCount: number,
  hasConfirmed: boolean,
  config: ConfidenceConfig,
): number {
  let confidence = 0;

  // Base confidence from signal count (diminishing returns)
  const signalFactor = Math.min(eventCount / config.min_signals_for_high, 1.0);
  confidence += signalFactor * 0.4;

  // Diversity bonus
  confidence += Math.min(typeCount * config.diversity_bonus, 0.2);

  // Source diversity
  confidence += Math.min(sourceCount * config.source_count_weight, 0.15);

  // Confirmed event presence is a strong confidence signal
  if (hasConfirmed) {
    confidence += config.confirmed_presence_bonus;
  }

  return Math.min(confidence, 1.0);
}

function createZeroScore(dominionLeadId: string, modelVersion: string): ScoringResult {
  return {
    compositeScore: 0,
    confidenceScore: 0,
    signalContributions: [],
    timeDecayFactor: 0,
    scoreDecayRate: 1,
    daysSinceTrigger: 0,
    firstDetectedAt: null,
    modelVersion,
  };
}

// ─── Query Helpers ─────────────────────────────────

/**
 * Get the latest scoring record for a property.
 */
export async function getLatestScore(dominionLeadId: string): Promise<ScoringRecord | null> {
  const [record] = await db
    .select()
    .from(scoringRecords)
    .where(eq(scoringRecords.dominionLeadId, dominionLeadId))
    .orderBy(desc(scoringRecords.createdAt))
    .limit(1);
  return record ?? null;
}

/**
 * Get scoring history for a property (for trend analysis).
 */
export async function getScoringHistory(
  dominionLeadId: string,
  limit: number = 20,
): Promise<ScoringRecord[]> {
  return db
    .select()
    .from(scoringRecords)
    .where(eq(scoringRecords.dominionLeadId, dominionLeadId))
    .orderBy(desc(scoringRecords.createdAt))
    .limit(limit);
}
