/**
 * Backfill scoring + promotion for all unscored properties.
 *
 * Runs directly against the DB (no Redis/BullMQ required).
 * Safe to rerun: idempotent via append-only scoring_records
 * and the promotion idempotency guard.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-scoring.ts
 *   npx tsx src/scripts/backfill-scoring.ts --batch-size=100
 *   npx tsx src/scripts/backfill-scoring.ts --rescore  (rescore all, not just unscored)
 */
import 'dotenv/config';
import { db } from '../db/connection.js';
import { properties, distressEvents } from '../db/schema/index.js';
import { sql, eq } from 'drizzle-orm';
import { recalculateSignalAccumulation } from '../modules/signals/service.js';
import { scoreProperty } from '../modules/scoring/service.js';
import { evaluateForPromotion } from '../modules/promotion/service.js';

const args = process.argv.slice(2);
const batchSize = parseInt(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] ?? '200', 10);
const rescore = args.includes('--rescore');

async function main() {
  console.log('\n  Dominion Ranger — Backfill Scoring');
  console.log(`  Mode: ${rescore ? 'RESCORE ALL' : 'UNSCORED ONLY'}`);
  console.log(`  Batch size: ${batchSize}\n`);

  const startTime = Date.now();

  // Find properties to score
  let toScore: { dominionLeadId: string }[];
  if (rescore) {
    toScore = await db
      .select({ dominionLeadId: properties.dominionLeadId })
      .from(properties);
  } else {
    toScore = await db
      .select({ dominionLeadId: properties.dominionLeadId })
      .from(properties)
      .where(
        sql`${properties.dominionLeadId} NOT IN (SELECT DISTINCT dominion_lead_id FROM scoring_records)`,
      );
  }

  console.log(`  Found ${toScore.length} properties to ${rescore ? 'rescore' : 'score'}`);

  if (toScore.length === 0) {
    console.log('  Nothing to do.\n');
    process.exit(0);
  }

  let scored = 0;
  let promoted = 0;
  let signalUpdates = 0;
  let errors = 0;
  let skippedNoEvents = 0;

  for (let i = 0; i < toScore.length; i += batchSize) {
    const batch = toScore.slice(i, i + batchSize);

    for (const row of batch) {
      try {
        // Check if property has distress events (no events = zero score, skip)
        const [eventCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(distressEvents)
          .where(eq(distressEvents.dominionLeadId, row.dominionLeadId));

        if (!eventCount || eventCount.count === 0) {
          skippedNoEvents++;
          continue;
        }

        // Recalculate signal accumulation first
        await recalculateSignalAccumulation(row.dominionLeadId);
        signalUpdates++;

        // Score
        const result = await scoreProperty(row.dominionLeadId);
        scored++;

        // Evaluate for promotion
        const promotion = await evaluateForPromotion(row.dominionLeadId, result);
        if (promotion) promoted++;

      } catch (err: unknown) {
        errors++;
        if (errors <= 10) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  Error scoring ${row.dominionLeadId}: ${msg}`);
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const processed = Math.min(i + batchSize, toScore.length);
    const rate = (processed / parseFloat(elapsed)).toFixed(1);
    console.log(`  ${processed}/${toScore.length} processed | ${scored} scored | ${promoted} promoted | ${rate}/s`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n  ═══════════════════════════════════');
  console.log(`  Backfill complete in ${elapsed}s`);
  console.log(`  Signal accumulation updated: ${signalUpdates}`);
  console.log(`  Scoring records created:     ${scored}`);
  console.log(`  Promoted leads created:      ${promoted}`);
  console.log(`  Skipped (no events):         ${skippedNoEvents}`);
  console.log(`  Errors:                      ${errors}`);
  console.log('  ═══════════════════════════════════\n');

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
