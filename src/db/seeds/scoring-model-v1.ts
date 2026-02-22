import { db } from '../connection.js';
import { scoringModelConfigs, systemSettings } from '../schema/index.js';
import { logger } from '../../config/logger.js';

/**
 * Seed Scoring Model v1.0
 *
 * Weight calibration rationale:
 *
 * Confirmed Layer B signals carry higher base weights (0.60–0.95)
 * because they represent verified legal/financial distress.
 *
 * Predictive Layer A signals carry lower base weights (0.15–0.40)
 * because they are probabilistic and noisy.
 *
 * Half-life represents how quickly a signal decays:
 * - Short half-life (30d): signal becomes stale fast (e.g., code violations)
 * - Long half-life (120d): signal remains relevant longer (e.g., bankruptcy)
 *
 * Charter: "Multiple weak signals may outweigh a single weak signal"
 * This is handled by the accumulation model — these weights define per-signal contribution.
 */
export async function seedScoringModel(): Promise<void> {
  const existing = await db.select().from(scoringModelConfigs).limit(1);
  if (existing.length > 0) {
    logger.info('Scoring model config already exists, skipping seed');
    return;
  }

  await db.insert(scoringModelConfigs).values({
    version: 'v1.0',

    confirmedWeights: {
      NOTICE_OF_DEFAULT:       { base_weight: 0.95, half_life_days: 90 },
      NOTICE_OF_TRUSTEE_SALE:  { base_weight: 0.90, half_life_days: 60 },
      LIS_PENDENS:             { base_weight: 0.85, half_life_days: 90 },
      TAX_DELINQUENCY:         { base_weight: 0.80, half_life_days: 120 },
      TAX_LIEN:                { base_weight: 0.75, half_life_days: 120 },
      BANKRUPTCY:              { base_weight: 0.85, half_life_days: 120 },
      PROBATE:                 { base_weight: 0.70, half_life_days: 180 },
      HOA_LIEN:                { base_weight: 0.65, half_life_days: 90 },
      MECHANIC_LIEN:           { base_weight: 0.60, half_life_days: 90 },
      JUDGMENT_LIEN:           { base_weight: 0.70, half_life_days: 90 },
      CODE_ENFORCEMENT:        { base_weight: 0.60, half_life_days: 60 },
    },

    predictiveWeights: {
      PREDICTIVE_EQUITY_DECLINE:        { base_weight: 0.35, half_life_days: 60 },
      PREDICTIVE_PAYMENT_STRESS:        { base_weight: 0.40, half_life_days: 45 },
      PREDICTIVE_OWNERSHIP_FATIGUE:     { base_weight: 0.25, half_life_days: 90 },
      PREDICTIVE_VACANCY_SIGNAL:        { base_weight: 0.30, half_life_days: 30 },
      PREDICTIVE_LISTING_WITHDRAWAL:    { base_weight: 0.35, half_life_days: 45 },
      PREDICTIVE_DIVORCE_FILING:        { base_weight: 0.40, half_life_days: 60 },
      PREDICTIVE_CODE_VIOLATION:        { base_weight: 0.25, half_life_days: 30 },
      PREDICTIVE_DEFERRED_MAINTENANCE:  { base_weight: 0.20, half_life_days: 60 },
      PREDICTIVE_ABSENTEE_DISTRESS:     { base_weight: 0.15, half_life_days: 90 },
      PREDICTIVE_MARKET_STRESS:         { base_weight: 0.20, half_life_days: 45 },
    },

    decayConfig: {
      function: 'exponential',
      floor: 0.05,
    },

    promotionThreshold: '40.0000', // Score >= 40 triggers promotion evaluation

    tierThresholds: {
      A: 80,   // Top tier: high-confidence, multi-signal, or confirmed distress
      B: 60,   // Mid tier: moderate signals
      C: 40,   // Entry tier: early signals worth nurturing
    },

    confidenceConfig: {
      min_signals_for_high: 5,      // 5+ signals needed for max signal-count confidence
      diversity_bonus: 0.05,         // Per unique event type
      confirmed_presence_bonus: 0.25, // Large boost when confirmed distress exists
      source_count_weight: 0.05,     // Per unique source
    },

    active: true,
  });

  logger.info('Scoring model v1.0 seeded');
}

export async function seedSystemSettings(): Promise<void> {
  const existing = await db.select().from(systemSettings).limit(1);
  if (existing.length > 0) {
    logger.info('System settings already exist, skipping seed');
    return;
  }

  // Sentinel webhook URL — empty by default, set when Sentinel is ready
  // Charter: "If sentinel_webhook_url exists → POST. If not → store event only."
  await db.insert(systemSettings).values([
    {
      key: 'sentinel_webhook_url',
      value: { url: null },
    },
    {
      key: 'ingestion_schedule',
      value: { interval_hours: 6, enabled: true },
    },
  ]);

  logger.info('System settings seeded');
}
