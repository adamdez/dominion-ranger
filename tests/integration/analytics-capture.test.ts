/**
 * Phase 2.5 — Analytics Capture Layer Integration Tests
 *
 * Test 1: Activity log captures workflow events (LEAD_PROMOTED → LEAD_ASSIGNED → COMPLIANCE_CHECKED → CALL_PLACED)
 * Test 2: Activity log is append-only (UPDATE/DELETE blocked by trigger)
 * Test 3: Daily rollup is deterministic (run twice → same values)
 * Test 4: Deal revenue reconciles with daily_metrics.revenue_cents
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq, sql, and } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  promotedLeads,
  leadInstances,
  users,
  activityLog,
  deals,
  dailyMetrics,
} from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { logActivity } from '../../src/modules/analytics/activity-logger.js';
import { applyAppendOnlyInvariants } from '../../src/db/invariants.js';
import { runNightlyRollup } from '../../src/jobs/nightly-rollup.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Analytics Capture Layer', () => {
  const db = canRun ? getTestDb() : (null as any);

  beforeAll(async () => {
    await cleanupTables();
    await applyAppendOnlyInvariants();
  });

  afterAll(async () => {
    await cleanupTables();
    await closeTestDb();
  });

  beforeEach(async () => {
    await db.execute(sql`ALTER TABLE activity_log DISABLE TRIGGER USER`);
    await db.execute(sql`DELETE FROM activity_log`);
    await db.execute(sql`DELETE FROM daily_metrics`);
    await db.execute(sql`DELETE FROM deals`);
    await db.execute(sql`DELETE FROM lead_instances`);
    await db.execute(sql`DELETE FROM promoted_leads`);
    await db.execute(sql`DELETE FROM users`);
    await db.execute(sql`DELETE FROM properties`);
    await db.execute(sql`ALTER TABLE activity_log ENABLE TRIGGER USER`);
  });

  describe('Test 1: Activity log captures workflow events', () => {
    it('logs LEAD_PROMOTED, LEAD_ASSIGNED, COMPLIANCE_CHECKED, CALL_PLACED', async () => {
      const dominionLeadId = generateId();
      const leadInstanceId = generateId();
      const promotionId = generateId();

      await db.insert(properties).values({
        dominionLeadId,
        propertyId: generateId(),
        apn: 'ACT-001',
        county: 'MARICOPA',
        state: 'AZ',
      });

      await db.insert(promotedLeads).values({
        promotionId,
        dominionLeadId,
        compositeScore: '85.0000',
        confidenceScore: '0.9000',
        scoreModelVersion: 'v1.0',
        marketingTier: 'A',
        urgencyLevel: 'HIGH',
      });

      await db.insert(leadInstances).values({
        leadInstanceId,
        dominionLeadId,
        promotionId,
        status: 'ASSIGNED',
        version: 1,
      });

      await logActivity({
        dominionLeadId,
        activityType: 'LEAD_PROMOTED',
        channel: 'OUTBOUND_COLD',
        meta: { promotionId, compositeScore: 85 },
      });

      await logActivity({
        dominionLeadId,
        leadInstanceId,
        userId: 'agent-1',
        activityType: 'LEAD_ASSIGNED',
        channel: 'OUTBOUND_COLD',
        meta: { userId: 'agent-1', leadInstanceId },
      });

      await logActivity({
        dominionLeadId,
        leadInstanceId,
        activityType: 'COMPLIANCE_CHECKED',
        channel: 'OUTBOUND_COLD',
        meta: { cleared: true },
      });

      await logActivity({
        dominionLeadId,
        leadInstanceId,
        userId: 'agent-1',
        activityType: 'CALL_PLACED',
        channel: 'OUTBOUND_COLD',
        meta: { leadInstanceId },
      });

      const entries = await db
        .select()
        .from(activityLog)
        .where(eq(activityLog.dominionLeadId, dominionLeadId));

      expect(entries).toHaveLength(4);

      const types = entries.map(e => e.activityType).sort();
      expect(types).toEqual([
        'CALL_PLACED',
        'COMPLIANCE_CHECKED',
        'LEAD_ASSIGNED',
        'LEAD_PROMOTED',
      ]);

      const assigned = entries.find(e => e.activityType === 'LEAD_ASSIGNED');
      expect(assigned?.userId).toBe('agent-1');
      expect(assigned?.leadInstanceId).toBe(leadInstanceId);
    });
  });

  describe('Test 2: Activity log is append-only', () => {
    it('INSERT succeeds', async () => {
      const dominionLeadId = generateId();
      await db.insert(properties).values({
        dominionLeadId,
        propertyId: generateId(),
        apn: 'APPONLY-001',
        county: 'MARICOPA',
        state: 'AZ',
      });

      await logActivity({
        dominionLeadId,
        activityType: 'CALL_PLACED',
        channel: 'OUTBOUND_COLD',
      });

      const [count] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityLog)
        .where(eq(activityLog.dominionLeadId, dominionLeadId));
      expect(count.count).toBe(1);
    });

    it('UPDATE on activity_log raises Charter violation', async () => {
      const dominionLeadId = generateId();
      await db.insert(properties).values({
        dominionLeadId,
        propertyId: generateId(),
        apn: 'APPONLY-002',
        county: 'MARICOPA',
        state: 'AZ',
      });

      await logActivity({
        dominionLeadId,
        activityType: 'CALL_PLACED',
        channel: 'OUTBOUND_COLD',
      });

      await expect(
        db.update(activityLog)
          .set({ channel: 'INBOUND_WEBSITE' })
          .where(eq(activityLog.dominionLeadId, dominionLeadId)),
      ).rejects.toThrow(/Charter violation.*append-only/);
    });

    it('DELETE on activity_log raises Charter violation', async () => {
      const dominionLeadId = generateId();
      await db.insert(properties).values({
        dominionLeadId,
        propertyId: generateId(),
        apn: 'APPONLY-003',
        county: 'MARICOPA',
        state: 'AZ',
      });

      await logActivity({
        dominionLeadId,
        activityType: 'CALL_PLACED',
        channel: 'OUTBOUND_COLD',
      });

      await expect(
        db.delete(activityLog).where(eq(activityLog.dominionLeadId, dominionLeadId)),
      ).rejects.toThrow(/Charter violation.*append-only/);
    });
  });

  describe('Test 3: Daily rollup is deterministic', () => {
    it('run twice produces identical values', async () => {
      const dominionLeadId = generateId();
      const targetDate = '2026-02-15';

      await db.insert(properties).values({
        dominionLeadId,
        propertyId: generateId(),
        apn: 'ROLL-001',
        county: 'MARICOPA',
        state: 'AZ',
      });

      // Seed known activity log entries
      const fixedTime = new Date(`${targetDate}T10:00:00Z`);
      await db.insert(activityLog).values([
        {
          dominionLeadId,
          activityType: 'CALL_PLACED',
          channel: 'OUTBOUND_COLD',
          occurredAt: fixedTime,
        },
        {
          dominionLeadId,
          activityType: 'CALL_PLACED',
          channel: 'OUTBOUND_COLD',
          occurredAt: fixedTime,
        },
        {
          dominionLeadId,
          activityType: 'CALL_CONNECTED',
          channel: 'OUTBOUND_COLD',
          occurredAt: fixedTime,
        },
        {
          dominionLeadId,
          activityType: 'INBOUND_FORM',
          channel: 'INBOUND_WEBSITE',
          occurredAt: fixedTime,
        },
      ]);

      // Run rollup — first pass
      await runNightlyRollup(targetDate);
      const [first] = await db
        .select()
        .from(dailyMetrics)
        .where(eq(dailyMetrics.date, targetDate));

      expect(first).toBeTruthy();
      expect(first.dials).toBe(2);
      expect(first.connections).toBe(1);
      expect(first.inboundLeads).toBe(1);

      // Run rollup — second pass (idempotent)
      await runNightlyRollup(targetDate);
      const [second] = await db
        .select()
        .from(dailyMetrics)
        .where(eq(dailyMetrics.date, targetDate));

      expect(second.dials).toBe(first.dials);
      expect(second.connections).toBe(first.connections);
      expect(second.inboundLeads).toBe(first.inboundLeads);
      expect(second.revenueCents).toBe(first.revenueCents);
    });
  });

  describe('Test 4: Deal revenue reconciles', () => {
    it('daily_metrics.revenue_cents = sum of deal assignment_fee_cents', async () => {
      const targetDate = '2026-02-20';

      const dominionLeadId1 = generateId();
      const dominionLeadId2 = generateId();
      const leadInstanceId1 = generateId();
      const leadInstanceId2 = generateId();
      const promotionId1 = generateId();
      const promotionId2 = generateId();

      for (const [did, lid, pid, apn, fee] of [
        [dominionLeadId1, leadInstanceId1, promotionId1, 'DEAL-001', 1500000],
        [dominionLeadId2, leadInstanceId2, promotionId2, 'DEAL-002', 850000],
      ] as const) {
        await db.insert(properties).values({
          dominionLeadId: did,
          propertyId: generateId(),
          apn,
          county: 'MARICOPA',
          state: 'AZ',
        });
        await db.insert(promotedLeads).values({
          promotionId: pid,
          dominionLeadId: did,
          compositeScore: '80.0000',
          confidenceScore: '0.9000',
          scoreModelVersion: 'v1.0',
          marketingTier: 'A',
          urgencyLevel: 'HIGH',
        });
        await db.insert(leadInstances).values({
          leadInstanceId: lid,
          dominionLeadId: did,
          promotionId: pid,
          status: 'CLOSED',
          version: 1,
        });
        await db.insert(deals).values({
          leadInstanceId: lid,
          dominionLeadId: did,
          assignmentFeeCents: fee,
          grossRevenueCents: fee,
          closeDate: targetDate,
          status: 'CLOSED',
        });
      }

      await runNightlyRollup(targetDate);

      const [metrics] = await db
        .select()
        .from(dailyMetrics)
        .where(eq(dailyMetrics.date, targetDate));

      expect(metrics).toBeTruthy();
      expect(metrics.deals).toBe(2);
      expect(metrics.revenueCents).toBe(1500000 + 850000);
    });
  });
});
