/**
 * DOMINION RANGER — System Recovery Script
 * 
 * Usage:
 *   npx tsx src/scripts/recover-system.ts --seed-config          # Just seed scoring config
 *   npx tsx src/scripts/recover-system.ts --import spokane.csv    # Import CSV + seed + accumulate
 *   npx tsx src/scripts/recover-system.ts --full spokane.csv      # Full recovery: import + seed + score + promote
 *   npx tsx src/scripts/recover-system.ts --score                 # Just run scoring + promotion
 *   npx tsx src/scripts/recover-system.ts --status                # Check system health
 */

import 'dotenv/config';
import { db } from '../db/connection.js';
import {
  scoringModelConfigs,
  properties,
  distressEvents,
  scoringRecords,
  signalAccumulation,
} from '../db/schema/index.js';
import { eq, sql, count } from 'drizzle-orm';
import { applyAppendOnlyInvariants } from '../db/invariants.js';
import { seedScoringConfig, SCORING_CONFIG_V1 } from './seed-scoring-config.js';

async function getStatus(): Promise<void> {
  const [propCount] = await db.select({ c: count() }).from(properties);
  const [eventCount] = await db.select({ c: count() }).from(distressEvents);
  const [scoreCount] = await db.select({ c: count() }).from(scoringRecords);
  const [accumCount] = await db.select({ c: count() }).from(signalAccumulation);
  const configs = await db
    .select()
    .from(scoringModelConfigs)
    .where(eq(scoringModelConfigs.active, true));

  console.log('\n  DOMINION RANGER — System Status');
  console.log('-'.repeat(50));
  console.log(`Properties:          ${propCount.c}`);
  console.log(`Distress Events:     ${eventCount.c}`);
  console.log(`Scoring Records:     ${scoreCount.c}`);
  console.log(`Signal Accumulation: ${accumCount.c}`);
  console.log(`Scoring Configs:     ${configs.length}`);

  if (configs.length > 0) {
    const cfg = configs[0];
    const emc = cfg.equityMultiplierConfig as Record<string, unknown> | null;
    const dsw = cfg.dealScoreWeights as Record<string, unknown> | null;
    const cw = cfg.confirmedWeights as Record<string, unknown> | null;
    console.log(`  Version:           ${cfg.version}`);
    console.log(`  Has ranges:        ${Array.isArray(emc?.ranges)}`);
    console.log(`  Has equity_thresh: ${!!dsw?.equity_thresholds}`);
    console.log(`  Confirmed weights: ${Object.keys(cw ?? {}).length} event types`);
  }

  const issues: string[] = [];
  if (propCount.c === 0) issues.push('Properties table is empty — need CSV import');
  if (eventCount.c === 0) issues.push('No distress events');
  if (configs.length === 0) issues.push('No scoring config — run --seed-config');
  if (accumCount.c === 0 && Number(propCount.c) > 0)
    issues.push('Signal accumulation empty — run --accumulate');
  if (scoreCount.c === 0 && Number(propCount.c) > 0)
    issues.push('No scoring records — run --score');

  if (issues.length > 0) {
    console.log('\nIssues:');
    issues.forEach((i) => console.log(`  ${i}`));
  } else {
    console.log('\nSystem healthy');
  }
  console.log('');
}

async function populateSignalAccumulation(): Promise<void> {
  console.log('Populating signal_accumulation...');

  await db.execute(sql`
    INSERT INTO signal_accumulation (dominion_lead_id, first_signal_detected_at, signal_count_7d, signal_count_30d, total_signal_count, signal_acceleration_rate, signal_density_score, updated_at)
    SELECT 
      de.dominion_lead_id, 
      MIN(de.trigger_event_date), 
      COUNT(*) FILTER (WHERE de.trigger_event_date >= NOW() - INTERVAL '7 days'), 
      COUNT(*) FILTER (WHERE de.trigger_event_date >= NOW() - INTERVAL '30 days'), 
      COUNT(*), 
      0, 
      0, 
      NOW()
    FROM distress_events de 
    GROUP BY de.dominion_lead_id
    ON CONFLICT (dominion_lead_id) DO UPDATE SET 
      total_signal_count = EXCLUDED.total_signal_count, 
      signal_count_7d = EXCLUDED.signal_count_7d, 
      signal_count_30d = EXCLUDED.signal_count_30d, 
      updated_at = NOW()
  `);

  const [result] = await db.select({ c: count() }).from(signalAccumulation);
  console.log(`  Signal accumulation populated: ${result.c} properties`);
}

async function runBatchScoring(): Promise<void> {
  const { scoreProperty } = await import('../modules/scoring/service.js');

  const allProperties = await db
    .select({ dominionLeadId: properties.dominionLeadId })
    .from(properties);

  console.log(`Scoring ${allProperties.length} properties...`);

  let scored = 0;
  let errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < allProperties.length; i += 10) {
    const batch = allProperties.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map((p) => scoreProperty(p.dominionLeadId)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') scored++;
      else errors++;
    }

    if ((scored + errors) % 500 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = ((scored + errors) / parseFloat(elapsed)).toFixed(1);
      console.log(
        `  Progress: ${scored + errors}/${allProperties.length} (${rate}/sec, ${errors} errors)`,
      );
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  Scoring complete: ${scored} scored, ${errors} errors in ${totalTime}s`);
}

async function runPromotion(): Promise<void> {
  const { scoreProperty } = await import('../modules/scoring/service.js');
  const { evaluateForPromotion } = await import('../modules/promotion/service.js');

  const allProperties = await db
    .select({ dominionLeadId: properties.dominionLeadId })
    .from(properties);

  console.log(`Running promotion for ${allProperties.length} properties...`);

  let promoted = 0;
  let skipped = 0;
  let errors = 0;

  for (const p of allProperties) {
    try {
      const score = await scoreProperty(p.dominionLeadId);
      const result = await evaluateForPromotion(p.dominionLeadId, score);
      if (result) promoted++;
      else skipped++;
    } catch {
      errors++;
    }
  }

  console.log(`  Promoted: ${promoted}, Skipped: ${skipped}, Errors: ${errors}`);
}

// ── Main ────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

try {
  await applyAppendOnlyInvariants();

  switch (command) {
    case '--status':
      await getStatus();
      break;

    case '--seed-config':
      console.log('Seeding scoring config v1.0.0...');
      await seedScoringConfig();
      console.log('  Scoring config seeded');
      await getStatus();
      break;

    case '--accumulate':
      await populateSignalAccumulation();
      break;

    case '--score':
      console.log('Seeding config before scoring...');
      await seedScoringConfig();
      await populateSignalAccumulation();
      await runBatchScoring();
      await runPromotion();
      await getStatus();
      break;

    case '--import': {
      const csvFile = args[1];
      if (!csvFile) {
        console.error('Usage: --import <filename.csv>');
        process.exit(1);
      }
      const { execSync } = await import('child_process');
      console.log(`Importing ${csvFile}...`);
      execSync(`npx tsx src/scripts/reimport-csv.ts ${csvFile}`, { stdio: 'inherit' });
      await seedScoringConfig();
      await populateSignalAccumulation();
      console.log('\nImport complete. Run --score to score and promote.');
      break;
    }

    case '--full': {
      const csvFile = args[1];
      if (!csvFile) {
        console.error('Usage: --full <filename.csv>');
        process.exit(1);
      }
      const { execSync } = await import('child_process');
      console.log(`\nFULL RECOVERY: ${csvFile}\n`);
      console.log('Step 1/5: Import CSV...');
      execSync(`npx tsx src/scripts/reimport-csv.ts ${csvFile}`, { stdio: 'inherit' });
      console.log('\nStep 2/5: Seed scoring config...');
      await seedScoringConfig();
      console.log('\nStep 3/5: Populate signal accumulation...');
      await populateSignalAccumulation();
      console.log('\nStep 4/5: Batch scoring...');
      await runBatchScoring();
      console.log('\nStep 5/5: Promotion...');
      await runPromotion();
      console.log('\n');
      await getStatus();
      break;
    }

    default:
      console.log(`
DOMINION RANGER — System Recovery Script

Usage:
  npx tsx src/scripts/recover-system.ts --status                Check system health
  npx tsx src/scripts/recover-system.ts --seed-config           Seed/fix scoring config
  npx tsx src/scripts/recover-system.ts --accumulate            Rebuild signal_accumulation
  npx tsx src/scripts/recover-system.ts --score                 Seed + accumulate + score + promote
  npx tsx src/scripts/recover-system.ts --import spokane.csv    Import CSV + seed + accumulate
  npx tsx src/scripts/recover-system.ts --full spokane.csv      FULL RECOVERY: import + seed + score + promote
      `);
  }
} catch (err) {
  console.error('Fatal error:', err);
  process.exit(1);
}

process.exit(0);
