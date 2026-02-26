#!/usr/bin/env tsx
/**
 * Seed scoring model config if none exists.
 *
 * Usage: npm run db:seed:scoring
 *
 * Idempotent: running multiple times does not create duplicates.
 * Logs: "inserted" vs "already present"
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../db/connection.js';
import { scoringModelConfigs } from '../db/schema/index.js';

const VERSION = 'seed-config-v1';

/** Minimal config with sensible defaults for scoring to run */
const DEFAULT_CONFIG = {
  version: VERSION,
  confirmedWeights: {
    NOTICE_OF_DEFAULT: { base_weight: 0.95, half_life_days: 90 },
    LIS_PENDENS: { base_weight: 0.85, half_life_days: 90 },
    TAX_DELINQUENCY: { base_weight: 0.8, half_life_days: 120 },
    PROBATE: { base_weight: 0.7, half_life_days: 180 },
    BANKRUPTCY: { base_weight: 0.85, half_life_days: 120 },
    HOA_LIEN: { base_weight: 0.65, half_life_days: 90 },
    CODE_ENFORCEMENT: { base_weight: 0.6, half_life_days: 60 },
    NOTICE_OF_TRUSTEE_SALE: { base_weight: 0.9, half_life_days: 60 },
    TAX_LIEN: { base_weight: 0.75, half_life_days: 120 },
    MECHANIC_LIEN: { base_weight: 0.6, half_life_days: 90 },
    JUDGMENT_LIEN: { base_weight: 0.7, half_life_days: 90 },
  },
  predictiveWeights: {
    PREDICTIVE_EQUITY_DECLINE: { base_weight: 0.35, half_life_days: 60 },
    PREDICTIVE_PAYMENT_STRESS: { base_weight: 0.4, half_life_days: 45 },
    PREDICTIVE_OWNERSHIP_FATIGUE: { base_weight: 0.25, half_life_days: 90 },
    PREDICTIVE_VACANCY_SIGNAL: { base_weight: 0.3, half_life_days: 30 },
    PREDICTIVE_LISTING_WITHDRAWAL: { base_weight: 0.35, half_life_days: 45 },
    PREDICTIVE_DIVORCE_FILING: { base_weight: 0.4, half_life_days: 60 },
    PREDICTIVE_CODE_VIOLATION: { base_weight: 0.25, half_life_days: 30 },
    PREDICTIVE_DEFERRED_MAINTENANCE: { base_weight: 0.2, half_life_days: 60 },
    PREDICTIVE_ABSENTEE_DISTRESS: { base_weight: 0.15, half_life_days: 90 },
    PREDICTIVE_MARKET_STRESS: { base_weight: 0.2, half_life_days: 45 },
  },
  decayConfig: { function: 'exponential' as const, floor: 0.05 },
  promotionThreshold: '40.0000',
  tierThresholds: { A: 80, B: 60, C: 40 },
  confidenceConfig: {
    min_signals_for_high: 5,
    diversity_bonus: 0.05,
    confirmed_presence_bonus: 0.25,
    source_count_weight: 0.05,
  },
  equityMultiplierConfig: {
    ranges: [
      { min: 0, max: 25000, multiplier: 0.7 },
      { min: 25000, max: 75000, multiplier: 0.85 },
      { min: 75000, max: 200000, multiplier: 1.0 },
      { min: 200000, multiplier: 1.15 },
    ],
    default_multiplier: 1.0,
  },
  dealScoreWeights: {
    equity_weight: 0.3,
    ownership_weight: 0.3,
    absentee_weight: 0.3,
    mortgage_weight: 0.1,
    equity_thresholds: { low: 30000, mid: 80000, high: 200000 },
    ownership_thresholds: { short_months: 24, long_months: 120, very_long_months: 240 },
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
    equity_factors: { high: 1.0, mid: 0.7, low: 0.4, floor: 0.15 },
    ownership_factors: { very_long: 1.2, long: 1.0, short: 0.5, floor: 0.2 },
  },
  compositeWeights: { motivation_weight: 0.55, deal_weight: 0.45 },
  suppressionConfig: { mortgage_statuses: [] as string[], custom_flags: [] as string[] },
  active: true,
};

async function main(): Promise<void> {
  const [existing] = await db
    .select({ version: scoringModelConfigs.version })
    .from(scoringModelConfigs)
    .where(eq(scoringModelConfigs.active, true))
    .limit(1);

  if (existing) {
    console.log('already present:', existing.version);
    await closeDatabase();
    process.exit(0);
    return;
  }

  await db.insert(scoringModelConfigs).values(DEFAULT_CONFIG);
  console.log('inserted:', VERSION);
  await closeDatabase();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
