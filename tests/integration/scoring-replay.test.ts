/**
 * Charter Phase 1 — Scoring Replay Determinism Test
 *
 * Test 3: Delete scoring records, replay, verify regenerated scores are identical
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql, desc } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  scoringRecords,
  scoringModelConfigs,
  distressEvents,
  signalAccumulation,
} from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { generateEventFingerprint } from '../../src/lib/fingerprint.js';
import { applyAppendOnlyInvariants } from '../../src/db/invariants.js';
import { seedScoringModel } from '../../src/db/seeds/scoring-model-v1.js';
import { scoreProperty, invalidateConfigCache } from '../../src/modules/scoring/service.js';
import { recalculateSignalAccumulation } from '../../src/modules/signals/service.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Scoring Replay Determinism', () => {
  const db = canRun ? getTestDb() : (null as any);
  let testPropertyId: string;

  beforeAll(async () => {
    await cleanupTables();
    await applyAppendOnlyInvariants();
    await seedScoringModel();
    invalidateConfigCache();
  });

  afterAll(async () => {
    await cleanupTables();
    await closeTestDb();
  });

  beforeEach(async () => {
    await db.execute(sql`ALTER TABLE scoring_records DISABLE TRIGGER ALL`);
    await db.execute(sql`ALTER TABLE distress_events DISABLE TRIGGER ALL`);
    await db.execute(sql`DELETE FROM scoring_records`);
    await db.execute(sql`DELETE FROM signal_accumulation`);
    await db.execute(sql`DELETE FROM distress_events`);
    await db.execute(sql`DELETE FROM properties`);
    await db.execute(sql`ALTER TABLE distress_events ENABLE TRIGGER ALL`);
    await db.execute(sql`ALTER TABLE scoring_records ENABLE TRIGGER ALL`);

    testPropertyId = generateId();
    await db.insert(properties).values({
      dominionLeadId: testPropertyId,
      propertyId: generateId(),
      apn: 'REPLAY-001',
      county: 'TestCounty',
      state: 'AZ',
      equityEstimate: '150000.00',
      ownershipDurationMonths: 60,
      absenteeOwner: true,
      mortgageStatus: 'LATE_60',
    });

    const events = [
      { eventType: 'NOTICE_OF_DEFAULT', layer: 'confirmed', source: 'PropertyRadar', date: new Date('2026-01-15') },
      { eventType: 'TAX_DELINQUENCY', layer: 'confirmed', source: 'CountyRecords', date: new Date('2026-01-20') },
      { eventType: 'PREDICTIVE_PAYMENT_STRESS', layer: 'predictive', source: 'Analytics', date: new Date('2026-02-01') },
    ];

    for (const evt of events) {
      const fp = generateEventFingerprint({
        dominionLeadId: testPropertyId,
        eventType: evt.eventType,
        eventLayer: evt.layer,
        sourceName: evt.source,
        triggerEventDate: evt.date,
      });

      await db.insert(distressEvents).values({
        eventId: generateId(),
        dominionLeadId: testPropertyId,
        eventType: evt.eventType,
        eventLayer: evt.layer,
        sourceName: evt.source,
        fingerprint: fp,
        reliabilityScore: '0.90',
        triggerEventDate: evt.date,
      });
    }

    await recalculateSignalAccumulation(testPropertyId);
  });

  it('delete-and-replay regenerates identical scores', async () => {
    const originalResult = await scoreProperty(testPropertyId);
    expect(originalResult.compositeScore).toBeGreaterThan(0);

    const [originalRecord] = await db
      .select()
      .from(scoringRecords)
      .where(eq(scoringRecords.dominionLeadId, testPropertyId))
      .orderBy(desc(scoringRecords.createdAt))
      .limit(1);

    await db.execute(sql`ALTER TABLE scoring_records DISABLE TRIGGER scoring_records_no_delete`);
    await db.execute(
      sql`DELETE FROM scoring_records WHERE dominion_lead_id = ${testPropertyId}`,
    );
    await db.execute(sql`ALTER TABLE scoring_records ENABLE TRIGGER scoring_records_no_delete`);

    const deletedCheck = await db
      .select()
      .from(scoringRecords)
      .where(eq(scoringRecords.dominionLeadId, testPropertyId));
    expect(deletedCheck.length).toBe(0);

    invalidateConfigCache();
    const replayResult = await scoreProperty(testPropertyId);

    expect(replayResult.compositeScore).toBeCloseTo(originalResult.compositeScore, 4);
    expect(replayResult.motivationScore).toBeCloseTo(originalResult.motivationScore, 4);
    expect(replayResult.dealScore).toBeCloseTo(originalResult.dealScore, 4);
    expect(replayResult.equityMultiplier).toBeCloseTo(originalResult.equityMultiplier, 4);
    expect(replayResult.confidenceScore).toBeCloseTo(originalResult.confidenceScore, 4);
    expect(replayResult.suppressed).toBe(false);
  });
});
