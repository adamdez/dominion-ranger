/**
 * Charter Phase 1 — Scoring Invariant Tests
 *
 * Test 1: scoring_records append-only enforcement (UPDATE/DELETE blocked by trigger)
 * Test 2: Scoring version preservation (old records untouched when new config re-scores)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  scoringRecords,
  scoringModelConfigs,
  distressEvents,
} from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { generateEventFingerprint } from '../../src/lib/fingerprint.js';
import { applyAppendOnlyInvariants } from '../../src/db/invariants.js';
import { seedScoringModel } from '../../src/db/seeds/scoring-model-v1.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Scoring Record Invariants', () => {
  const db = canRun ? getTestDb() : (null as any);
  let testPropertyId: string;

  beforeAll(async () => {
    await cleanupTables();
    await applyAppendOnlyInvariants();
    await seedScoringModel();

    testPropertyId = generateId();
    await db.insert(properties).values({
      dominionLeadId: testPropertyId,
      propertyId: generateId(),
      apn: 'SCORE-INV-001',
      county: 'TestCounty',
      state: 'AZ',
    });
  });

  afterAll(async () => {
    await cleanupTables();
    await closeTestDb();
  });

  beforeEach(async () => {
    await db.execute(sql`ALTER TABLE scoring_records DISABLE TRIGGER ALL`);
    await db.execute(sql`DELETE FROM scoring_records`);
    await db.execute(sql`ALTER TABLE scoring_records ENABLE TRIGGER ALL`);
  });

  describe('Append-Only Enforcement', () => {
    it('INSERT succeeds on scoring_records', async () => {
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
      expect(result.compositeScore).toBe('75.5000');
    });

    it('UPDATE on scoring_records raises Charter violation', async () => {
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

    it('DELETE on scoring_records raises Charter violation', async () => {
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
  });

  describe('Scoring Version Preservation', () => {
    it('v1.0 record is untouched when v2.0 re-score appends a new record', async () => {
      const v1ScoreId = generateId();
      await db.insert(scoringRecords).values({
        scoreId: v1ScoreId,
        dominionLeadId: testPropertyId,
        compositeScore: '65.0000',
        motivationScore: '70.0000',
        dealScore: '55.0000',
        confidenceScore: '0.7500',
        scoreModelVersion: 'v1.0',
        scoreInputsSnapshot: { version: 'v1.0' },
        signalContributions: [],
      });

      const v2ScoreId = generateId();
      await db.insert(scoringRecords).values({
        scoreId: v2ScoreId,
        dominionLeadId: testPropertyId,
        compositeScore: '72.0000',
        motivationScore: '75.0000',
        dealScore: '60.0000',
        confidenceScore: '0.8000',
        scoreModelVersion: 'v2.0',
        scoreInputsSnapshot: { version: 'v2.0' },
        signalContributions: [],
      });

      const [v1Record] = await db
        .select()
        .from(scoringRecords)
        .where(eq(scoringRecords.scoreId, v1ScoreId));

      const [v2Record] = await db
        .select()
        .from(scoringRecords)
        .where(eq(scoringRecords.scoreId, v2ScoreId));

      expect(v1Record.compositeScore).toBe('65.0000');
      expect(v1Record.scoreModelVersion).toBe('v1.0');

      expect(v2Record.compositeScore).toBe('72.0000');
      expect(v2Record.scoreModelVersion).toBe('v2.0');

      const allRecords = await db
        .select()
        .from(scoringRecords)
        .where(eq(scoringRecords.dominionLeadId, testPropertyId));

      expect(allRecords.length).toBe(2);
      expect(allRecords.map(r => r.scoreModelVersion).sort()).toEqual(['v1.0', 'v2.0']);
    });
  });
});
