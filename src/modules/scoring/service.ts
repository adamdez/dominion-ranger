import { eq, sql, desc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  scoringRecords,
  scoringModelConfigs,
  distressEvents,
  signalAccumulation,
  properties,
} from '../../db/schema/index.js';
import type { ScoringRecord, ScoringModelConfig, Property } from '../../db/schema/index.js';
import { generateId, exponentialDecay, daysBetween } from '../../lib/index.js';
import { domainEvents } from '../../events/bus.js';
import { logger } from '../../config/logger.js';
import { BUSINESS_RULES } from '../../config/business-rules.js';
import { EventLayer } from '../../db/schema/constants.js';
import { ValidationError } from '../../lib/errors.js';

// ─── Types ─────────────────────────────────────────

interface WeightEntry {
  base_weight: number;
  half_life_days: number;
  severity?: number;
}

interface DecayConfig {
  function: 'exponential';
  floor: number;
  aggressive_after_days?: number;
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
  ownership_thresholds: { short_months: number; long_months: number; very_long_months?: number };
  mortgage_severity: Record<string, number>;
  equity_factors: { high: number; mid: number; low: number; floor: number };
  ownership_factors: { very_long?: number; long: number; short: number; floor: number };
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

async function getActiveConfig(): Promise<ScoringModelConfig> {
  const now = Date.now();
  if (cachedConfig && now - configLoadedAt < BUSINESS_RULES.scoring.configCacheTtlMs) {
    return cachedConfig;
  }

  const [config] = await db
    .select()
    .from(scoringModelConfigs)
    .where(eq(scoringModelConfigs.active, true))
    .limit(1);

  if (!config) {
    throw new ValidationError('No active scoring model configuration found. Seed the database first.');
  }

  cachedConfig = config;
  configLoadedAt = now;
  return config;
}

export function invalidateConfigCache(): void {
  cachedConfig = null;
  configLoadedAt = 0;
}

// ─── Scoring Enhancements (v2.0.0) ─────────────────

/**
 * TAX_DELINQUENCY events get scaled by dollar amount.
 * Small/ancient delinquencies ($385 from 2006) contribute almost nothing.
 * Large recent ones ($12k) contribute meaningfully.
 */
export function getEventSeverityMultiplier(eventType: string, rawPayload: unknown): number {
  if (eventType !== 'TAX_DELINQUENCY') return 1.0;

  try {
    const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    const amount = (payload as Record<string, unknown>)?.taxDelinquentAmount;
    const num = typeof amount === 'number' ? amount : parseFloat(String(amount ?? '0'));

    if (isNaN(num) || num <= 0) return 0.5;
    if (num < 500) return 0.3;
    if (num < 2000) return 0.6;
    if (num < 5000) return 1.0;
    if (num < 15000) return 1.3;
    return 1.6;
  } catch {
    return 0.5;
  }
}

/**
 * Recency boost rewards fresh signals.
 * Recent signals indicate an active, worsening situation.
 * Old signals (2+ years) get penalized further beyond time decay.
 */
export function getRecencyBoost(daysSince: number): number {
  if (daysSince < 30) return 1.5;
  if (daysSince < 90) return 1.3;
  if (daysSince < 180) return 1.15;
  if (daysSince < 365) return 1.0;
  if (daysSince < 730) return 0.8;
  return 0.6;
}

/**
 * Velocity bonus for properties with accelerating distress.
 * Two signals close together = crisis is escalating.
 */
export function getVelocityBonus(events: Array<{ triggerEventDate: Date | null; filingDate?: Date | null; recordedDate?: Date | null; createdAt: Date }>): number {
  const dated = events
    .map(e => e.triggerEventDate ?? e.filingDate ?? e.recordedDate ?? e.createdAt)
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime());

  if (dated.length < 2) return 1.0;

  const daysBetweenTopTwo = Math.floor(
    (dated[0].getTime() - dated[1].getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysBetweenTopTwo < 90) return 1.2;
  if (daysBetweenTopTwo < 180) return 1.1;
  return 1.0;
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
export async function scoreProperty(dominionLeadId: string, options?: { asOf?: Date }): Promise<ScoringResult> {
  const config = await getActiveConfig();
  const confirmedWeights = config.confirmedWeights as Record<string, WeightEntry>;
  const predictiveWeights = config.predictiveWeights as Record<string, WeightEntry>;
  const decayConfig = config.decayConfig as DecayConfig;
  const confidenceConfig = config.confidenceConfig as ConfidenceConfig;

  const equityConfig = config.equityMultiplierConfig as EquityMultiplierConfig | null;
  if (!equityConfig) throw new ValidationError('Scoring config missing equityMultiplierConfig. Seed the database.');
  const dealWeights = config.dealScoreWeights as DealScoreWeights | null;
  if (!dealWeights) throw new ValidationError('Scoring config missing dealScoreWeights. Seed the database.');
  const compositeWeights = config.compositeWeights as { motivation_weight: number; deal_weight: number } | null;
  if (!compositeWeights) throw new ValidationError('Scoring config missing compositeWeights. Seed the database.');

  const suppressionConfig = (config.suppressionConfig as SuppressionConfig | null) ?? null;
  const now = options?.asOf ?? new Date();

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
    await storeScoringRecord(dominionLeadId, result, config.version, now);
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
    const weights = event.eventLayer === EventLayer.CONFIRMED ? confirmedWeights : predictiveWeights;
    const weightEntry = weights[event.eventType];
    if (!weightEntry) continue;

    if (event.eventLayer === EventLayer.CONFIRMED) hasConfirmedEvent = true;
    uniqueSources.add(event.sourceName);
    uniqueTypes.add(event.eventType);

    const referenceDate = event.triggerEventDate ?? event.filingDate ?? event.recordedDate ?? event.createdAt;
    const days = daysBetween(referenceDate, now);
    const decay = exponentialDecay(days, weightEntry.half_life_days, decayConfig.floor);
    const reliability = parseFloat(event.reliabilityScore);
    const severity = weightEntry.severity ?? BUSINESS_RULES.scoring.defaultSeverity;

    const amountSeverity = getEventSeverityMultiplier(event.eventType, event.rawEventPayload);
    const recencyBoost = getRecencyBoost(days);

    const contribution = weightEntry.base_weight * reliability * decay * severity * amountSeverity * recencyBoost;
    totalContribution += contribution;

    if (!earliestTrigger || referenceDate < earliestTrigger) {
      earliestTrigger = referenceDate;
    }

    contributions.push({
      eventId: event.eventId,
      eventType: event.eventType,
      eventLayer: event.eventLayer,
      baseWeight: weightEntry.base_weight,
      severityMultiplier: severity * amountSeverity,
      reliabilityScore: reliability,
      timeDecay: decay,
      finalContribution: contribution,
      daysSinceTrigger: days,
    });
  }

  const accelerationBonus = signals
    ? parseFloat(signals.signalAccelerationRate ?? '0') * BUSINESS_RULES.scoring.accelerationRateMultiplier
    : 0;
  const densityBonus = signals
    ? Math.min(parseFloat(signals.signalDensityScore ?? '0') * BUSINESS_RULES.scoring.densityBonusMultiplier, BUSINESS_RULES.scoring.maxDensityBonus)
    : 0;

  const velocityBonus = getVelocityBonus(events);
  totalContribution *= (1 + accelerationBonus + densityBonus) * velocityBonus;
  const motivationScore = Math.min(100, (totalContribution / BUSINESS_RULES.scoring.normalizationDivisor) * 100);

  // ── Deal Score (property economics) ──
  const dealScore = calculateDealScore(property, dealWeights);

  // ── Equity Multiplier ──
  const equityMultiplier = resolveEquityMultiplier(property.equityEstimate, equityConfig);

  // ── Composite: weighted combination ──
  const rawComposite = (motivationScore * compositeWeights.motivation_weight + dealScore * compositeWeights.deal_weight);
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

  await storeScoringRecord(dominionLeadId, result, config.version, now);

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
  const ef = weights.equity_factors;
  let equityFactor = 0;
  if (equity >= high) equityFactor = ef.high;
  else if (equity >= mid) equityFactor = ef.mid;
  else if (equity >= low) equityFactor = ef.low;
  else equityFactor = ef.floor;
  score += equityFactor * weights.equity_weight;

  // Ownership duration factor (long ownership = more motivated to sell)
  const months = property.ownershipDurationMonths ?? 0;
  const { short_months, long_months, very_long_months } = weights.ownership_thresholds;
  const of_ = weights.ownership_factors;
  let ownershipFactor = 0;
  if (very_long_months && of_.very_long && months >= very_long_months) ownershipFactor = of_.very_long;
  else if (months >= long_months) ownershipFactor = of_.long;
  else if (months >= short_months) ownershipFactor = of_.short;
  else ownershipFactor = of_.floor;
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

const ENTITY_PATTERNS = [
  'LLC', 'INC', 'CORP', 'TRUST', 'BANK', 'CREDIT UNION',
  'COUNTY', 'CITY OF', 'STATE OF', 'FEDERAL', 'HUD',
  'FANNIE', 'FREDDIE', 'GOVT',
];

function checkSuppression(property: Property, config: SuppressionConfig | null): string | null {
  // Entity owner suppression — not wholesalable
  if (property.ownerName) {
    const upper = property.ownerName.toUpperCase();
    for (const pattern of ENTITY_PATTERNS) {
      if (upper.includes(pattern)) {
        return `Suppressed: entity owner (${pattern})`;
      }
    }
  }

  // Minimum equity suppression
  if (property.equityEstimate != null) {
    const equity = parseFloat(property.equityEstimate);
    if (!isNaN(equity) && equity < 15000) {
      return `Suppressed: equity too low ($${equity})`;
    }
  }

  // Minimum market value suppression (marketValueCents stored in cents)
  if (property.marketValueCents != null && property.marketValueCents < 8000000) {
    return 'Suppressed: value too low';
  }

  if (!config) return null;

  if (config.mortgage_statuses?.includes(property.mortgageStatus ?? '')) {
    return `Suppressed: mortgage status ${property.mortgageStatus}`;
  }

  if (config.max_ownership_months && property.ownershipDurationMonths) {
    if (property.ownershipDurationMonths < config.max_ownership_months) {
      return `Suppressed: ownership duration ${property.ownershipDurationMonths}mo < ${config.max_ownership_months}mo minimum`;
    }
  }

  // Charter Section VIII: custom_flags suppression (DNC, LITIGANT, OPT_OUT)
  const customFlags = config.custom_flags ?? [];
  if (customFlags.includes('DNC') && property.dncFlag === true) {
    return 'Suppressed: custom_flag DNC';
  }
  if (customFlags.includes('LITIGANT') && property.litigantFlag === true) {
    return 'Suppressed: custom_flag LITIGANT';
  }
  if (customFlags.includes('OPT_OUT') && property.optOutFlag === true) {
    return 'Suppressed: custom_flag OPT_OUT';
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
  const cw = BUSINESS_RULES.scoring.confidenceWeights;
  let confidence = 0;
  const signalFactor = Math.min(eventCount / config.min_signals_for_high, 1.0);
  confidence += signalFactor * cw.signalFactor;
  confidence += Math.min(typeCount * config.diversity_bonus, cw.maxDiversityBonus);
  confidence += Math.min(sourceCount * config.source_count_weight, cw.maxSourceBonus);
  if (hasConfirmed) confidence += config.confirmed_presence_bonus;
  return Math.min(confidence, 1.0);
}

// ─── Storage ───────────────────────────────────────

async function storeScoringRecord(dominionLeadId: string, result: ScoringResult, modelVersion: string, asOf: Date): Promise<void> {
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
      hasConfirmedEvent: result.signalContributions.some((c) => c.eventLayer === EventLayer.CONFIRMED),
      equityMultiplier: result.equityMultiplier,
      suppressed: result.suppressed,
      suppressionReason: result.suppressionReason,
    },
    signalContributions: result.signalContributions,
    timeDecayFactor: result.timeDecayFactor.toFixed(4),
    scoreDecayRate: result.scoreDecayRate.toFixed(4),
    daysSinceTrigger: result.daysSinceTrigger,
    firstDetectedAt: result.firstDetectedAt,
    lastScoredAt: asOf,
  });
}

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
