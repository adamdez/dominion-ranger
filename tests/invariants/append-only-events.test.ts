/**
 * Charter v2.3 Audit — Invariant 1: distress_events append-only
 *
 * Validates that the database-level trigger prevents UPDATE and DELETE
 * on the distress_events table, while allowing INSERT.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import { properties, distressEvents } from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { generateEventFingerprint } from '../../src/lib/fingerprint.js';
import { applyAppendOnlyInvariants } from '../../src/db/invariants.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Invariant 1: distress_events append-only', () => {
  const db = canRun ? getTestDb() : (null as any);
  let testPropertyId: string;

  beforeAll(async () => {
    await cleanupTables();
    await applyAppendOnlyInvariants();

    testPropertyId = generateId();
    await db.insert(properties).values({
      dominionLeadId: testPropertyId,
      propertyId: generateId(),
      apn: 'AUDIT-EVT-001',
      county: 'AuditCounty',
      state: 'WA',
    });
  });

  afterAll(async () => {
    await cleanupTables();
    await closeTestDb();
  });

  beforeEach(async () => {
    await db.execute(sql`ALTER TABLE distress_events DISABLE TRIGGER USER`);
    await db.execute(sql`DELETE FROM distress_events`);
    await db.execute(sql`ALTER TABLE distress_events ENABLE TRIGGER USER`);
  });

  it('should allow INSERT on distress_events', async () => {
    const fp = generateEventFingerprint({
      dominionLeadId: testPropertyId,
      eventType: 'NOTICE_OF_DEFAULT',
      eventLayer: 'confirmed',
      sourceName: 'AuditTest',
      triggerEventDate: new Date('2026-02-01'),
    });

    const [result] = await db
      .insert(distressEvents)
      .values({
        eventId: generateId(),
        dominionLeadId: testPropertyId,
        eventType: 'NOTICE_OF_DEFAULT',
        eventLayer: 'confirmed',
        sourceName: 'AuditTest',
        fingerprint: fp,
        reliabilityScore: '0.90',
        triggerEventDate: new Date('2026-02-01'),
      })
      .returning();

    expect(result.eventId).toBeTruthy();
    expect(result.eventType).toBe('NOTICE_OF_DEFAULT');
  });

  it('should reject UPDATE on distress_events via trigger', async () => {
    const fp = generateEventFingerprint({
      dominionLeadId: testPropertyId,
      eventType: 'TAX_DELINQUENCY',
      eventLayer: 'confirmed',
      sourceName: 'AuditTest',
      triggerEventDate: new Date('2026-02-02'),
    });

    await db.insert(distressEvents).values({
      eventId: generateId(),
      dominionLeadId: testPropertyId,
      eventType: 'TAX_DELINQUENCY',
      eventLayer: 'confirmed',
      sourceName: 'AuditTest',
      fingerprint: fp,
      reliabilityScore: '0.85',
      triggerEventDate: new Date('2026-02-02'),
    });

    await expect(
      db.update(distressEvents)
        .set({ sourceName: 'TAMPERED' })
        .where(eq(distressEvents.dominionLeadId, testPropertyId)),
    ).rejects.toThrow(/Charter violation.*append-only/);
  });

  it('should reject DELETE on distress_events via trigger', async () => {
    const fp = generateEventFingerprint({
      dominionLeadId: testPropertyId,
      eventType: 'BANKRUPTCY',
      eventLayer: 'confirmed',
      sourceName: 'AuditTest',
      triggerEventDate: new Date('2026-02-03'),
    });

    await db.insert(distressEvents).values({
      eventId: generateId(),
      dominionLeadId: testPropertyId,
      eventType: 'BANKRUPTCY',
      eventLayer: 'confirmed',
      sourceName: 'AuditTest',
      fingerprint: fp,
      reliabilityScore: '0.95',
      triggerEventDate: new Date('2026-02-03'),
    });

    await expect(
      db.delete(distressEvents).where(eq(distressEvents.dominionLeadId, testPropertyId)),
    ).rejects.toThrow(/Charter violation.*append-only/);
  });

  it('should deduplicate events by fingerprint', async () => {
    const fp = generateEventFingerprint({
      dominionLeadId: testPropertyId,
      eventType: 'PROBATE',
      eventLayer: 'confirmed',
      sourceName: 'AuditTest',
      triggerEventDate: new Date('2026-02-04'),
    });

    for (let i = 0; i < 3; i++) {
      await db.insert(distressEvents)
        .values({
          eventId: generateId(),
          dominionLeadId: testPropertyId,
          eventType: 'PROBATE',
          eventLayer: 'confirmed',
          sourceName: 'AuditTest',
          fingerprint: fp,
          reliabilityScore: '0.90',
          triggerEventDate: new Date('2026-02-04'),
        })
        .onConflictDoNothing({ target: distressEvents.fingerprint });
    }

    const [count] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(distressEvents)
      .where(eq(distressEvents.dominionLeadId, testPropertyId));

    expect(count.count).toBe(1);
  });
});
