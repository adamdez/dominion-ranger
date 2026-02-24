#!/usr/bin/env tsx
/**
 * Dominion Ranger — System Recovery Script
 *
 * One-command restore after database wipe. Connects directly to DB (no server required).
 *
 * Usage:
 *   npx tsx src/scripts/recover-system.ts --status
 *   npx tsx src/scripts/recover-system.ts --seed-config
 *   npx tsx src/scripts/recover-system.ts --score
 *   npx tsx src/scripts/recover-system.ts --import spokane.csv
 *   npx tsx src/scripts/recover-system.ts --full spokane.csv
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { db, closeDatabase } from '../db/connection.js';
import {
  properties,
  distressEvents,
  scoringRecords,
  signalAccumulation,
  promotedLeads,
  leadInstances,
  scoringModelConfigs,
  users,
  featureFlags,
} from '../db/schema/index.js';
import { runReimportCsv } from './reimport-csv.js';
import { recalculateSignalAccumulation } from '../modules/signals/service.js';
import { scoreProperty } from '../modules/scoring/service.js';
import { evaluateForPromotion } from '../modules/promotion/service.js';
import { invalidateConfigCache } from '../modules/scoring/service.js';

const IMPORT_DIR = './data/imports';

// ─── Definitive scoring config (from seed-scoring-model.ts) ───
const SCORING_CONFIG = {
  version: '1.0.0',
  confirmedWeights: {
    NOTICE_OF_DEFAULT: { base_weight: 0.95, half_life_days: 90 },
    NOTICE_OF_TRUSTEE_SALE: { base_weight: 0.9, half_life_days: 60 },
    LIS_PENDENS: { base_weight: 0.85, half_life_days: 90 },
    TAX_DELINQUENCY: { base_weight: 0.8, half_life_days: 120 },
    TAX_LIEN: { base_weight: 0.75, half_life_days: 120 },
    BANKRUPTCY: { base_weight: 0.85, half_life_days: 120 },
    PROBATE: { base_weight: 0.7, half_life_days: 180 },
    HOA_LIEN: { base_weight: 0.65, half_life_days: 90 },
    MECHANIC_LIEN: { base_weight: 0.6, half_life_days: 90 },
    JUDGMENT_LIEN: { base_weight: 0.7, half_life_days: 90 },
    CODE_ENFORCEMENT: { base_weight: 0.6, half_life_days: 60 },
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
    equity_factors: { high: 1.0, mid: 0.7, low: 0.4, floor: 0.15 },
    ownership_factors: { long: 1.0, short: 0.5, floor: 0.2 },
  },
  compositeWeights: { motivation_weight: 0.65, deal_weight: 0.35 },
  suppressionConfig: { mortgage_statuses: [] as string[], custom_flags: [] as string[] },
  active: true,
};

// ─── Status ───────────────────────────────────────────────────
interface StatusCounts {
  properties: number;
  distressEvents: number;
  scoringRecords: number;
  signalAccumulation: number;
  promotedLeads: number;
  leadInstances: number;
  scoringConfigs: number;
  configVersion: string | null;
  users: number;
  featureFlags: number;
}

async function getStatus(): Promise<StatusCounts> {
  const [props] = await db.select({ count: sql<number>`count(*)::int` }).from(properties);
  const [evts] = await db.select({ count: sql<number>`count(*)::int` }).from(distressEvents);
  const [scores] = await db.select({ count: sql<number>`count(*)::int` }).from(scoringRecords);
  const [acc] = await db.select({ count: sql<number>`count(*)::int` }).from(signalAccumulation);
  const [promo] = await db.select({ count: sql<number>`count(*)::int` }).from(promotedLeads);
  const [leads] = await db.select({ count: sql<number>`count(*)::int` }).from(leadInstances);
  const configRows = await db
    .select({ version: scoringModelConfigs.version })
    .from(scoringModelConfigs)
    .where(eq(scoringModelConfigs.active, true));
  const [usrs] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  const [flags] = await db.select({ count: sql<number>`count(*)::int` }).from(featureFlags);

  return {
    properties: props?.count ?? 0,
    distressEvents: evts?.count ?? 0,
    scoringRecords: scores?.count ?? 0,
    signalAccumulation: acc?.count ?? 0,
    promotedLeads: promo?.count ?? 0,
    leadInstances: leads?.count ?? 0,
    scoringConfigs: configRows.length,
    configVersion: configRows[0]?.version ?? null,
    users: usrs?.count ?? 0,
    featureFlags: flags?.count ?? 0,
  };
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function printStatus(counts: StatusCounts, showIssues = true): void {
  console.log('\n📊 DOMINION RANGER — System Status');
  console.log('──────────────────────────────────────────────────');
  console.log(`Properties:          ${formatNumber(counts.properties)}`);
  console.log(`Distress Events:     ${formatNumber(counts.distressEvents)}`);
  console.log(`Scoring Records:     ${formatNumber(counts.scoringRecords)}`);
  console.log(`Signal Accumulation: ${formatNumber(counts.signalAccumulation)}`);
  console.log(`Promoted Leads:      ${formatNumber(counts.promotedLeads)}`);
  console.log(`Lead Instances:      ${formatNumber(counts.leadInstances)}`);
  const configStr =
    counts.scoringConfigs > 0 && counts.configVersion
      ? `${counts.scoringConfigs} (${counts.configVersion}, active)`
      : String(counts.scoringConfigs);
  console.log(`Scoring Configs:     ${configStr}`);
  console.log(`Users:               ${formatNumber(counts.users)}`);
  console.log(`Feature Flags:       ${formatNumber(counts.featureFlags)}`);

  if (showIssues) {
    const issues: string[] = [];
    if (counts.properties === 0) issues.push('Properties table is empty — need CSV import');
    if (counts.scoringConfigs === 0) issues.push('No scoring config — run --seed-config');
    if (counts.distressEvents > 0 && counts.signalAccumulation === 0)
      issues.push('Signal accumulation empty — run --score');
    if (counts.scoringRecords > 0 && counts.promotedLeads === 0 && counts.distressEvents > 0)
      issues.push('No promoted leads — run --score to evaluate promotion');

    if (issues.length > 0) {
      console.log('\n⚠️ Issues:');
      for (const issue of issues) {
        console.log(`  ❌ ${issue}`);
      }
    } else {
      console.log('\n✅ System healthy');
    }
  }
  console.log('');
}

// ─── Seed config (idempotent: insert or update) ─────────────────
async function seedConfig(): Promise<{ created: boolean; version: string }> {
  const [existing] = await db
    .select()
    .from(scoringModelConfigs)
    .where(eq(scoringModelConfigs.active, true))
    .limit(1);

  if (existing) {
    await db
      .update(scoringModelConfigs)
      .set({
        confirmedWeights: SCORING_CONFIG.confirmedWeights,
        predictiveWeights: SCORING_CONFIG.predictiveWeights,
        decayConfig: SCORING_CONFIG.decayConfig,
        promotionThreshold: SCORING_CONFIG.promotionThreshold,
        tierThresholds: SCORING_CONFIG.tierThresholds,
        confidenceConfig: SCORING_CONFIG.confidenceConfig,
        equityMultiplierConfig: SCORING_CONFIG.equityMultiplierConfig,
        dealScoreWeights: SCORING_CONFIG.dealScoreWeights,
        compositeWeights: SCORING_CONFIG.compositeWeights,
        suppressionConfig: SCORING_CONFIG.suppressionConfig,
      })
      .where(eq(scoringModelConfigs.version, existing.version));
    invalidateConfigCache();
    return { created: false, version: existing.version };
  }

  await db.insert(scoringModelConfigs).values(SCORING_CONFIG);
  invalidateConfigCache();
  return { created: true, version: SCORING_CONFIG.version };
}

// ─── Populate signal accumulation (bulk) ───────────────────────
async function populateSignalAccumulation(): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO signal_accumulation (
      dominion_lead_id, first_signal_detected_at, signal_count_7d, signal_count_30d,
      total_signal_count, signal_acceleration_rate, signal_density_score, updated_at
    )
    SELECT
      de.dominion_lead_id,
      MIN(COALESCE(de.trigger_event_date, de.created_at)),
      COUNT(*) FILTER (WHERE COALESCE(de.trigger_event_date, de.created_at) >= NOW() - INTERVAL '7 days')::int,
      COUNT(*) FILTER (WHERE COALESCE(de.trigger_event_date, de.created_at) >= NOW() - INTERVAL '30 days')::int,
      COUNT(*)::int,
      0, 0, NOW()
    FROM distress_events de
    GROUP BY de.dominion_lead_id
    ON CONFLICT (dominion_lead_id) DO UPDATE SET
      total_signal_count = EXCLUDED.total_signal_count,
      signal_count_7d = EXCLUDED.signal_count_7d,
      signal_count_30d = EXCLUDED.signal_count_30d,
      updated_at = NOW()
  `);
  const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(signalAccumulation);
  return count ?? 0;
}

// ─── Batch score + promote ─────────────────────────────────────
async function runScoringAndPromotion(): Promise<{ scored: number; promoted: number; errors: number }> {
  const toScore = await db
    .select({ dominionLeadId: properties.dominionLeadId })
    .from(properties);

  const batchSize = 20;
  let scored = 0;
  let promoted = 0;
  let errors = 0;
  const startTime = Date.now();
  const total = toScore.length;

  for (let i = 0; i < toScore.length; i += batchSize) {
    const batch = toScore.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (row) => {
        const [eventCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(distressEvents)
          .where(eq(distressEvents.dominionLeadId, row.dominionLeadId));
        if (!eventCount || eventCount.count === 0) return null;

        await recalculateSignalAccumulation(row.dominionLeadId);
        const result = await scoreProperty(row.dominionLeadId);
        const promo = await evaluateForPromotion(row.dominionLeadId, result);
        return { scored: 1, promoted: promo ? 1 : 0 };
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        scored += r.value.scored;
        promoted += r.value.promoted;
      } else if (r.status === 'rejected') {
        errors++;
      }
    }

    const processed = Math.min(i + batchSize, total);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = elapsed > 0 ? (processed / elapsed).toFixed(1) : '0';
    if (processed % 500 < batchSize || processed === total) {
      console.log(`  Progress: ${processed}/${total} (${rate}/sec, ${errors} errors)`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  ✅ Scoring complete: ${scored} scored, ${errors} errors in ${elapsed}s`);
  return { scored, promoted, errors };
}

// ─── Command handlers ───────────────────────────────────────────
async function cmdStatus(): Promise<void> {
  const counts = await getStatus();
  printStatus(counts);
}

async function cmdSeedConfig(): Promise<void> {
  const { created, version } = await seedConfig();
  if (created) {
    console.log(`  ✅ Scoring config seeded (${version})\n`);
  } else {
    console.log(`  ✅ Scoring config updated (${version}, idempotent)\n`);
  }
}

async function cmdImport(filename: string): Promise<void> {
  const filePath =
    filename.includes('/') || filename.includes('\\')
      ? filename
      : join(IMPORT_DIR, filename);

  console.log(`\n📥 Import: ${filename}\n`);
  const result = await runReimportCsv(filePath);
  console.log(`   Imported: ${result.created + result.updated} properties, ${result.eventsCreated} events\n`);

  console.log('  Seeding scoring config...');
  await seedConfig();
  console.log('  ✅ Config seeded\n');

  console.log('  Populating signal accumulation...');
  const accCount = await populateSignalAccumulation();
  console.log(`  ✅ Signal accumulation populated: ${formatNumber(accCount)}\n`);
}

async function cmdScore(): Promise<void> {
  await seedConfig();
  console.log('  ✅ Config seeded\n');

  console.log('  Populating signal accumulation...');
  const accCount = await populateSignalAccumulation();
  console.log(`  ✅ Signal accumulation: ${formatNumber(accCount)}\n`);

  const toScore = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(properties);
  const total = toScore[0]?.count ?? 0;
  console.log(`⚡ Scoring ${formatNumber(total)} properties...`);

  const { scored, promoted, errors } = await runScoringAndPromotion();

  console.log('\n🏆 Running promotion...');
  const skipped = total - promoted;
  console.log(`  ✅ Promoted: ${promoted}, Skipped: ${formatNumber(skipped)}\n`);
}

async function cmdFull(filename: string): Promise<void> {
  const filePath =
    filename.includes('/') || filename.includes('\\')
      ? filename
      : join(IMPORT_DIR, filename);

  console.log(`\n🚀 FULL RECOVERY: ${filename}\n`);

  console.log('Step 1/5: Import CSV...');
  const result = await runReimportCsv(filePath);
  console.log(`   Imported: ${result.created + result.updated} properties, ${result.eventsCreated} events\n`);

  console.log('Step 2/5: Seed scoring config...');
  const { version } = await seedConfig();
  console.log(`  ✅ Scoring config seeded (${version})\n`);

  console.log('Step 3/5: Populate signal accumulation...');
  const accCount = await populateSignalAccumulation();
  console.log(`  ✅ Signal accumulation populated: ${formatNumber(accCount)}\n`);

  console.log('Step 4/5: Batch scoring...');
  const toScore = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(properties);
  const total = toScore[0]?.count ?? 0;
  console.log(`  ⚡ Scoring ${formatNumber(total)} properties...`);
  const { scored, promoted } = await runScoringAndPromotion();
  console.log(`  ✅ Scoring complete: ${formatNumber(scored)} scored\n`);

  console.log('Step 5/5: Promotion...');
  console.log(`  ✅ Promoted: ${promoted}\n`);

  console.log('📊 Final Status:');
  const counts = await getStatus();
  printStatus(counts, false);
}

// ─── CLI ──────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args.find((a) => a.startsWith('--'));
  const fileArg = args.find((a) => !a.startsWith('--'));

  try {
    if (cmd === '--status') {
      await cmdStatus();
    } else if (cmd === '--seed-config') {
      await cmdSeedConfig();
    } else if (cmd === '--score') {
      await cmdScore();
    } else if (cmd === '--import') {
      if (!fileArg) {
        console.error('Usage: npx tsx src/scripts/recover-system.ts --import <filename.csv>');
        process.exit(1);
      }
      await cmdImport(fileArg);
    } else if (cmd === '--full') {
      if (!fileArg) {
        console.error('Usage: npx tsx src/scripts/recover-system.ts --full <filename.csv>');
        process.exit(1);
      }
      await cmdFull(fileArg);
    } else {
      console.error('Usage: npx tsx src/scripts/recover-system.ts --status|--seed-config|--score|--import <file>|--full <file>');
      process.exit(1);
    }
  } finally {
    await closeDatabase();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
