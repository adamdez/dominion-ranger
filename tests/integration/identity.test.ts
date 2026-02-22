/**
 * Charter Phase 1 — Identity Integrity Tests
 *
 * Validates:
 *   - Same CSV imported 3x -> no property growth
 *   - Upsert enrichment fills blanks without overwriting
 *   - APN + County uniqueness enforced atomically
 *   - dominion_lead_id immutable on conflict
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and, sql } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import { properties } from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Identity Integrity', () => {
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

  describe('Atomic Upsert — APN + County', () => {
    it('creates a new property on first insert', async () => {
      const id = generateId();
      const propertyId = generateId();

      const [result] = await db
        .insert(properties)
        .values({
          dominionLeadId: id,
          propertyId,
          apn: '123-456-789',
          county: 'Maricopa',
          state: 'AZ',
          ownerLast: 'Smith',
        })
        .returning();

      expect(result.dominionLeadId).toBe(id);
      expect(result.apn).toBe('123-456-789');
      expect(result.county).toBe('Maricopa');
    });

    it('same APN+County inserted 3x produces only 1 row', async () => {
      const apn = '111-222-333';
      const county = 'Pima';

      for (let i = 0; i < 3; i++) {
        await db
          .insert(properties)
          .values({
            dominionLeadId: generateId(),
            propertyId: generateId(),
            apn,
            county,
            state: 'AZ',
          })
          .onConflictDoUpdate({
            target: [properties.apn, properties.county],
            set: { updatedAt: new Date() },
          });
      }

      const [count] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(properties)
        .where(and(eq(properties.apn, apn), eq(properties.county, county)));

      expect(count.count).toBe(1);
    });

    it('preserves dominion_lead_id on conflict (immutability)', async () => {
      const originalId = generateId();
      const apn = '444-555-666';
      const county = 'Yavapai';

      await db.insert(properties).values({
        dominionLeadId: originalId,
        propertyId: generateId(),
        apn,
        county,
        state: 'AZ',
      });

      const newId = generateId();
      const [result] = await db
        .insert(properties)
        .values({
          dominionLeadId: newId,
          propertyId: generateId(),
          apn,
          county,
          state: 'AZ',
          phone: '555-1234',
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
      expect(result.dominionLeadId).not.toBe(newId);
      expect(result.phone).toBe('555-1234');
    });

    it('fills blank fields without overwriting existing data', async () => {
      const id = generateId();
      const apn = '777-888-999';
      const county = 'Coconino';

      await db.insert(properties).values({
        dominionLeadId: id,
        propertyId: generateId(),
        apn,
        county,
        state: 'AZ',
        phone: '555-0000',
        email: null,
      });

      const [result] = await db
        .insert(properties)
        .values({
          dominionLeadId: generateId(),
          propertyId: generateId(),
          apn,
          county,
          state: 'AZ',
          phone: null,
          email: 'new@test.com',
        })
        .onConflictDoUpdate({
          target: [properties.apn, properties.county],
          set: {
            phone: sql`COALESCE(excluded.phone, ${properties.phone})`,
            email: sql`COALESCE(excluded.email, ${properties.email})`,
            updatedAt: new Date(),
          },
        })
        .returning();

      expect(result.phone).toBe('555-0000');
      expect(result.email).toBe('new@test.com');
    });
  });

  describe('Property Count Stability', () => {
    it('batch of 10 identical records imported 3x produces exactly 10 properties', async () => {
      const records = Array.from({ length: 10 }, (_, i) => ({
        dominionLeadId: generateId(),
        propertyId: generateId(),
        apn: `BATCH-${String(i).padStart(3, '0')}`,
        county: 'Test',
        state: 'AZ',
      }));

      for (let round = 0; round < 3; round++) {
        for (const rec of records) {
          await db
            .insert(properties)
            .values({ ...rec, dominionLeadId: generateId(), propertyId: generateId() })
            .onConflictDoUpdate({
              target: [properties.apn, properties.county],
              set: { updatedAt: new Date() },
            });
        }
      }

      const [count] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(properties)
        .where(eq(properties.county, 'Test'));

      expect(count.count).toBe(10);
    });
  });
});
