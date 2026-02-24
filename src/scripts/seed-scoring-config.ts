/**
 * Shared scoring config seed — single source of truth for the v1.0.0 config.
 * Used by: recover-system.ts, server startup auto-seed, migration 0008.
 */
import { db } from '../db/connection.js';
import { scoringModelConfigs } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

export const SCORING_CONFIG_V1 = {
  version: '1.0.0' as const,
  confirmedWeights: {
    NOTICE_OF_DEFAULT: 25,
    LIS_PENDENS: 20,
    TAX_DELINQUENCY: 15,
    PROBATE: 30,
    BANKRUPTCY: 20,
    HOA_LIEN: 10,
    CODE_ENFORCEMENT: 8,
    NOTICE_OF_TRUSTEE_SALE: 25,
    TAX_LIEN: 12,
    MECHANIC_LIEN: 8,
    JUDGMENT_LIEN: 10,
    SHERIFF_SALE: 30,
  },
  predictiveWeights: {
    PREDICTIVE_EQUITY_DECLINE: 5,
    PREDICTIVE_PAYMENT_STRESS: 8,
    PREDICTIVE_OWNERSHIP_FATIGUE: 6,
    PREDICTIVE_VACANCY_SIGNAL: 7,
    PREDICTIVE_LISTING_WITHDRAWAL: 10,
    PREDICTIVE_DIVORCE_FILING: 12,
    PREDICTIVE_CODE_VIOLATION: 5,
    PREDICTIVE_DEFERRED_MAINTENANCE: 4,
    PREDICTIVE_ABSENTEE_DISTRESS: 6,
    PREDICTIVE_MARKET_STRESS: 3,
  },
  decayConfig: { halfLifeDays: 180, minWeight: 0.1, maxAgeDays: 730 },
  promotionThreshold: 50,
  tierThresholds: { A: 80, B: 60, C: 40 },
  confidenceConfig: {
    minEvents: 1,
    recencyBoostDays: 30,
    recencyBoostMultiplier: 1.2,
    multiSourceBonus: 5,
    minSourcesForBonus: 2,
  },
  equityMultiplierConfig: {
    ranges: [
      { min: 0, max: 20, multiplier: 0.7 },
      { min: 20, max: 50, multiplier: 1.0 },
      { min: 50, max: 80, multiplier: 1.3 },
      { min: 80, multiplier: 1.5 },
    ],
    default_multiplier: 1.0,
  },
  dealScoreWeights: {
    equity_weight: 0.3,
    ownership_weight: 0.2,
    absentee_weight: 15,
    mortgage_weight: 0.1,
    equity_thresholds: { low: 20, mid: 50, high: 80 },
    ownership_thresholds: { short_months: 24, long_months: 120 },
    mortgage_severity: { CURRENT: 0, DELINQUENT: 10, DEFAULT: 20, FORECLOSURE: 25, UNKNOWN: 5 },
    equity_factors: { high: 100, mid: 70, low: 40, floor: 10 },
    ownership_factors: { long: 80, short: 40, floor: 10 },
  },
  compositeWeights: { motivationWeight: 0.6, dealWeight: 0.4 },
  suppressionConfig: {
    mortgage_statuses: ['FORECLOSURE_COMPLETE'],
    custom_flags: ['DNC', 'LITIGANT', 'OPT_OUT'],
  },
};

export async function seedScoringConfig(): Promise<void> {
  const existing = await db
    .select()
    .from(scoringModelConfigs)
    .where(eq(scoringModelConfigs.version, '1.0.0'));

  if (existing.length > 0) {
    await db.update(scoringModelConfigs).set({
      confirmedWeights: SCORING_CONFIG_V1.confirmedWeights,
      predictiveWeights: SCORING_CONFIG_V1.predictiveWeights,
      decayConfig: SCORING_CONFIG_V1.decayConfig,
      promotionThreshold: SCORING_CONFIG_V1.promotionThreshold.toString(),
      tierThresholds: SCORING_CONFIG_V1.tierThresholds,
      confidenceConfig: SCORING_CONFIG_V1.confidenceConfig,
      equityMultiplierConfig: SCORING_CONFIG_V1.equityMultiplierConfig,
      dealScoreWeights: SCORING_CONFIG_V1.dealScoreWeights,
      compositeWeights: SCORING_CONFIG_V1.compositeWeights,
      suppressionConfig: SCORING_CONFIG_V1.suppressionConfig,
      active: true,
    }).where(eq(scoringModelConfigs.version, '1.0.0'));
  } else {
    await db.insert(scoringModelConfigs).values({
      version: SCORING_CONFIG_V1.version,
      confirmedWeights: SCORING_CONFIG_V1.confirmedWeights,
      predictiveWeights: SCORING_CONFIG_V1.predictiveWeights,
      decayConfig: SCORING_CONFIG_V1.decayConfig,
      promotionThreshold: SCORING_CONFIG_V1.promotionThreshold.toString(),
      tierThresholds: SCORING_CONFIG_V1.tierThresholds,
      confidenceConfig: SCORING_CONFIG_V1.confidenceConfig,
      equityMultiplierConfig: SCORING_CONFIG_V1.equityMultiplierConfig,
      dealScoreWeights: SCORING_CONFIG_V1.dealScoreWeights,
      compositeWeights: SCORING_CONFIG_V1.compositeWeights,
      suppressionConfig: SCORING_CONFIG_V1.suppressionConfig,
      active: true,
    });
  }
}
