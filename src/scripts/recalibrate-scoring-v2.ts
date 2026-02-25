/**
 * Scoring model recalibration to v2.0.0
 *
 * - Sets all existing configs to active = false
 * - Inserts new v2.0.0 config with research-backed weights
 * - Preserves all existing config rows (Charter v2.3 invariant)
 *
 * Usage: npx tsx src/scripts/recalibrate-scoring-v2.ts
 */
import 'dotenv/config';
import { db } from '../db/connection.js';
import { scoringModelConfigs } from '../db/schema/index.js';
import { sql } from 'drizzle-orm';

const VERSION = '2.0.0';

const confirmedWeights = {
  NOTICE_OF_DEFAULT: { base_weight: 0.95, half_life_days: 120 },
  NOTICE_OF_TRUSTEE_SALE: { base_weight: 0.95, half_life_days: 90 },
  BANKRUPTCY: { base_weight: 0.90, half_life_days: 150 },
  LIS_PENDENS: { base_weight: 0.85, half_life_days: 120 },
  PROBATE: { base_weight: 0.85, half_life_days: 240 },
  JUDGMENT_LIEN: { base_weight: 0.60, half_life_days: 90 },
  HOA_LIEN: { base_weight: 0.55, half_life_days: 90 },
  TAX_LIEN: { base_weight: 0.50, half_life_days: 120 },
  MECHANIC_LIEN: { base_weight: 0.45, half_life_days: 90 },
  CODE_ENFORCEMENT: { base_weight: 0.40, half_life_days: 60 },
  TAX_DELINQUENCY: { base_weight: 0.35, half_life_days: 150 },
};

const predictiveWeights = {
  PREDICTIVE_DIVORCE_FILING: { base_weight: 0.75, half_life_days: 90 },
  PREDICTIVE_PAYMENT_STRESS: { base_weight: 0.55, half_life_days: 60 },
  PREDICTIVE_VACANCY_SIGNAL: { base_weight: 0.50, half_life_days: 45 },
  PREDICTIVE_LISTING_WITHDRAWAL: { base_weight: 0.45, half_life_days: 60 },
  PREDICTIVE_CODE_VIOLATION: { base_weight: 0.35, half_life_days: 45 },
  PREDICTIVE_EQUITY_DECLINE: { base_weight: 0.30, half_life_days: 60 },
  PREDICTIVE_OWNERSHIP_FATIGUE: { base_weight: 0.30, half_life_days: 120 },
  PREDICTIVE_DEFERRED_MAINTENANCE: { base_weight: 0.25, half_life_days: 60 },
  PREDICTIVE_MARKET_STRESS: { base_weight: 0.15, half_life_days: 45 },
  PREDICTIVE_ABSENTEE_DISTRESS: { base_weight: 0.15, half_life_days: 120 },
};

const decayConfig = {
  function: 'exponential',
  floor: 0.02,
  aggressive_after_days: 730,
};

const tierThresholds = { A: 65, B: 45, C: 25 };

const confidenceConfig = {
  diversity_bonus: 0.12,
  source_count_weight: 0.08,
  min_signals_for_high: 3,
  confirmed_presence_bonus: 0.30,
};

const equityMultiplierConfig = {
  ranges: [
    { min: 0, max: 10000, multiplier: 0.5 },
    { min: 10000, max: 25000, multiplier: 0.7 },
    { min: 25000, max: 75000, multiplier: 0.9 },
    { min: 75000, max: 150000, multiplier: 1.1 },
    { min: 150000, max: 300000, multiplier: 1.2 },
    { min: 300000, multiplier: 1.3 },
  ],
  default_multiplier: 1.0,
};

const dealScoreWeights = {
  equity_weight: 0.35,
  mortgage_weight: 0.25,
  absentee_weight: 0.15,
  ownership_weight: 0.25,
  equity_factors: { floor: 0.15, low: 0.4, mid: 0.7, high: 1.0 },
  equity_thresholds: { low: 25000, mid: 75000, high: 200000 },
  mortgage_severity: {
    UNKNOWN: 0.1,
    CURRENT: 0.15,
    FREE_AND_CLEAR: 0.45,
    LATE_30: 0.55,
    LATE_60: 0.75,
    LATE_90: 0.88,
    DEFAULT: 0.95,
    FORECLOSURE: 1.0,
  },
  ownership_factors: { floor: 0.2, short: 0.4, long: 1.0 },
  ownership_thresholds: { short_months: 24, long_months: 120 },
};

const compositeWeights = { motivation_weight: 0.65, deal_weight: 0.35 };
const suppressionConfig = { mortgage_statuses: [], custom_flags: [] };

async function main() {
  console.log('\n  Dominion Ranger — Scoring Model Recalibration v2.0.0');
  console.log('  ═══════════════════════════════════════════════════\n');

  // Step 1: Deactivate all existing configs
  const deactivated = await db.execute(
    sql`UPDATE scoring_model_configs SET active = false WHERE active = true`,
  );
  console.log(`  Deactivated existing configs`);

  // Step 2: Check if v2.0.0 already exists (idempotent)
  const [existing] = await db
    .select({ version: scoringModelConfigs.version })
    .from(scoringModelConfigs)
    .where(sql`${scoringModelConfigs.version} = ${VERSION}`);

  if (existing) {
    console.log(`  Config v${VERSION} already exists — activating it`);
    await db.execute(
      sql`UPDATE scoring_model_configs SET active = true WHERE version = ${VERSION}`,
    );
  } else {
    // Step 3: Insert new v2.0.0 config
    await db.insert(scoringModelConfigs).values({
      version: VERSION,
      confirmedWeights,
      predictiveWeights,
      decayConfig,
      promotionThreshold: '30',
      tierThresholds,
      confidenceConfig,
      equityMultiplierConfig,
      dealScoreWeights,
      compositeWeights,
      suppressionConfig,
      active: true,
    });
    console.log(`  Inserted scoring_model_configs v${VERSION}`);
  }

  // Step 4: Verify
  const [active] = await db
    .select()
    .from(scoringModelConfigs)
    .where(sql`${scoringModelConfigs.active} = true`);

  if (!active || active.version !== VERSION) {
    console.error('  FAILED: Active config is not v2.0.0');
    process.exit(1);
  }

  console.log('\n  Config Summary:');
  console.log(`  Version:             ${active.version}`);
  console.log(`  Promotion threshold: ${active.promotionThreshold}`);
  console.log(`  Tier thresholds:     A=${tierThresholds.A}, B=${tierThresholds.B}, C=${tierThresholds.C}`);
  console.log(`  Decay floor:         ${decayConfig.floor}`);
  console.log(`  TAX_DELINQUENCY:     ${confirmedWeights.TAX_DELINQUENCY.base_weight} (was 0.80)`);
  console.log(`  NOTICE_OF_DEFAULT:   ${confirmedWeights.NOTICE_OF_DEFAULT.base_weight}`);
  console.log(`  Diversity bonus:     ${confidenceConfig.diversity_bonus} (was 0.05)`);
  console.log(`  Active:              ${active.active}`);
  console.log('\n  Done.\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
