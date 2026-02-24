/**
 * Auto-pipeline integration test
 *
 * Verifies: seed 50 properties + distress → scoreAndPromoteBatch →
 * scoring_records > 0 and lead_instances > 0 (dial queue populated)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  scoringRecords,
  distressEvents,
  leadInstances,
  promotedLeads,
} from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { generateEventFingerprint } from '../../src/lib/fingerprint.js';
import { applyAppendOnlyInvariants } from '../../src/db/invariants.js';
import { seedScoringModel } from '../../src/db/seeds/scoring-model-v1.js';
import { scoreAndPromoteBatch } from '../../src/modules/auto-pipeline/index.js';
import { invalidateConfigCache } from '../../src/modules/scoring/service.js';
import { wireEventHandlers } from '../../src/events/wiring.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Auto-pipeline: ingest → scored → promoted', () => {
  const db = canRun ? getTestDb() : (null as any);

  beforeAll(async () => {
    wireEventHandlers(); // lead.promoted → createLeadInstance
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
    await cleanupTables();
    await applyAppendOnlyInvariants();
    await seedScoringModel();
    invalidateConfigCache();
  });

  it('seed 50 properties + distress → scoring_records > 0 → dial queue (lead_instances) > 0', async () => {
    const ids: string[] = [];

    for (let i = 0; i < 50; i++) {
      const dominionLeadId = generateId();
      ids.push(dominionLeadId);

      await db.insert(properties).values({
        dominionLeadId,
        propertyId: generateId(),
        apn: `AUTO-${i.toString().padStart(3, '0')}`,
        county: 'TestCounty',
        state: 'AZ',
        equityEstimate: '150000.00',
        ownershipDurationMonths: 60,
        absenteeOwner: true,
        mortgageStatus: 'LATE_60',
      });

      const fp = generateEventFingerprint({
        dominionLeadId,
        eventType: 'NOTICE_OF_DEFAULT',
        eventLayer: 'confirmed',
        sourceName: 'test',
        triggerEventDate: new Date('2026-01-15'),
      });

      await db.insert(distressEvents).values({
        eventId: generateId(),
        dominionLeadId,
        eventType: 'NOTICE_OF_DEFAULT',
        eventLayer: 'confirmed',
        sourceName: 'test',
        fingerprint: fp,
        reliabilityScore: '0.90',
        triggerEventDate: new Date('2026-01-15'),
      });
    }

    const result = await scoreAndPromoteBatch(ids);

    expect(result.scored).toBe(50);
    expect(result.errors).toBe(0);

    const [scoringCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(scoringRecords);
    expect(scoringCount.count).toBeGreaterThan(0);

    const [leadCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leadInstances);
    expect(leadCount.count).toBeGreaterThan(0);

    const [promotedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(promotedLeads);
    expect(promotedCount.count).toBeGreaterThan(0);
  });
});
