/**
 * Demo data seed — populates DB in ~60 seconds for dashboard demos.
 *
 * Idempotent: running twice won't double counts.
 * Uses deterministic APNs/fingerprints so conflicts are no-ops.
 */
import 'dotenv/config';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db } from '../connection.js';
import {
  properties,
  distressEvents,
  scoringRecords,
  promotedLeads,
  leadInstances,
} from '../schema/index.js';
import { closeDatabase } from '../connection.js';
import { seedScoringModel, seedSystemSettings } from './scoring-model-v1.js';

const DEMO_COUNTY = 'Demo';
const DEMO_STATE = 'WA';
const EVENT_TYPES = [
  'TAX_DELINQUENCY',
  'LIS_PENDENS',
  'PROBATE',
  'BANKRUPTCY',
  'CODE_ENFORCEMENT',
] as const;
const EVENT_LAYERS = ['confirmed', 'predictive'] as const;

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

async function seedProperties(): Promise<{ inserted: number; existing: number; ids: string[] }> {
  const existing = await db
    .select({ dominionLeadId: properties.dominionLeadId, apn: properties.apn })
    .from(properties)
    .where(sql`${properties.apn} LIKE 'DEMO-%' AND ${properties.county} = ${DEMO_COUNTY}`);

  if (existing.length >= 200) {
    return { inserted: 0, existing: existing.length, ids: existing.map((r) => r.dominionLeadId) };
  }

  const existingApns = new Set(existing.map((r) => r.apn).filter(Boolean));

  for (let i = 1; i <= 200; i++) {
    const apn = `DEMO-${pad3(i)}`;
    if (existingApns.has(apn)) continue;

    const dominionLeadId = uuidv7();
    const propertyId = uuidv7();

    await db
      .insert(properties)
      .values({
        dominionLeadId,
        propertyId,
        apn,
        county: DEMO_COUNTY,
        state: DEMO_STATE,
        streetAddress: `${i} Demo Street`,
        city: 'Spokane',
        zip: '99201',
        ownerName: `Demo Owner ${i}`,
        ownerFirst: 'Demo',
        ownerLast: `Owner${i}`,
        phone: i <= 20 ? `555${pad3(i)}0000` : null,
        email: i <= 20 ? `demo${i}@example.com` : null,
        equityEstimate: String(50000 + i * 1000),
      })
      .onConflictDoNothing({ target: [properties.apn, properties.county] });

    existingApns.add(apn);
  }

  const final = await db
    .select({ dominionLeadId: properties.dominionLeadId })
    .from(properties)
    .where(sql`${properties.apn} LIKE 'DEMO-%' AND ${properties.county} = ${DEMO_COUNTY}`)
    .orderBy(properties.apn);

  return {
    inserted: final.length - existing.length,
    existing: existing.length,
    ids: final.map((r) => r.dominionLeadId),
  };
}

async function seedDistressEvents(propertyIds: string[]): Promise<{ inserted: number; skipped: number }> {
  const existingFps = await db
    .select({ fingerprint: distressEvents.fingerprint })
    .from(distressEvents)
    .where(sql`${distressEvents.fingerprint} LIKE 'demo-fp-%'`);

  const existingSet = new Set(existingFps.map((r) => r.fingerprint));
  if (existingSet.size >= 40) {
    return { inserted: 0, skipped: 40 };
  }

  let inserted = 0;
  for (let i = 1; i <= 40; i++) {
    const fingerprint = `demo-fp-${pad3(i)}`;
    if (existingSet.has(fingerprint)) continue;

    const propIdx = (i - 1) % propertyIds.length;
    const dominionLeadId = propertyIds[propIdx];
    const eventType = EVENT_TYPES[(i - 1) % EVENT_TYPES.length];
    const eventLayer = EVENT_LAYERS[(i - 1) % EVENT_LAYERS.length];

    await db.insert(distressEvents).values({
      eventId: uuidv7(),
      dominionLeadId,
      eventType,
      eventLayer,
      sourceName: 'demo_seed',
      fingerprint,
      reliabilityScore: String(0.7 + (i % 4) * 0.05),
      rawEventPayload: { _demo: true, _demoId: fingerprint },
    });

    inserted++;
    existingSet.add(fingerprint);
  }

  return { inserted, skipped: 40 - inserted };
}

async function seedScoringRecords(propertyIds: string[]): Promise<{ inserted: number; skipped: number }> {
  const rows = await db
    .selectDistinct({ dominionLeadId: scoringRecords.dominionLeadId })
    .from(scoringRecords)
    .where(inArray(scoringRecords.dominionLeadId, propertyIds));

  const scoredIds = new Set(rows.map((r) => r.dominionLeadId));
  const toInsert = propertyIds.filter((id) => !scoredIds.has(id));

  if (toInsert.length === 0) {
    return { inserted: 0, skipped: propertyIds.length };
  }

  const modelVersion = 'v1.0';
  const batchSize = 50;

  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize);
    const values = batch.map((dominionLeadId, j) => {
      const baseScore = 45 + (i + j) % 45;
      const motivation = baseScore * 0.65;
      const deal = baseScore * 0.35;
      return {
        scoreId: uuidv7(),
        dominionLeadId,
        compositeScore: String(baseScore),
        motivationScore: String(motivation),
        dealScore: String(deal),
        confidenceScore: String(0.75 + (i + j) % 25 * 0.01),
        scoreModelVersion: modelVersion,
        scoreInputsSnapshot: { _demo: true, _demoId: `demo-score-${dominionLeadId.slice(0, 8)}` },
        signalContributions: { _demo: true },
      };
    });

    await db.insert(scoringRecords).values(values);
  }

  return { inserted: toInsert.length, skipped: propertyIds.length - toInsert.length };
}

type PromoPair = { promotionId: string; dominionLeadId: string };

async function seedPromotedLeads(propertyIds: string[]): Promise<{
  inserted: number;
  skipped: number;
  pairs: PromoPair[];
}> {
  const existing = await db
    .select({ dominionLeadId: promotedLeads.dominionLeadId })
    .from(promotedLeads)
    .where(inArray(promotedLeads.dominionLeadId, propertyIds));

  const promotedIds = new Set(existing.map((r) => r.dominionLeadId));
  const needCount = Math.max(0, 20 - existing.length);
  const toPromote = propertyIds.filter((id) => !promotedIds.has(id)).slice(0, needCount);

  if (toPromote.length > 0) {
    const tiers = ['A', 'B', 'C'] as const;
    const urgencies = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

    const values = toPromote.map((dominionLeadId, i) => ({
      promotionId: uuidv7(),
      dominionLeadId,
      compositeScore: String(65 + (i % 25)),
      confidenceScore: String(0.8 + (i % 20) * 0.01),
      scoreModelVersion: 'v1.0',
      marketingTier: tiers[i % 3],
      urgencyLevel: urgencies[i % 4],
      signalSummary: { _demo: true },
    }));

    await db.insert(promotedLeads).values(values);
  }

  const allPromos = await db
    .select({ promotionId: promotedLeads.promotionId, dominionLeadId: promotedLeads.dominionLeadId })
    .from(promotedLeads)
    .where(inArray(promotedLeads.dominionLeadId, propertyIds))
    .orderBy(promotedLeads.promotedAt)
    .limit(20);

  return {
    inserted: toPromote.length,
    skipped: 20 - toPromote.length,
    pairs: allPromos,
  };
}

async function seedDialQueue(pairs: PromoPair[]): Promise<{ inserted: number; skipped: number }> {
  if (pairs.length === 0) return { inserted: 0, skipped: 0 };

  const dominionLeadIds = pairs.map((p) => p.dominionLeadId);
  const existing = await db
    .select({ dominionLeadId: leadInstances.dominionLeadId })
    .from(leadInstances)
    .where(
      and(eq(leadInstances.status, 'DIAL_READY'), inArray(leadInstances.dominionLeadId, dominionLeadIds)),
    );

  const hasDialReady = new Set(existing.map((r) => r.dominionLeadId));
  const toCreate = pairs.filter((p) => !hasDialReady.has(p.dominionLeadId));

  if (toCreate.length === 0) {
    return { inserted: 0, skipped: pairs.length };
  }

  const values = toCreate.map(({ promotionId, dominionLeadId }) => ({
    leadInstanceId: uuidv7(),
    dominionLeadId,
    promotionId,
    status: 'DIAL_READY' as const,
    complianceCleared: true,
    dncCheckedAt: new Date(),
    litigantCheckedAt: new Date(),
  }));

  await db.insert(leadInstances).values(values);

  return { inserted: values.length, skipped: pairs.length - values.length };
}

async function run(): Promise<void> {
  console.log('\n🌱 Demo data seed — idempotent (safe to run multiple times)\n');

  const t0 = Date.now();

  await seedScoringModel();
  await seedSystemSettings();

  const props = await seedProperties();
  console.log(`  Properties:     ${props.inserted} inserted, ${props.existing} existing → ${props.ids.length} total`);

  const events = await seedDistressEvents(props.ids);
  console.log(`  Distress events: ${events.inserted} inserted, ${events.skipped} skipped (40 target)`);

  const scores = await seedScoringRecords(props.ids);
  console.log(`  Scoring records: ${scores.inserted} inserted, ${scores.skipped} skipped (200 target)`);

  const promos = await seedPromotedLeads(props.ids);
  console.log(`  Promoted leads:  ${promos.inserted} inserted, ${promos.skipped} skipped (20 target)`);

  const dial = await seedDialQueue(promos.pairs);
  console.log(`  Dial queue:      ${dial.inserted} inserted, ${dial.skipped} skipped (20 DIAL_READY target)`);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✅ Done in ${elapsed}s. Dashboard should show non-zero counts.\n`);

  await closeDatabase();
  process.exit(0);
}

run().catch((err) => {
  console.error('Demo seed failed:', err);
  process.exit(1);
});
