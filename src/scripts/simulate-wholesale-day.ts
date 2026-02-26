#!/usr/bin/env npx tsx
/**
 * Simulate a real operational wholesale day.
 *
 * 1. Import 100 test properties
 * 2. Score them
 * 3. Run skip trace on top 30
 * 4. Trigger call-ready rule
 * 5. Print stats (scored, call-eligible, enqueued, failures)
 * 6. Exit PASS if at least 10 leads enqueued
 *
 * Run: npx tsx src/scripts/simulate-wholesale-day.ts
 *
 * Env:
 *   WHOLESALE_SIM_INJECT_PHONES=true — inject mock phones instead of real Tracerfy
 *     (use when TRACERFY_API_KEY is missing or for faster CI runs)
 *   CALL_READY_ENABLED=true — required for enqueue
 *
 * Requires: DATABASE_URL, scoring model seeded (db:seed or similar)
 */
import 'dotenv/config';
import { eq, desc, inArray } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  properties,
  distressEvents,
  scoringRecords,
  signalAccumulation,
  propertyContacts,
} from '../db/schema/index.js';
import { findOrCreateProperty } from '../modules/properties/service.js';
import { ingestDistressEvent } from '../modules/distress-events/service.js';
import { recalculateSignalAccumulation } from '../modules/signals/service.js';
import { scoreProperty } from '../modules/scoring/service.js';
import { evaluateForPromotion } from '../modules/promotion/service.js';
import { skipTraceProperty } from '../modules/skip-trace/index.js';
import { runCallReadyForLastNDays } from '../modules/call-ready/index.js';
import { getCallReadyConfig } from '../modules/call-ready/config.js';
import { wireEventHandlers } from '../events/wiring.js';
import { seedScoringModel } from '../db/seeds/scoring-model-v1.js';

const SIM_COUNTY = 'WHOLESALE-SIM';
const PROP_COUNT = 100;
const TOP_N = 30;
const MIN_ENQUEUED_FOR_PASS = 10;

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('\n❌ DATABASE_URL is not set.\n');
    process.exit(1);
  }

  const injectPhones = process.env.WHOLESALE_SIM_INJECT_PHONES === 'true';
  const callReadyConfig = getCallReadyConfig();

  wireEventHandlers();

  await seedScoringModel();

  console.log('\n📅 Wholesale Day Simulation\n');
  console.log('   Step 1: Import 100 test properties...');

  const dominionLeadIds: string[] = [];

  for (let i = 1; i <= PROP_COUNT; i++) {
    const apn = `SIM-WHOLESALE-${pad3(i)}`;
    const { property } = await findOrCreateProperty({
      apn,
      county: SIM_COUNTY,
      state: 'WA',
      streetAddress: `${i} Simulation St`,
      city: 'Spokane',
      zip: '99201',
      ownerFirst: 'Sim',
      ownerLast: `Owner${i}`,
      ownerName: `Sim Owner ${i}`,
      equityEstimate: String(50000 + i * 2000),
      ownershipDurationMonths: 60 + i,
    });
    dominionLeadIds.push(property.dominionLeadId);
  }

  console.log(`   Imported ${dominionLeadIds.length} properties`);

  console.log('   Step 2: Add distress events and score...');

  const now = new Date();
  const triggerDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (const dominionLeadId of dominionLeadIds) {
    await ingestDistressEvent({
      dominionLeadId,
      eventType: 'TAX_DELINQUENCY',
      eventLayer: 'confirmed',
      triggerEventDate: triggerDate,
      sourceName: 'wholesale_sim',
      reliabilityScore: 0.85,
      rawEventPayload: { taxDelinquentAmount: 5000 + Math.floor(Math.random() * 10000) },
    }).catch(() => {});

    await recalculateSignalAccumulation(dominionLeadId);
    await scoreProperty(dominionLeadId);
  }

  const scoredCount = dominionLeadIds.length;
  console.log(`   Scored ${scoredCount} properties`);

  console.log('   Step 3: Promote top 30 (create lead instances)...');

  const allScores = await db
    .select({
      dominionLeadId: scoringRecords.dominionLeadId,
      compositeScore: scoringRecords.compositeScore,
    })
    .from(scoringRecords)
    .where(inArray(scoringRecords.dominionLeadId, dominionLeadIds))
    .orderBy(desc(scoringRecords.createdAt));

  const latestByLead = new Map<string, number>();
  for (const r of allScores) {
    if (!latestByLead.has(r.dominionLeadId)) {
      latestByLead.set(r.dominionLeadId, parseFloat(String(r.compositeScore)));
    }
  }

  const sorted = dominionLeadIds
    .map((id) => ({ dominionLeadId: id, compositeScore: latestByLead.get(id) ?? 0 }))
    .sort((a, b) => b.compositeScore - a.compositeScore);

  const top30 = sorted.slice(0, TOP_N);
  let promotedCount = 0;

  for (const { dominionLeadId, compositeScore } of top30) {
    const scoringResult = await scoreProperty(dominionLeadId);
    const promo = await evaluateForPromotion(dominionLeadId, scoringResult);
    if (promo) promotedCount++;
  }

  console.log(`   Promoted ${promotedCount} leads (lead instances created)`);

  console.log('   Step 4: Skip trace top 30...');

  let skipTraceSuccess = 0;
  const skipTraceFailures: string[] = [];

  if (injectPhones) {
    for (let i = 0; i < top30.length; i++) {
      const { dominionLeadId } = top30[i];
      const phone = `555${pad3(i + 1)}0000`;
      await db
        .update(properties)
        .set({ phone, updatedAt: new Date() })
        .where(eq(properties.dominionLeadId, dominionLeadId));
      await db.insert(propertyContacts).values({
        dominionLeadId,
        contactName: `Sim Owner ${i + 1}`,
        contactType: 'OWNER',
        phone,
        phoneType: 'MOBILE',
        source: 'wholesale_sim_inject',
        isPrimary: true,
        isOwnerMatch: true,
        dndCalls: false,
      });
      skipTraceSuccess++;
    }
    console.log(`   Injected mock phones for ${skipTraceSuccess} properties (WHOLESALE_SIM_INJECT_PHONES=true)`);
  } else {
    for (const { dominionLeadId } of top30) {
      try {
        const result = await skipTraceProperty(dominionLeadId, 'STANDARD');
        if (result.success) skipTraceSuccess++;
        else skipTraceFailures.push(`${dominionLeadId.slice(0, 8)}: ${result.error ?? 'no data'}`);
      } catch (err) {
        skipTraceFailures.push(
          `${dominionLeadId.slice(0, 8)}: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
    }
    console.log(`   Skip trace: ${skipTraceSuccess} success, ${skipTraceFailures.length} failures`);
  }

  console.log('   Step 5: Trigger call-ready rule...');

  if (!callReadyConfig.enabled) {
    console.log('   ⚠ CALL_READY_ENABLED=false — call-ready will no-op. Set to true for enqueue.');
  }

  const callReadyResult = await runCallReadyForLastNDays(1);

  console.log('\n   ─────────────────────────────────────────');
  console.log('   RESULTS');
  console.log('   ─────────────────────────────────────────');
  console.log(`   Total leads scored:      ${scoredCount}`);
  console.log(`   Leads eligible (call):   ${callReadyResult.eligible}`);
  console.log(`   Leads enqueued:         ${callReadyResult.enqueued}`);
  console.log(`   Errors:                 ${callReadyResult.errors}`);
  if (skipTraceFailures.length > 0) {
    console.log('\n   Skip trace failures (sample):');
    skipTraceFailures.slice(0, 5).forEach((f) => console.log(`     - ${f}`));
    if (skipTraceFailures.length > 5) {
      console.log(`     ... and ${skipTraceFailures.length - 5} more`);
    }
  }
  console.log('   ─────────────────────────────────────────');

  const passed = callReadyResult.enqueued >= MIN_ENQUEUED_FOR_PASS;

  if (passed) {
    console.log(`\n   ✅ PASS — ${callReadyResult.enqueued} leads enqueued (≥${MIN_ENQUEUED_FOR_PASS} required)\n`);
    process.exit(0);
  }

  console.log(
    `\n   ❌ FAIL — ${callReadyResult.enqueued} leads enqueued (need ≥${MIN_ENQUEUED_FOR_PASS})\n`,
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
