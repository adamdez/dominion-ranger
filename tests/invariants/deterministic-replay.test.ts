/**
 * Charter Invariant 6: Deterministic Replay
 *
 * Validates that:
 * 1. Scoring the same property twice with the same asOf produces identical results
 * 2. Score inputs snapshot captures enough data for audit
 * 3. lastScoredAt matches the asOf parameter for replay traceability
 * 4. High-distress properties score higher than low-distress (sanity check)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql, desc } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  scoringRecords,
  distressEvents,
} from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { generateEventFingerprint } from '../../src/lib/fingerprint.js';
import { applyAppendOnlyInvariants } from '../../src/db/invariants.js';
import { seedScoringModel } from '../../src/db/seeds/scoring-model-v1.js';
import { scoreProperty, invalidateConfigCache } from '../../src/modules/scoring/service.js';
import { recalculateSignalAccumulation } from '../../src/modules/signals/service.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Invariant 6: Deterministic Replay', () => {
  const db = canRun ? getTestDb() : (null as never);

  async function createScoredProperty(
    apn: string,
    events: { type: string; layer: string; date: Date }[],
    props?: Record<string, unknown>,
  ): Promise<string> {
    const id = generateId();
    await db.insert(properties).values({
      dominionLeadId: id,
      propertyId: generateId(),
      apn,
      county: 'ReplayCounty',
      state: 'AZ',
      equityEstimate: '150000.00',
      ownershipDurationMonths: 60,
      absenteeOwner: true,
      mortgageStatus: 'LATE_60',
      ...props,
    });

    for (const evt of events) {
      const fp = generateEventFingerprint({
        dominionLeadId: id,
        eventType: evt.type,
        eventLayer: evt.layer,
        sourceName: 'AuditTestSource',
        triggerEventDate: evt.date,
      });
      await db.insert(distressEvents).values({
        eventId: generateId(),
        dominionLeadId: id,
        eventType: evt.type,
        eventLayer: evt.layer,
        sourceName: 'AuditTestSource',
        fingerprint: fp,
        reliabilityScore: '0.90',
        triggerEventDate: evt.date,
      });
    }

    await recalculateSignalAccumulation(id);
    return id;
  }

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
    await db.execute(sql`ALTER TABLE scoring_records DISABLE TRIGGER USER`);
    await db.execute(sql`ALTER TABLE distress_events DISABLE TRIGGER USER`);
    await db.execute(sql`DELETE FROM promoted_leads`);
    await db.execute(sql`DELETE FROM scoring_records`);
    await db.execute(sql`DELETE FROM signal_accumulation`);
    await db.execute(sql`DELETE FROM distress_events`);
    await db.execute(sql`DELETE FROM properties`);
    await db.execute(sql`ALTER TABLE distress_events ENABLE TRIGGER USER`);
    await db.execute(sql`ALTER TABLE scoring_records ENABLE TRIGGER USER`);
  });

  it('produces identical scores when scored twice with the same asOf', async () => {
    const id = await createScoredProperty('DET-001', [
      { type: 'NOTICE_OF_DEFAULT', layer: 'confirmed', date: new Date('2026-01-15') },
      { type: 'TAX_DELINQUENCY', layer: 'confirmed', date: new Date('2026-01-20') },
      { type: 'PREDICTIVE_PAYMENT_STRESS', layer: 'predictive', date: new Date('2026-02-01') },
    ]);

    const asOf = new Date('2026-02-15T12:00:00Z');
    const result1 = await scoreProperty(id, { asOf });
    const result2 = await scoreProperty(id, { asOf });

    expect(result1.compositeScore).toEqual(result2.compositeScore);
    expect(result1.motivationScore).toEqual(result2.motivationScore);
    expect(result1.dealScore).toEqual(result2.dealScore);
    expect(result1.confidenceScore).toEqual(result2.confidenceScore);
    expect(result1.equityMultiplier).toEqual(result2.equityMultiplier);
    expect(result1.timeDecayFactor).toEqual(result2.timeDecayFactor);
    expect(result1.suppressed).toBe(result2.suppressed);
  });

  it('scores vary correctly across different property profiles', async () => {
    const asOf = new Date('2026-02-15T12:00:00Z');

    const highDistress = await createScoredProperty('DET-HIGH', [
      { type: 'NOTICE_OF_DEFAULT', layer: 'confirmed', date: new Date('2026-02-10') },
      { type: 'LIS_PENDENS', layer: 'confirmed', date: new Date('2026-02-12') },
      { type: 'BANKRUPTCY', layer: 'confirmed', date: new Date('2026-02-01') },
    ]);

    const lowDistress = await createScoredProperty('DET-LOW', [
      { type: 'PREDICTIVE_VACANCY_SIGNAL', layer: 'predictive', date: new Date('2025-10-01') },
    ], { equityEstimate: '15000.00', ownershipDurationMonths: 12 });

    const highResult = await scoreProperty(highDistress, { asOf });
    const lowResult = await scoreProperty(lowDistress, { asOf });

    expect(highResult.compositeScore).toBeGreaterThan(lowResult.compositeScore);
    expect(highResult.motivationScore).toBeGreaterThan(lowResult.motivationScore);
    expect(highResult.confidenceScore).toBeGreaterThan(lowResult.confidenceScore);
  });

  it('records lastScoredAt matching the asOf parameter', async () => {
    const id = await createScoredProperty('DET-TS', [
      { type: 'TAX_DELINQUENCY', layer: 'confirmed', date: new Date('2026-01-15') },
    ]);

    const asOf = new Date('2026-02-15T12:00:00Z');
    await scoreProperty(id, { asOf });

    const [record] = await db
      .select()
      .from(scoringRecords)
      .where(eq(scoringRecords.dominionLeadId, id))
      .orderBy(desc(scoringRecords.createdAt))
      .limit(1);

    expect(record.lastScoredAt.getTime()).toBe(asOf.getTime());
    expect(record.scoreModelVersion).toBe('v1.0');
  });

  it('scoreInputsSnapshot contains audit-required fields', async () => {
    const id = await createScoredProperty('DET-SNAP', [
      { type: 'NOTICE_OF_DEFAULT', layer: 'confirmed', date: new Date('2026-01-15') },
      { type: 'PREDICTIVE_PAYMENT_STRESS', layer: 'predictive', date: new Date('2026-02-01') },
    ]);

    const asOf = new Date('2026-02-15T12:00:00Z');
    await scoreProperty(id, { asOf });

    const [record] = await db
      .select()
      .from(scoringRecords)
      .where(eq(scoringRecords.dominionLeadId, id))
      .orderBy(desc(scoringRecords.createdAt))
      .limit(1);

    const snapshot = record.scoreInputsSnapshot as Record<string, unknown>;
    expect(snapshot).toHaveProperty('eventCount');
    expect(snapshot).toHaveProperty('uniqueTypes');
    expect(snapshot).toHaveProperty('hasConfirmedEvent');
    expect(snapshot).toHaveProperty('equityMultiplier');
    expect(snapshot).toHaveProperty('suppressed');

    const contributions = record.signalContributions as Array<Record<string, unknown>>;
    expect(contributions.length).toBe(2);
    for (const c of contributions) {
      expect(c).toHaveProperty('eventType');
      expect(c).toHaveProperty('eventLayer');
      expect(c).toHaveProperty('baseWeight');
      expect(c).toHaveProperty('timeDecay');
      expect(c).toHaveProperty('finalContribution');
    }
  });
});
