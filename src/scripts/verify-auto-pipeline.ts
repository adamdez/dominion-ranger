#!/usr/bin/env npx tsx
/**
 * Verification script: seed 50 properties + distress → scoring_records > 0 → dial queue > 0
 *
 * Run: npx tsx src/scripts/verify-auto-pipeline.ts
 *
 * Requires: DATABASE_URL, and scoring model seeded (npm run db:seed)
 */
import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema/index.js';
import { generateId } from '../lib/ids.js';
import { generateEventFingerprint } from '../lib/fingerprint.js';
import { applyAppendOnlyInvariants } from '../db/invariants.js';
import { seedScoringModel } from '../db/seeds/scoring-model-v1.js';
import { scoreAndPromoteBatch } from '../modules/auto-pipeline/index.js';
import { invalidateConfigCache } from '../modules/scoring/service.js';
import { wireEventHandlers } from '../events/wiring.js';

const env = process.env;
const DATABASE_URL = env.DATABASE_URL || env.TEST_DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Set DATABASE_URL or TEST_DATABASE_URL');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
const db = drizzle(pool, { schema });
const { properties, distressEvents, scoringRecords, leadInstances, promotedLeads } = schema;

async function main() {
  console.log('\n🔬 Auto-pipeline verification: seed 50 → score → promote\n');

  wireEventHandlers(); // lead.promoted → createLeadInstance
  await applyAppendOnlyInvariants();
  await seedScoringModel();
  invalidateConfigCache();

  // Clean prior verification run (county = VerifyCounty)
  await db.execute(sql`ALTER TABLE scoring_records DISABLE TRIGGER USER`);
  await db.execute(sql`ALTER TABLE distress_events DISABLE TRIGGER USER`);
  await db.execute(sql`DELETE FROM lead_instances WHERE dominion_lead_id IN (SELECT dominion_lead_id FROM properties WHERE county = 'VerifyCounty')`);
  await db.execute(sql`DELETE FROM promoted_leads WHERE dominion_lead_id IN (SELECT dominion_lead_id FROM properties WHERE county = 'VerifyCounty')`);
  await db.execute(sql`DELETE FROM scoring_records WHERE dominion_lead_id IN (SELECT dominion_lead_id FROM properties WHERE county = 'VerifyCounty')`);
  await db.execute(sql`DELETE FROM signal_accumulation WHERE dominion_lead_id IN (SELECT dominion_lead_id FROM properties WHERE county = 'VerifyCounty')`);
  await db.execute(sql`DELETE FROM distress_events WHERE dominion_lead_id IN (SELECT dominion_lead_id FROM properties WHERE county = 'VerifyCounty')`);
  await db.execute(sql`DELETE FROM properties WHERE county = 'VerifyCounty'`);
  await db.execute(sql`ALTER TABLE distress_events ENABLE TRIGGER USER`);
  await db.execute(sql`ALTER TABLE scoring_records ENABLE TRIGGER USER`);

  const ids: string[] = [];
  for (let i = 0; i < 50; i++) {
    const dominionLeadId = generateId();
    ids.push(dominionLeadId);

    await db.insert(properties).values({
      dominionLeadId,
      propertyId: generateId(),
      apn: `VERIFY-${i.toString().padStart(3, '0')}`,
      county: 'VerifyCounty',
      state: 'AZ',
      equityEstimate: '150000.00',
      ownershipDurationMonths: 60,
      absenteeOwner: true,
      mortgageStatus: 'LATE_60',
    });

    const fp = generateEventFingerprint({
      dominionLeadId,
      eventType: 'NOTICE_OF_DEFAULT',
      eventLayer: 'confirmed',
      sourceName: 'verify-script',
      triggerEventDate: new Date('2026-01-15'),
    });

    await db.insert(distressEvents).values({
      eventId: generateId(),
      dominionLeadId,
      eventType: 'NOTICE_OF_DEFAULT',
      eventLayer: 'confirmed',
      sourceName: 'verify-script',
      fingerprint: fp,
      reliabilityScore: '0.90',
      triggerEventDate: new Date('2026-01-15'),
    });
  }

  console.log('   Seeded 50 properties with distress events');
  const result = await scoreAndPromoteBatch(ids);
  console.log(`   Ingest → scored: ${result.scored} → promoted: ${result.promoted}`);

  const [scoringCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scoringRecords);
  const [leadCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leadInstances);
  const [promotedCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(promotedLeads);

  console.log(`\n   scoring_records: ${scoringCount.count}`);
  console.log(`   lead_instances (dial queue): ${leadCount.count}`);
  console.log(`   promoted_leads: ${promotedCount.count}`);

  const ok = scoringCount.count > 0 && leadCount.count > 0;
  if (ok) {
    console.log('\n✅ Verification passed: ingest → scored → promoted → dial queue > 0\n');
  } else {
    console.error('\n❌ Verification failed: expected scoring_records > 0 and lead_instances > 0\n');
    process.exit(1);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  pool.end().then(() => process.exit(1));
});
