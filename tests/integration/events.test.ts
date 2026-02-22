/**
 * Charter Phase 1 — Event Store Integrity Tests
 *
 * Validates:
 *   - Same event inserted twice -> deduped via fingerprint
 *   - Append-only enforcement (UPDATE/DELETE raise exception)
 *   - Event replay integrity
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import { properties, distressEvents } from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { generateEventFingerprint } from '../../src/lib/fingerprint.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Event Store Integrity', () => {
  const db = canRun ? getTestDb() : (null as any);
  let testPropertyId: string;

  beforeAll(async () => {
    await cleanupTables();

    testPropertyId = generateId();
    await db.insert(properties).values({
      dominionLeadId: testPropertyId,
      propertyId: generateId(),
      apn: 'EVT-TEST-001',
      county: 'TestCounty',
      state: 'AZ',
    });
  });

  afterAll(async () => {
    await cleanupTables();
    await closeTestDb();
  });

  beforeEach(async () => {
    await db.execute(sql`ALTER TABLE distress_events DISABLE TRIGGER ALL`);
    await db.execute(sql`DELETE FROM distress_events`);
    await db.execute(sql`ALTER TABLE distress_events ENABLE TRIGGER ALL`);
  });

  describe('Fingerprint Dedup', () => {
    it('inserts event with unique fingerprint', async () => {
      const fingerprint = generateEventFingerprint({
        dominionLeadId: testPropertyId,
        eventType: 'NOTICE_OF_DEFAULT',
        eventLayer: 'confirmed',
        sourceName: 'PropertyRadar',
        triggerEventDate: new Date('2026-01-15'),
      });

      const result = await db
        .insert(distressEvents)
        .values({
          eventId: generateId(),
          dominionLeadId: testPropertyId,
          eventType: 'NOTICE_OF_DEFAULT',
          eventLayer: 'confirmed',
          sourceName: 'PropertyRadar',
          fingerprint,
          reliabilityScore: '0.90',
          triggerEventDate: new Date('2026-01-15'),
        })
        .onConflictDoNothing({ target: distressEvents.fingerprint })
        .returning();

      expect(result.length).toBe(1);
    });

    it('same event inserted twice produces only 1 row', async () => {
      const input = {
        dominionLeadId: testPropertyId,
        eventType: 'TAX_DELINQUENCY',
        eventLayer: 'confirmed',
        sourceName: 'CountyRecords',
        triggerEventDate: new Date('2026-02-01'),
      };

      const fingerprint = generateEventFingerprint(input);

      for (let i = 0; i < 3; i++) {
        await db
          .insert(distressEvents)
          .values({
            eventId: generateId(),
            dominionLeadId: testPropertyId,
            eventType: 'TAX_DELINQUENCY',
            eventLayer: 'confirmed',
            sourceName: 'CountyRecords',
            fingerprint,
            reliabilityScore: '0.85',
            triggerEventDate: new Date('2026-02-01'),
          })
          .onConflictDoNothing({ target: distressEvents.fingerprint });
      }

      const [count] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(distressEvents)
        .where(eq(distressEvents.dominionLeadId, testPropertyId));

      expect(count.count).toBe(1);
    });

    it('different events for same property produce different fingerprints', async () => {
      const fp1 = generateEventFingerprint({
        dominionLeadId: testPropertyId,
        eventType: 'NOTICE_OF_DEFAULT',
        eventLayer: 'confirmed',
        sourceName: 'PropertyRadar',
        triggerEventDate: new Date('2026-01-15'),
      });

      const fp2 = generateEventFingerprint({
        dominionLeadId: testPropertyId,
        eventType: 'TAX_DELINQUENCY',
        eventLayer: 'confirmed',
        sourceName: 'CountyRecords',
        triggerEventDate: new Date('2026-01-20'),
      });

      expect(fp1).not.toBe(fp2);

      await db.insert(distressEvents).values({
        eventId: generateId(),
        dominionLeadId: testPropertyId,
        eventType: 'NOTICE_OF_DEFAULT',
        eventLayer: 'confirmed',
        sourceName: 'PropertyRadar',
        fingerprint: fp1,
        reliabilityScore: '0.90',
        triggerEventDate: new Date('2026-01-15'),
      });

      await db.insert(distressEvents).values({
        eventId: generateId(),
        dominionLeadId: testPropertyId,
        eventType: 'TAX_DELINQUENCY',
        eventLayer: 'confirmed',
        sourceName: 'CountyRecords',
        fingerprint: fp2,
        reliabilityScore: '0.85',
        triggerEventDate: new Date('2026-01-20'),
      });

      const [count] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(distressEvents)
        .where(eq(distressEvents.dominionLeadId, testPropertyId));

      expect(count.count).toBe(2);
    });
  });

  describe('Append-Only Enforcement', () => {
    it('UPDATE on distress_events raises an exception', async () => {
      const fingerprint = generateEventFingerprint({
        dominionLeadId: testPropertyId,
        eventType: 'PROBATE',
        eventLayer: 'confirmed',
        sourceName: 'CourtRecords',
        triggerEventDate: new Date('2026-01-10'),
      });

      await db.insert(distressEvents).values({
        eventId: generateId(),
        dominionLeadId: testPropertyId,
        eventType: 'PROBATE',
        eventLayer: 'confirmed',
        sourceName: 'CourtRecords',
        fingerprint,
        reliabilityScore: '0.95',
        triggerEventDate: new Date('2026-01-10'),
      });

      await expect(
        db
          .update(distressEvents)
          .set({ sourceName: 'TAMPERED' })
          .where(eq(distressEvents.dominionLeadId, testPropertyId)),
      ).rejects.toThrow(/Charter violation.*append-only/);
    });

    it('DELETE on distress_events raises an exception', async () => {
      const fingerprint = generateEventFingerprint({
        dominionLeadId: testPropertyId,
        eventType: 'BANKRUPTCY',
        eventLayer: 'confirmed',
        sourceName: 'FederalCourt',
        triggerEventDate: new Date('2026-01-12'),
      });

      await db.insert(distressEvents).values({
        eventId: generateId(),
        dominionLeadId: testPropertyId,
        eventType: 'BANKRUPTCY',
        eventLayer: 'confirmed',
        sourceName: 'FederalCourt',
        fingerprint,
        reliabilityScore: '0.95',
        triggerEventDate: new Date('2026-01-12'),
      });

      await expect(
        db.delete(distressEvents).where(eq(distressEvents.dominionLeadId, testPropertyId)),
      ).rejects.toThrow(/Charter violation.*append-only/);
    });
  });
});
