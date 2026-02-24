/**
 * Charter v2.3 Audit — Invariant 2: scoring_records append-only
 * Charter v2.3 Audit — Invariant 3: Scoring version preserved
 *
 * Validates:
 *   - UPDATE on scoring_records blocked by trigger
 *   - DELETE on scoring_records blocked by trigger
 *   - INSERT allowed
 *   - Version history preserved across re-scores
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import { properties, scoringRecords } from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { applyAppendOnlyInvariants } from '../../src/db/invariants.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Invariant 2 & 3: scoring_records append-only + version preserved', () => {
  const db = canRun ? getTestDb() : (null as any);
  let testPropertyId: string;

  beforeAll(async () => {
    await cleanupTables();
    await applyAppendOnlyInvariants();

    testPropertyId = generateId();
    await db.insert(properties).values({
      dominionLeadId: testPropertyId,
      propertyId: generateId(),
      apn: 'AUDIT-SCR-001',
      county: 'AuditCounty',
      state: 'WA',
    });
  });

  afterAll(async () => {
    await cleanupTables();
    await closeTestDb();
  });

  beforeEach(async () => {
    await db.execute(sql`ALTER TABLE scoring_records DISABLE TRIGGER USER`);
    await db.execute(sql`DELETE FROM scoring_records`);
    await db.execute(sql`ALTER TABLE scoring_records ENABLE TRIGGER USER`);
  });

  it('should allow INSERT on scoring_records', async () => {
    const scoreId = generateId();
    const [result] = await db
      .insert(scoringRecords)
      .values({
        scoreId,
        dominionLeadId: testPropertyId,
        compositeScore: '75.5000',
        confidenceScore: '0.8500',
        scoreModelVersion: 'v1.0',
        scoreInputsSnapshot: { eventCount: 3 },
        signalContributions: [],
      })
      .returning();

    expect(result.scoreId).toBe(scoreId);
  });

  it('should reject UPDATE on scoring_records via trigger', async () => {
    const scoreId = generateId();
    await db.insert(scoringRecords).values({
      scoreId,
      dominionLeadId: testPropertyId,
      compositeScore: '75.5000',
      confidenceScore: '0.8500',
      scoreModelVersion: 'v1.0',
      scoreInputsSnapshot: { eventCount: 3 },
      signalContributions: [],
    });

    await expect(
      db.update(scoringRecords)
        .set({ compositeScore: '99.9999' })
        .where(eq(scoringRecords.scoreId, scoreId)),
    ).rejects.toThrow(/Charter violation.*append-only/);
  });

  it('should reject DELETE on scoring_records via trigger', async () => {
    const scoreId = generateId();
    await db.insert(scoringRecords).values({
      scoreId,
      dominionLeadId: testPropertyId,
      compositeScore: '75.5000',
      confidenceScore: '0.8500',
      scoreModelVersion: 'v1.0',
      scoreInputsSnapshot: { eventCount: 3 },
      signalContributions: [],
    });

    await expect(
      db.delete(scoringRecords).where(eq(scoringRecords.scoreId, scoreId)),
    ).rejects.toThrow(/Charter violation.*append-only/);
  });

  it('should preserve v1.0 record when v2.0 re-score appends', async () => {
    const v1Id = generateId();
    await db.insert(scoringRecords).values({
      scoreId: v1Id,
      dominionLeadId: testPropertyId,
      compositeScore: '65.0000',
      motivationScore: '70.0000',
      dealScore: '55.0000',
      confidenceScore: '0.7500',
      scoreModelVersion: 'v1.0',
      scoreInputsSnapshot: { version: 'v1.0' },
      signalContributions: [],
    });

    const v2Id = generateId();
    await db.insert(scoringRecords).values({
      scoreId: v2Id,
      dominionLeadId: testPropertyId,
      compositeScore: '72.0000',
      motivationScore: '75.0000',
      dealScore: '60.0000',
      confidenceScore: '0.8000',
      scoreModelVersion: 'v2.0',
      scoreInputsSnapshot: { version: 'v2.0' },
      signalContributions: [],
    });

    const allRecords = await db
      .select()
      .from(scoringRecords)
      .where(eq(scoringRecords.dominionLeadId, testPropertyId));

    expect(allRecords.length).toBe(2);

    const v1 = allRecords.find(r => r.scoreModelVersion === 'v1.0');
    const v2 = allRecords.find(r => r.scoreModelVersion === 'v2.0');

    expect(v1?.compositeScore).toBe('65.0000');
    expect(v2?.compositeScore).toBe('72.0000');
  });

  it('should never have NULL score_model_version', async () => {
    const scoreId = generateId();
    await db.insert(scoringRecords).values({
      scoreId,
      dominionLeadId: testPropertyId,
      compositeScore: '50.0000',
      confidenceScore: '0.7000',
      scoreModelVersion: 'v1.0',
      scoreInputsSnapshot: {},
      signalContributions: [],
    });

    const records = await db
      .select({ version: scoringRecords.scoreModelVersion })
      .from(scoringRecords)
      .where(eq(scoringRecords.dominionLeadId, testPropertyId));

    for (const r of records) {
      expect(r.version).not.toBeNull();
      expect(r.version).toBeTruthy();
    }
  });
});
