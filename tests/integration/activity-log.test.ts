/**
 * Activity Log — Append-Only + Workflow Integration
 *
 * - INSERT succeeds
 * - UPDATE/DELETE blocked (append-only enforced)
 * - Key workflow actions create activity_log rows
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  getTestDb,
  cleanupTables,
  closeTestDb,
  isTestDbAvailable,
} from '../helpers/test-db.js';
import {
  properties,
  activityLog,
  leadInstances,
  promotedLeads,
  users,
} from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { applyAppendOnlyInvariants } from '../../src/db/invariants.js';
import { seedScoringModel } from '../../src/db/seeds/scoring-model-v1.js';
import { logActivity } from '../../src/modules/analytics/activity-logger.js';
import { claimLead, runComplianceGating } from '../../src/modules/workflow/index.js';
import { wireEventHandlers } from '../../src/events/wiring.js';
import { createLeadInstance } from '../../src/modules/workflow/index.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Activity Log Invariants', () => {
  const db = canRun ? getTestDb() : (null as any);
  let testPropertyId: string;

  beforeAll(async () => {
    await cleanupTables();
    await applyAppendOnlyInvariants();
    await seedScoringModel();
    wireEventHandlers();

    testPropertyId = generateId();
    await db.insert(users).values({
      userId: 'test-user',
      email: 'test@test.com',
      role: 'FIELD',
    });
    await db.insert(properties).values({
      dominionLeadId: testPropertyId,
      propertyId: generateId(),
      apn: `ACTIVITY-${testPropertyId.slice(0, 8)}`,
      county: 'TestCounty',
      state: 'AZ',
    });
  });

  afterAll(async () => {
    await cleanupTables();
    await closeTestDb();
  });

  beforeEach(async () => {
    await db.execute(sql`ALTER TABLE activity_log DISABLE TRIGGER USER`);
    await db.execute(sql`DELETE FROM activity_log`);
    await db.execute(sql`ALTER TABLE activity_log ENABLE TRIGGER USER`);
    await db.execute(sql`DELETE FROM lead_instances WHERE dominion_lead_id = ${testPropertyId}`);
    await db.execute(sql`DELETE FROM promoted_leads WHERE dominion_lead_id = ${testPropertyId}`);
  });

  describe('Append-Only Enforcement', () => {
    it('INSERT on activity_log succeeds', async () => {
      await logActivity({
        dominionLeadId: testPropertyId,
        activityType: 'STATUS_CHANGED',
        channel: 'OUTBOUND_COLD',
        meta: { test: true },
      });

      const rows = await db
        .select()
        .from(activityLog)
        .where(eq(activityLog.dominionLeadId, testPropertyId));
      expect(rows.length).toBe(1);
      expect(rows[0].activityType).toBe('STATUS_CHANGED');
    });

    it('UPDATE on activity_log raises Charter violation', async () => {
      await logActivity({
        dominionLeadId: testPropertyId,
        activityType: 'STATUS_CHANGED',
        channel: 'OUTBOUND_COLD',
      });
      const [row] = await db.select().from(activityLog).where(eq(activityLog.dominionLeadId, testPropertyId));

      await expect(
        db.update(activityLog).set({ activityType: 'LEAD_PROMOTED' }).where(eq(activityLog.activityId, row.activityId)),
      ).rejects.toThrow(/Charter violation.*append-only/);
    });

    it('DELETE on activity_log raises Charter violation', async () => {
      await logActivity({
        dominionLeadId: testPropertyId,
        activityType: 'STATUS_CHANGED',
        channel: 'OUTBOUND_COLD',
      });
      const [row] = await db.select().from(activityLog).where(eq(activityLog.dominionLeadId, testPropertyId));

      await expect(db.delete(activityLog).where(eq(activityLog.activityId, row.activityId))).rejects.toThrow(
        /Charter violation.*append-only/,
      );
    });
  });

  describe('Workflow Actions Create Activity', () => {
    it('claimLead creates LEAD_ASSIGNED activity', async () => {
      const promotionId = generateId();
      await db.insert(promotedLeads).values({
        promotionId,
        dominionLeadId: testPropertyId,
        compositeScore: '80.0000',
        confidenceScore: '0.9000',
        scoreModelVersion: 'v1.0',
        marketingTier: 'A',
        urgencyLevel: 'HIGH',
      });
      await createLeadInstance({ dominionLeadId: testPropertyId, promotionId });
      const [instance] = await db.select().from(leadInstances).where(eq(leadInstances.dominionLeadId, testPropertyId));

      await claimLead({
        leadInstanceId: instance.leadInstanceId,
        userId: 'test-user',
        expectedVersion: instance.version,
      });

      const rows = await db
        .select()
        .from(activityLog)
        .where(eq(activityLog.dominionLeadId, testPropertyId));
      const assigned = rows.find((r) => r.activityType === 'LEAD_ASSIGNED');
      expect(assigned).toBeDefined();
    });

    it('runComplianceGating creates COMPLIANCE_CHECKED activity', async () => {
      const promotionId = generateId();
      await db.insert(promotedLeads).values({
        promotionId,
        dominionLeadId: testPropertyId,
        compositeScore: '80.0000',
        confidenceScore: '0.9000',
        scoreModelVersion: 'v1.0',
        marketingTier: 'A',
        urgencyLevel: 'HIGH',
      });
      await createLeadInstance({ dominionLeadId: testPropertyId, promotionId });
      const [instance] = await db.select().from(leadInstances).where(eq(leadInstances.dominionLeadId, testPropertyId));
      await claimLead({
        leadInstanceId: instance.leadInstanceId,
        userId: 'test-user',
        expectedVersion: instance.version,
      });

      await runComplianceGating(instance.leadInstanceId);

      const rows = await db
        .select()
        .from(activityLog)
        .where(eq(activityLog.dominionLeadId, testPropertyId));
      const compliance = rows.find((r) => r.activityType === 'COMPLIANCE_CHECKED');
      expect(compliance).toBeDefined();
    });
  });
});
