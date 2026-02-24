/**
 * Charter Phase 1 — Workflow Concurrency & Compliance Tests
 *
 * Test 4: Two concurrent claims on same lead — exactly one succeeds
 * Test 5: DNC-suppressed lead blocked from dial eligibility
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  promotedLeads,
  leadInstances,
  users,
} from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { claimLead, createLeadInstance, runComplianceGating } from '../../src/modules/workflow/service.js';
import * as complianceService from '../../src/modules/compliance/service.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Workflow Concurrency', () => {
  const db = canRun ? getTestDb() : (null as any);

  beforeAll(async () => {
    await cleanupTables();
  });

  afterAll(async () => {
    await cleanupTables();
    await closeTestDb();
  });

  beforeEach(async () => {
    await db.execute(sql`ALTER TABLE activity_log DISABLE TRIGGER USER`);
    await db.execute(sql`DELETE FROM activity_log`);
    await db.execute(sql`ALTER TABLE activity_log ENABLE TRIGGER USER`);
    await db.execute(sql`DELETE FROM audit_log`);
    await db.execute(sql`DELETE FROM lead_instances`);
    await db.execute(sql`DELETE FROM promoted_leads`);
    await db.execute(sql`DELETE FROM signal_accumulation`);
    await db.execute(sql`DELETE FROM users`);
    await db.execute(sql`DELETE FROM properties`);
  });

  describe('Concurrent Claims', () => {
    it('two concurrent claims on same lead — exactly one succeeds', async () => {
      const propertyId = generateId();
      await db.insert(properties).values({
        dominionLeadId: propertyId,
        propertyId: generateId(),
        apn: 'CONC-001',
        county: 'TestCounty',
        state: 'AZ',
      });

      const promotionId = generateId();
      await db.insert(promotedLeads).values({
        promotionId,
        dominionLeadId: propertyId,
        compositeScore: '80.0000',
        confidenceScore: '0.9000',
        scoreModelVersion: 'v1.0',
        marketingTier: 'A',
        urgencyLevel: 'HIGH',
      });

      const leadInstanceId = generateId();
      await db.insert(leadInstances).values({
        leadInstanceId,
        dominionLeadId: propertyId,
        promotionId,
        status: 'PROMOTED',
        version: 1,
      });

      const userA = generateId();
      const userB = generateId();
      await db.insert(users).values([
        { userId: userA, email: 'a@test.com', role: 'FIELD' },
        { userId: userB, email: 'b@test.com', role: 'FIELD' },
      ]);

      const results = await Promise.allSettled([
        claimLead({ leadInstanceId, userId: userA, expectedVersion: 1 }),
        claimLead({ leadInstanceId, userId: userB, expectedVersion: 1 }),
      ]);

      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(1);

      const [updatedLead] = await db
        .select()
        .from(leadInstances)
        .where(eq(leadInstances.leadInstanceId, leadInstanceId));

      expect(updatedLead.version).toBe(2);
      expect(updatedLead.status).toBe('ASSIGNED');
      expect([userA, userB]).toContain(updatedLead.assignedTo);
    });
  });

  describe('DNC Compliance Gating', () => {
    it('DNC-flagged lead is transitioned to DEAD, not DIAL_READY', async () => {
      const dncSpy = vi.spyOn(complianceService, 'checkDnc').mockResolvedValue({
        phone: '555-DNC-TEST',
        isOnDnc: true,
        checkedAt: new Date(),
        source: 'test_mock',
      });

      try {
        const propertyId = generateId();
        await db.insert(properties).values({
          dominionLeadId: propertyId,
          propertyId: generateId(),
          apn: 'DNC-001',
          county: 'TestCounty',
          state: 'AZ',
          phone: '555-DNC-TEST',
        });

        const promotionId = generateId();
        await db.insert(promotedLeads).values({
          promotionId,
          dominionLeadId: propertyId,
          compositeScore: '75.0000',
          confidenceScore: '0.8500',
          scoreModelVersion: 'v1.0',
          marketingTier: 'B',
          urgencyLevel: 'MEDIUM',
        });

        const leadInstanceId = generateId();
        await db.insert(leadInstances).values({
          leadInstanceId,
          dominionLeadId: propertyId,
          promotionId,
          status: 'ASSIGNED',
          version: 1,
        });

        const result = await runComplianceGating(leadInstanceId);

        expect(result.status).toBe('DEAD');
        expect(result.complianceCleared).toBe(false);
        expect(result.dncCheckedAt).not.toBeNull();
      } finally {
        dncSpy.mockRestore();
      }
    });

    it('non-DNC lead passes compliance and reaches DIAL_READY', async () => {
      const propertyId = generateId();
      await db.insert(properties).values({
        dominionLeadId: propertyId,
        propertyId: generateId(),
        apn: 'CLEAN-001',
        county: 'TestCounty',
        state: 'AZ',
        phone: '555-CLEAN',
      });

      const promotionId = generateId();
      await db.insert(promotedLeads).values({
        promotionId,
        dominionLeadId: propertyId,
        compositeScore: '75.0000',
        confidenceScore: '0.8500',
        scoreModelVersion: 'v1.0',
        marketingTier: 'B',
        urgencyLevel: 'MEDIUM',
      });

      const leadInstanceId = generateId();
      await db.insert(leadInstances).values({
        leadInstanceId,
        dominionLeadId: propertyId,
        promotionId,
        status: 'ASSIGNED',
        version: 1,
      });

      const result = await runComplianceGating(leadInstanceId);

      expect(result.status).toBe('DIAL_READY');
      expect(result.complianceCleared).toBe(true);
      expect(result.dncCheckedAt).not.toBeNull();
    });
  });
});
