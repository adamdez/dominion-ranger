/**
 * Backfill Unscored Properties — Score + Promote without Redis
 *
 * Finds all properties without scoring_records, scores them in batches,
 * evaluates promotion, and drains pending_scoring (DB fallback queue).
 *
 * Usage:
 *   npm run backfill:score   — score only
 *   npm run backfill:promote — promote only (requires prior scoring)
 *   npm run backfill:all    — score + promote
 *
 * Idempotent: re-runs are safe. Duplicate promotions are avoided.
 */

import 'dotenv/config';
import { sql, inArray } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  properties,
  scoringRecords,
  promotedLeads,
  leadInstances,
  pendingScoring,
} from '../db/schema/index.js';
import { wireEventHandlers } from '../events/wiring.js';
import { scoreProperty } from '../modules/scoring/index.js';
import { evaluateForPromotion } from '../modules/promotion/index.js';
import { applyAppendOnlyInvariants } from '../db/invariants.js';

const BATCH_SIZE = parseInt(process.env.BACKFILL_BATCH_SIZE ?? '50', 10);

async function getUnscoredDominionLeadIds(): Promise<string[]> {
  const rows = await db
    .select({ dominionLeadId: properties.dominionLeadId })
    .from(properties)
    .where(sql`${properties.dominionLeadId} NOT IN (SELECT DISTINCT dominion_lead_id FROM scoring_records)`);
  return rows.map((r) => r.dominionLeadId);
}

async function getPendingScoringIds(): Promise<string[]> {
  const rows = await db.select({ dominionLeadId: pendingScoring.dominionLeadId }).from(pendingScoring);
  return rows.map((r) => r.dominionLeadId);
}

async function getScoredButUnpromotedIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ dominionLeadId: scoringRecords.dominionLeadId })
    .from(scoringRecords)
    .leftJoin(promotedLeads, sql`${promotedLeads.dominionLeadId} = ${scoringRecords.dominionLeadId}`)
    .where(sql`${promotedLeads.promotionId} IS NULL`);
  return rows.map((r) => r.dominionLeadId);
}

async function drainPendingScoring(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(pendingScoring).where(inArray(pendingScoring.dominionLeadId, ids));
}

async function runScore(dominionLeadIds: string[]): Promise<{ scored: number; errors: number }> {
  let scored = 0;
  let errors = 0;

  for (let i = 0; i < dominionLeadIds.length; i += BATCH_SIZE) {
    const chunk = dominionLeadIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      chunk.map((id) => scoreProperty(id)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') scored++;
      else errors++;
    }

    if ((i + BATCH_SIZE) % 200 === 0 || i + BATCH_SIZE >= dominionLeadIds.length) {
      console.log(`   Scored: ${Math.min(i + BATCH_SIZE, dominionLeadIds.length)} / ${dominionLeadIds.length}`);
    }
  }

  return { scored, errors };
}

async function runPromote(dominionLeadIds: string[]): Promise<{ promoted: number }> {
  let promoted = 0;

  for (let i = 0; i < dominionLeadIds.length; i += BATCH_SIZE) {
    const chunk = dominionLeadIds.slice(i, i + BATCH_SIZE);

    for (const dominionLeadId of chunk) {
      try {
        const scoringResult = await scoreProperty(dominionLeadId);
        const promo = await evaluateForPromotion(dominionLeadId, scoringResult);
        if (promo) promoted++;
      } catch (err) {
        if (err instanceof Error && err.message.includes('already promoted')) {
          promoted++;
        }
      }
    }

    if ((i + BATCH_SIZE) % 200 === 0 || i + BATCH_SIZE >= dominionLeadIds.length) {
      console.log(`   Promoted batch: ${Math.min(i + BATCH_SIZE, dominionLeadIds.length)} / ${dominionLeadIds.length}`);
    }
  }

  return { promoted };
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'all';
  const doScore = mode === 'score' || mode === 'all';
  const doPromote = mode === 'promote' || mode === 'all';

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   Dominion Ranger — Backfill Unscored (no Redis required)  ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  await applyAppendOnlyInvariants();
  wireEventHandlers();

  const unscored = await getUnscoredDominionLeadIds();
  const pending = await getPendingScoringIds();
  const toScoreIds = [...new Set([...unscored, ...pending])];
  const toPromoteIds = doPromote && doScore
    ? toScoreIds
    : doPromote
      ? await getScoredButUnpromotedIds()
      : [];

  const idsForPromotion = doPromote ? (doScore ? toScoreIds : toPromoteIds) : [];

  console.log(`   unscored found:     ${unscored.length}`);
  console.log(`   pending_scoring:   ${pending.length}`);
  console.log(`   to score:          ${toScoreIds.length}`);
  if (doPromote && !doScore) console.log(`   scored but unpromoted: ${toPromoteIds.length}`);
  console.log('');

  if (!doScore && !doPromote) {
    console.log('   Use: backfill:score | backfill:promote | backfill:all');
    process.exit(0);
  }

  let scoringRecordsCreated = 0;
  let promotedLeadsCreated = 0;

  if (doScore && toScoreIds.length > 0) {
    console.log('── Scoring ─────────────────────────────────────────────────');
    const { scored, errors } = await runScore(toScoreIds);
    scoringRecordsCreated = scored;
    console.log(`   scoring_records created: ${scored}`);
    if (errors > 0) console.log(`   errors: ${errors}\n`);
  }

  if (doPromote && idsForPromotion.length > 0) {
    console.log('\n── Promotion ───────────────────────────────────────────────');
    const { promoted } = await runPromote(idsForPromotion);
    promotedLeadsCreated = promoted;
    console.log(`   promoted_leads created: ${promoted}`);

    await new Promise((r) => setTimeout(r, 300));
  }

  if (toScoreIds.length > 0) await drainPendingScoring(toScoreIds);

  const [scoreCount] = await db.select({ count: sql<number>`count(*)::int` }).from(scoringRecords);
  const [promoCount] = await db.select({ count: sql<number>`count(*)::int` }).from(promotedLeads);
  const [leadCount] = await db.select({ count: sql<number>`count(*)::int` }).from(leadInstances);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   BACKFILL COMPLETE                                       ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(`   unscored found:         ${unscored.length}`);
  console.log(`   scoring_records created: ${scoringRecordsCreated}`);
  console.log(`   promoted_leads created:  ${promotedLeadsCreated}`);
  console.log(`   total scoring_records:   ${scoreCount?.count ?? 0}`);
  console.log(`   total promoted_leads:   ${promoCount?.count ?? 0}`);
  console.log(`   total lead_instances:   ${leadCount?.count ?? 0}`);
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
