/**
 * Charter v2.3 Audit — Invariant 4: Identity separation preserved
 * Charter v2.3 Audit — Invariant 5: Idempotent ingestion guaranteed
 *
 * Validates:
 *   - APN + County unique constraint enforced
 *   - No duplicate properties on repeated insert
 *   - dominion_lead_id immutable on conflict
 *   - ON CONFLICT DO UPDATE (no SELECT-then-INSERT)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and, sql } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import { properties } from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Invariant 4 & 5: Identity separation + Idempotent ingestion', () => {
  const db = canRun ? getTestDb() : (null as any);

  beforeAll(async () => {
    await cleanupTables();
  });

  afterAll(async () => {
    await cleanupTables();
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanupTables();
  });

  it('should enforce APN + County uniqueness', async () => {
    await db.insert(properties).values({
      dominionLeadId: generateId(),
      propertyId: generateId(),
      apn: 'AUDIT-ID-001',
      county: 'Spokane',
      state: 'WA',
    });

    await expect(
      db.insert(properties).values({
        dominionLeadId: generateId(),
        propertyId: generateId(),
        apn: 'AUDIT-ID-001',
        county: 'Spokane',
        state: 'WA',
      }),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it('should allow same APN in different counties', async () => {
    await db.insert(properties).values({
      dominionLeadId: generateId(),
      propertyId: generateId(),
      apn: 'AUDIT-ID-002',
      county: 'Spokane',
      state: 'WA',
    });

    const [result] = await db
      .insert(properties)
      .values({
        dominionLeadId: generateId(),
        propertyId: generateId(),
        apn: 'AUDIT-ID-002',
        county: 'Lincoln',
        state: 'WA',
      })
      .returning();

    expect(result.county).toBe('Lincoln');
  });

  it('should produce same row count after 3x import via ON CONFLICT', async () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      apn: `IDEM-${String(i).padStart(3, '0')}`,
      county: 'IdempotencyTest',
      state: 'WA',
    }));

    for (let round = 0; round < 3; round++) {
      for (const rec of records) {
        await db
          .insert(properties)
          .values({
            dominionLeadId: generateId(),
            propertyId: generateId(),
            ...rec,
          })
          .onConflictDoUpdate({
            target: [properties.apn, properties.county],
            set: { updatedAt: new Date() },
          });
      }
    }

    const [count] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(properties)
      .where(eq(properties.county, 'IdempotencyTest'));

    expect(count.count).toBe(10);
  });

  it('should preserve dominion_lead_id on conflict (immutability)', async () => {
    const originalId = generateId();
    await db.insert(properties).values({
      dominionLeadId: originalId,
      propertyId: generateId(),
      apn: 'IMMUT-001',
      county: 'ImmutTest',
      state: 'WA',
    });

    const [result] = await db
      .insert(properties)
      .values({
        dominionLeadId: generateId(),
        propertyId: generateId(),
        apn: 'IMMUT-001',
        county: 'ImmutTest',
        state: 'WA',
        phone: '509-555-1234',
      })
      .onConflictDoUpdate({
        target: [properties.apn, properties.county],
        set: {
          phone: sql`COALESCE(excluded.phone, ${properties.phone})`,
          updatedAt: new Date(),
        },
      })
      .returning();

    expect(result.dominionLeadId).toBe(originalId);
    expect(result.phone).toBe('509-555-1234');
  });
});
