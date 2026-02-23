/**
 * Charter Phase 1 — State Transition Rejection Integration Test
 *
 * Charter §V, §X: "Invalid state transitions rejected"
 *
 * Unlike the unit test (pure function), this validates that
 * workflow/service.ts transitionLead() rejects invalid transitions
 * when hitting the real database with optimistic locking.
 *
 * Validates:
 *   1. Skipping COMPLIANCE_PENDING is rejected
 *   2. Backward transitions are rejected
 *   3. Terminal state escapes are rejected
 *   4. Compliance gating blocks DIALING when not cleared
 *   5. Valid forward path works end-to-end
 *   6. Rejected transitions leave DB state unchanged
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
import {
  transitionLead,
  claimLead,
  createLeadInstance,
  runComplianceGating,
} from '../../src/modules/workflow/service.js';
import * as complianceService from '../../src/modules/compliance/service.js';
import { ValidationError, ComplianceError } from '../../src/lib/errors.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('State Transition Rejection (Integration)', () => {
  const db = canRun ? getTestDb() : (null as any);

  beforeAll(async () => {
    await cleanupTables();
  });

  afterAll(async () => {
    await cleanupTables();
    await closeTestDb();
  });

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM audit_log`);
    await db.execute(sql`DELETE FROM lead_instances`);
    await db.execute(sql`DELETE FROM promoted_leads`);
    await db.execute(sql`DELETE FROM users`);
    await db.execute(sql`DELETE FROM properties`);
  });

  /** Create a lead instance seeded at a specific status */
  async function createLeadAtStatus(
    status: string,
    opts?: { complianceCleared?: boolean },
  ): Promise<{ leadInstanceId: string; dominionLeadId: string; version: number }> {
    const dominionLeadId = generateId();
    const promotionId = generateId();
    const leadInstanceId = generateId();

    await db.insert(properties).values({
      dominionLeadId,
      propertyId: generateId(),
      apn: `ST-${generateId().slice(0, 8)}`,
      county: 'MARICOPA',
      state: 'AZ',
    });

    await db.insert(promotedLeads).values({
      promotionId,
      dominionLeadId,
      compositeScore: '75.0000',
      confidenceScore: '0.8500',
      scoreModelVersion: 'v1.0',
      marketingTier: 'A',
      urgencyLevel: 'HIGH',
    });

    await db.insert(leadInstances).values({
      leadInstanceId,
      dominionLeadId,
      promotionId,
      status: status as any,
      version: 1,
      complianceCleared: opts?.complianceCleared ?? false,
    });

    return { leadInstanceId, dominionLeadId, version: 1 };
  }

  describe('Invalid transitions are rejected', () => {
    it('rejects ASSIGNED → DIAL_READY (must go through COMPLIANCE_PENDING)', async () => {
      const { leadInstanceId, version } = await createLeadAtStatus('ASSIGNED');

      await expect(
        transitionLead({ leadInstanceId, toStatus: 'DIAL_READY', expectedVersion: version }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects ASSIGNED → DIALING (skipping two steps)', async () => {
      const { leadInstanceId, version } = await createLeadAtStatus('ASSIGNED');

      await expect(
        transitionLead({ leadInstanceId, toStatus: 'DIALING', expectedVersion: version }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects backward transition CONTACTED → ASSIGNED', async () => {
      const { leadInstanceId, version } = await createLeadAtStatus('CONTACTED');

      await expect(
        transitionLead({ leadInstanceId, toStatus: 'ASSIGNED', expectedVersion: version }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects escape from terminal DEAD status', async () => {
      const { leadInstanceId, version } = await createLeadAtStatus('DEAD');

      await expect(
        transitionLead({ leadInstanceId, toStatus: 'ASSIGNED', expectedVersion: version }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects escape from terminal CLOSED status', async () => {
      const { leadInstanceId, version } = await createLeadAtStatus('CLOSED');

      await expect(
        transitionLead({ leadInstanceId, toStatus: 'PROMOTED', expectedVersion: version }),
      ).rejects.toThrow(ValidationError);
    });

    it('rejects PROMOTED → DIALING (cannot skip to dialing)', async () => {
      const { leadInstanceId, version } = await createLeadAtStatus('PROMOTED');

      await expect(
        transitionLead({ leadInstanceId, toStatus: 'DIALING', expectedVersion: version }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('Compliance gating enforcement', () => {
    it('rejects DIAL_READY → DIALING when complianceCleared is false', async () => {
      const { leadInstanceId, version } = await createLeadAtStatus('DIAL_READY', {
        complianceCleared: false,
      });

      await expect(
        transitionLead({ leadInstanceId, toStatus: 'DIALING', expectedVersion: version }),
      ).rejects.toThrow(ComplianceError);
    });

    it('allows DIAL_READY → DIALING when complianceCleared is true', async () => {
      const { leadInstanceId, version } = await createLeadAtStatus('DIAL_READY', {
        complianceCleared: true,
      });

      const result = await transitionLead({
        leadInstanceId,
        toStatus: 'DIALING',
        expectedVersion: version,
      });

      expect(result.status).toBe('DIALING');
    });
  });

  describe('Full lifecycle end-to-end', () => {
    it('PROMOTED → ASSIGNED → COMPLIANCE_PENDING → DIAL_READY → DIALING → CONTACTED', async () => {
      const dncSpy = vi.spyOn(complianceService, 'checkDnc').mockResolvedValue({
        phone: '555-TEST', isOnDnc: false, checkedAt: new Date(), source: 'test_mock',
      });
      const litSpy = vi.spyOn(complianceService, 'checkLitigator').mockResolvedValue({
        ownerName: 'Test', isLitigator: false, checkedAt: new Date(), source: 'test_mock',
      });

      try {
        const dominionLeadId = generateId();
        await db.insert(properties).values({
          dominionLeadId,
          propertyId: generateId(),
          apn: 'LIFE-001',
          county: 'MARICOPA',
          state: 'AZ',
          phone: '555-TEST',
          ownerName: 'Test Owner',
        });

        const promotionId = generateId();
        await db.insert(promotedLeads).values({
          promotionId,
          dominionLeadId,
          compositeScore: '85.0000',
          confidenceScore: '0.9000',
          scoreModelVersion: 'v1.0',
          marketingTier: 'A',
          urgencyLevel: 'CRITICAL',
        });

        const userId = generateId();
        await db.insert(users).values({ userId, email: 'lifecycle@test.com', role: 'FIELD' });

        // PROMOTED
        const instance = await createLeadInstance({ dominionLeadId, promotionId });
        expect(instance.status).toBe('PROMOTED');

        // PROMOTED → ASSIGNED
        const claimed = await claimLead({
          leadInstanceId: instance.lead_instance_id ?? instance.leadInstanceId,
          userId,
          expectedVersion: 1,
        });
        expect(claimed.status).toBe('ASSIGNED');

        // ASSIGNED → COMPLIANCE_PENDING → DIAL_READY
        const leadId = claimed.lead_instance_id ?? claimed.leadInstanceId;
        const compliant = await runComplianceGating(leadId);
        expect(compliant.status).toBe('DIAL_READY');
        expect(compliant.complianceCleared).toBe(true);

        // DIAL_READY → DIALING
        const compVersion = compliant.version;
        const dialing = await transitionLead({
          leadInstanceId: leadId,
          toStatus: 'DIALING',
          expectedVersion: compVersion,
        });
        expect(dialing.status).toBe('DIALING');

        // DIALING → CONTACTED
        const contacted = await transitionLead({
          leadInstanceId: leadId,
          toStatus: 'CONTACTED',
          expectedVersion: dialing.version,
        });
        expect(contacted.status).toBe('CONTACTED');
      } finally {
        dncSpy.mockRestore();
        litSpy.mockRestore();
      }
    });
  });

  describe('Database integrity on rejection', () => {
    it('rejected transition does not modify the lead instance', async () => {
      const { leadInstanceId, version } = await createLeadAtStatus('ASSIGNED');

      await expect(
        transitionLead({ leadInstanceId, toStatus: 'DIAL_READY', expectedVersion: version }),
      ).rejects.toThrow();

      const [lead] = await db
        .select()
        .from(leadInstances)
        .where(eq(leadInstances.leadInstanceId, leadInstanceId));

      expect(lead.status).toBe('ASSIGNED');
      expect(lead.version).toBe(version);
    });
  });
});
