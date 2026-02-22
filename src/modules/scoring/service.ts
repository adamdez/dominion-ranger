import { eq, sql, desc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  scoringRecords,
  scoringModelConfigs,
  distressEvents,
  signalAccumulation,
  properties,
} from '../../db/schema/index.js';
import type { ScoringRecord, ScoringModelConfig, DistressEvent, Property } from '../../db/schema/index.js';
import { generateId, exponentialDecay, daysBetween } from '../../lib/index.js';
import { domainEvents } from '../../events/bus.js';
import { logger } from '../../config/logger.js';

// ─── Types ─────────────────────────────────────────

interface WeightEntry {
  base_weight: number;
  half_life_days: number;
  severity?: number;
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

interface EquityMultiplierRange {
  min: number;
  max?: number;
  multiplier: number;
}

interface EquityMultiplierConfig {
  ranges: EquityMultiplierRange[];
  default_multiplier: number;
}

interface DealScoreWeights {
  equity_weight: number;
  ownership_weight: number;
  absentee_weight: number;
  mortgage_weight: number;
  equity_thresholds: { low: number; mid: number; high: number };
  ownership_thresholds: { short_months: number; long_months: number };
  mortgage_severity: Record<string, number>;
}

interface SuppressionConfig {
  mortgage_statuses?: string[];
  max_ownership_months?: number;
  custom_flags?: string[];
}

interface SignalContribution {
  eventId: string;
  eventType: string;
  eventLayer: string;
  baseWeight: number;
  severityMultiplier: number;
  reliabilityScore: number;
  timeDecay: number;
  finalContribution: number;
  daysSinceTrigger: number;
}

export interface ScoringResult {
  compositeScore: number;
  motivationScore: number;
  dealScore: number;
  confidenceScore: number;
  equityMultiplier: number;
  suppressed: boolean;
  suppressionReason: string | null;
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
const CONFIG_TTL_MS = 60_000;

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
 * Score a property using the Charter-mandated tri-score model:
 *
 *   Motivation Score — distress signal intensity (urgency to sell)
 *   Deal Score — property economics viability (equity, ownership, market)
 *   Composite Score — weighted combination × equity multiplier
 *
 * Includes:
 *   - Config-driven severity multipliers per event type
 *   - Config-driven equity multiplier based on equity range
 *   - Negative-stack suppression check before scoring
 *   - Versioned, append-only scoring records
 */
export async function scoreProperty(dominionLeadId: string): Promise<ScoringResult> {
  const config = await getActiveConfig();
  const confirmedWeights = config.confirmedWeights as Record<string, WeightEntry>;
  const predictiveWeights = config.predictiveWeights as Record<string, WeightEntry>;
  const decayConfig = config.decayConfig as DecayConfig;
  const confidenceConfig = config.confidenceConfig as ConfidenceConfig;
  const equityConfig = (config.equityMultiplierConfig as EquityMultiplierConfig | null) ?? DEFAULT_EQUITY_CONFIG;
  const dealWeights = (config.dealScoreWeights as DealScoreWeights | null) ?? DEFAULT_DEAL_WEIGHTS;
  const suppressionConfig = (config.suppressionConfig as SuppressionConfig | null) ?? null;
  const now = new Date();

  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.dominionLeadId, dominionLeadId));

  if (!property) {
    return createZeroScore(dominionLeadId, config.version);
  }

  // Negative-stack suppression check
  const suppressionReason = checkSuppression(property, suppressionConfig);
  if (suppressionReason) {
    const result = createSuppressedScore(dominionLeadId, config.version, suppressionReason);
    await storeScoringRecord(dominionLeadId, result, config.version);
    return result;
  }

  const events = await db
    .select()
    .from(distressEvents)
    .where(eq(distressEvents.dominionLeadId, dominionLeadId))
    .orderBy(sql`${distressEvents.createdAt} DESC`);

  if (events.length === 0) {
    return createZeroScore(dominionLeadId, config.version);
  }

  const [signals] = await db
    .select()
    .from(signalAccumulation)
    .where(eq(signalAccumulation.dominionLeadId, dominionLeadId));

  // ── Motivation Score (distress signal intensity) ──
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
    const severity = weightEntry.severity ?? 1.0;

    const contribution = weightEntry.base_weight * reliability * decay * severity;
    totalContribution += contribution;

    if (!earliestTrigger || referenceDate < earliestTrigger) {
      earliestTrigger = referenceDate;
    }

    contributions.push({
      eventId: event.eventId,
      eventType: event.eventType,
      eventLayer: event.eventLayer,
      baseWeight: weightEntry.base_weight,
      severityMultiplier: severity,
      reliabilityScore: reliability,
      timeDecay: decay,
      finalContribution: contribution,
      daysSinceTrigger: days,
    });
  }

  const accelerationBonus = signals
    ? parseFloat(signals.signalAccelerationRate ?? '0') * 0.05
    : 0;
  const densityBonus = signals
    ? Math.min(parseFloat(signals.signalDensityScore ?? '0') * 0.02, 0.15)
    : 0;

  totalContribution *= (1 + accelerationBonus + densityBonus);
  const motivationScore = Math.min(100, (totalContribution / 3.0) * 100);

  // ── Deal Score (property economics) ──
  const dealScore = calculateDealScore(property, dealWeights);

  // ── Equity Multiplier ──
  const equityMultiplier = resolveEquityMultiplier(property.equityEstimate, equityConfig);

  // ── Composite: weighted combination ──
  const rawComposite = (motivationScore * 0.65 + dealScore * 0.35);
  const compositeScore = Math.min(100, rawComposite * equityMultiplier);

  // ── Confidence (independent) ──
  const confidence = calculateConfidence(
    events.length,
    uniqueTypes.size,
    uniqueSources.size,
    hasConfirmedEvent,
    confidenceConfig,
  );

  const avgDecay = contributions.length > 0
    ? contributions.reduce((sum, c) => sum + c.timeDecay, 0) / contributions.length
    : 0;
  const daysSinceTrigger = earliestTrigger ? daysBetween(earliestTrigger, now) : 0;

  const result: ScoringResult = {
    compositeScore,
    motivationScore,
    dealScore,
    confidenceScore: confidence,
    equityMultiplier,
    suppressed: false,
    suppressionReason: null,
    signalContributions: contributions,
    timeDecayFactor: avgDecay,
    scoreDecayRate: 1 - avgDecay,
    daysSinceTrigger,
    firstDetectedAt: earliestTrigger,
    modelVersion: config.version,
  };

  await storeScoringRecord(dominionLeadId, result, config.version);

  logger.info(
    {
      dominionLeadId,
      composite: compositeScore.toFixed(2),
      motivation: motivationScore.toFixed(2),
      deal: dealScore.toFixed(2),
      equityMult: equityMultiplier.toFixed(2),
      confidence: confidence.toFixed(2),
      eventCount: events.length,
      modelVersion: config.version,
    },
    'Property scored (tri-score)',
  );

  domainEvents.emit('scoring.completed', {
    dominionLeadId,
    scoreId: generateId(),
    compositeScore,
  });

  return result;
}

// ─── Sub-Score Calculators ─────────────────────────

function calculateDealScore(property: Property, weights: DealScoreWeights): number {
  let score = 0;

  // Equity factor
  const equity = property.equityEstimate ? parseFloat(property.equityEstimate) : 0;
  const { low, mid, high } = weights.equity_thresholds;
  let equityFactor = 0;
  if (equity >= high) equityFactor = 1.0;
  else if (equity >= mid) equityFactor = 0.7;
  else if (equity >= low) equityFactor = 0.4;
  else equityFactor = 0.15;
  score += equityFactor * weights.equity_weight;

  // Ownership duration factor (long ownership = more motivated to sell)
  const months = property.ownershipDurationMonths ?? 0;
  const { short_months, long_months } = weights.ownership_thresholds;
  let ownershipFactor = 0;
  if (months >= long_months) ownershipFactor = 1.0;
  else if (months >= short_months) ownershipFactor = 0.5;
  else ownershipFactor = 0.2;
  score += ownershipFactor * weights.ownership_weight;

  // Absentee owner bonus
  if (property.absenteeOwner) {
    score += weights.absentee_weight;
  }

  // Mortgage status factor
  const mortgageStatus = property.mortgageStatus ?? 'UNKNOWN';
  const mortgageFactor = weights.mortgage_severity[mortgageStatus] ?? 0;
  score += mortgageFactor * weights.mortgage_weight;

  return Math.min(100, score * 100);
}

function resolveEquityMultiplier(equityEstimate: string | null, config: EquityMultiplierConfig): number {
  if (!equityEstimate) return config.default_multiplier;

  const equity = parseFloat(equityEstimate);
  if (isNaN(equity)) return config.default_multiplier;

  for (const range of config.ranges) {
    const aboveMin = equity >= range.min;
    const belowMax = range.max === undefined || equity < range.max;
    if (aboveMin && belowMax) return range.multiplier;
  }

  return config.default_multiplier;
}

function checkSuppression(property: Property, config: SuppressionConfig | null): string | null {
  if (!config) return null;

  if (config.mortgage_statuses?.includes(property.mortgageStatus ?? '')) {
    return `Suppressed: mortgage status ${property.mortgageStatus}`;
  }

  if (config.max_ownership_months && property.ownershipDurationMonths) {
    if (property.ownershipDurationMonths < config.max_ownership_months) {
      return `Suppressed: ownership duration ${property.ownershipDurationMonths}mo < ${config.max_ownership_months}mo minimum`;
    }
  }

  return null;
}

function calculateConfidence(
  eventCount: number,
  typeCount: number,
  sourceCount: number,
  hasConfirmed: boolean,
  config: ConfidenceConfig,
): number {
  let confidence = 0;
  const signalFactor = Math.min(eventCount / config.min_signals_for_high, 1.0);
  confidence += signalFactor * 0.4;
  confidence += Math.min(typeCount * config.diversity_bonus, 0.2);
  confidence += Math.min(sourceCount * config.source_count_weight, 0.15);
  if (hasConfirmed) confidence += config.confirmed_presence_bonus;
  return Math.min(confidence, 1.0);
}

// ─── Storage ───────────────────────────────────────

async function storeScoringRecord(dominionLeadId: string, result: ScoringResult, modelVersion: string): Promise<void> {
  const scoreId = generateId();
  await db.insert(scoringRecords).values({
    scoreId,
    dominionLeadId,
    compositeScore: result.compositeScore.toFixed(4),
    motivationScore: result.motivationScore.toFixed(4),
    dealScore: result.dealScore.toFixed(4),
    confidenceScore: result.confidenceScore.toFixed(4),
    scoreModelVersion: modelVersion,
    scoreInputsSnapshot: {
      eventCount: result.signalContributions.length,
      uniqueTypes: [...new Set(result.signalContributions.map((c) => c.eventType))],
      uniqueSources: [...new Set(result.signalContributions.map((c) => c.eventId))],
      hasConfirmedEvent: result.signalContributions.some((c) => c.eventLayer === 'confirmed'),
      equityMultiplier: result.equityMultiplier,
      suppressed: result.suppressed,
      suppressionReason: result.suppressionReason,
    },
    signalContributions: result.signalContributions,
    timeDecayFactor: result.timeDecayFactor.toFixed(4),
    scoreDecayRate: result.scoreDecayRate.toFixed(4),
    daysSinceTrigger: result.daysSinceTrigger,
    firstDetectedAt: result.firstDetectedAt,
    lastScoredAt: new Date(),
  });
}

// ─── Defaults ──────────────────────────────────────

const DEFAULT_EQUITY_CONFIG: EquityMultiplierConfig = {
  ranges: [
    { min: 0, max: 25000, multiplier: 0.7 },
    { min: 25000, max: 75000, multiplier: 0.85 },
    { min: 75000, max: 200000, multiplier: 1.0 },
    { min: 200000, multiplier: 1.15 },
  ],
  default_multiplier: 1.0,
};

const DEFAULT_DEAL_WEIGHTS: DealScoreWeights = {
  equity_weight: 0.35,
  ownership_weight: 0.25,
  absentee_weight: 0.15,
  mortgage_weight: 0.25,
  equity_thresholds: { low: 25000, mid: 75000, high: 200000 },
  ownership_thresholds: { short_months: 24, long_months: 120 },
  mortgage_severity: {
    FREE_AND_CLEAR: 0.3,
    CURRENT: 0.2,
    LATE_30: 0.5,
    LATE_60: 0.7,
    LATE_90: 0.85,
    DEFAULT: 0.95,
    FORECLOSURE: 1.0,
    UNKNOWN: 0.1,
  },
};

function createZeroScore(dominionLeadId: string, modelVersion: string): ScoringResult {
  return {
    compositeScore: 0,
    motivationScore: 0,
    dealScore: 0,
    confidenceScore: 0,
    equityMultiplier: 1.0,
    suppressed: false,
    suppressionReason: null,
    signalContributions: [],
    timeDecayFactor: 0,
    scoreDecayRate: 1,
    daysSinceTrigger: 0,
    firstDetectedAt: null,
    modelVersion,
  };
}

function createSuppressedScore(dominionLeadId: string, modelVersion: string, reason: string): ScoringResult {
  return {
    compositeScore: 0,
    motivationScore: 0,
    dealScore: 0,
    confidenceScore: 0,
    equityMultiplier: 1.0,
    suppressed: true,
    suppressionReason: reason,
    signalContributions: [],
    timeDecayFactor: 0,
    scoreDecayRate: 1,
    daysSinceTrigger: 0,
    firstDetectedAt: null,
    modelVersion,
  };
}

// ─── Query Helpers ─────────────────────────────────

export async function getLatestScore(dominionLeadId: string): Promise<ScoringRecord | null> {
  const [record] = await db
    .select()
    .from(scoringRecords)
    .where(eq(scoringRecords.dominionLeadId, dominionLeadId))
    .orderBy(desc(scoringRecords.createdAt))
    .limit(1);
  return record ?? null;
}

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
