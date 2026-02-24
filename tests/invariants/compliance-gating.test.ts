/**
 * Charter v2.3 Audit — Invariant 7: Compliance gating before dial eligibility
 *
 * Validates:
 *   - DNC-flagged leads are blocked from DIAL_READY status
 *   - Litigator-flagged leads are blocked from DIAL_READY status
 *   - Clean leads pass compliance and reach DIAL_READY
 *   - Compliance fields are populated after gating
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
import { runComplianceGating } from '../../src/modules/workflow/service.js';
import * as complianceService from '../../src/modules/compliance/service.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Invariant 7: Compliance gating before dial eligibility', () => {
  const db = canRun ? getTestDb() : (null as any);

  async function createTestLeadInstance(apn: string, phone: string): Promise<string> {
    const propertyId = generateId();
    await db.insert(properties).values({
      dominionLeadId: propertyId,
      propertyId: generateId(),
      apn,
      county: 'AuditCounty',
      state: 'WA',
      phone,
      ownerName: `Owner of ${apn}`,
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

    return leadInstanceId;
  }

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
    await db.execute(sql`DELETE FROM properties`);
  });

  it('should block DNC-flagged leads from dial eligibility', async () => {
    const dncSpy = vi.spyOn(complianceService, 'checkDnc').mockResolvedValue({
      phone: '555-DNC-TEST',
      isOnDnc: true,
      checkedAt: new Date(),
      source: 'test_mock',
    });

    try {
      const leadInstanceId = await createTestLeadInstance('DNC-AUDIT-001', '555-DNC-TEST');
      const result = await runComplianceGating(leadInstanceId);

      expect(result.status).toBe('DEAD');
      expect(result.complianceCleared).toBe(false);
      expect(result.dncCheckedAt).not.toBeNull();
    } finally {
      dncSpy.mockRestore();
    }
  });

  it('should block litigator-flagged leads from dial eligibility', async () => {
    const litSpy = vi.spyOn(complianceService, 'checkLitigator').mockResolvedValue({
      ownerName: 'Sue H. Appylawyer',
      isLitigator: true,
      checkedAt: new Date(),
      source: 'test_mock',
    });

    try {
      const leadInstanceId = await createTestLeadInstance('LIT-AUDIT-001', '555-LIT-TEST');
      const result = await runComplianceGating(leadInstanceId);

      expect(result.status).toBe('DEAD');
      expect(result.complianceCleared).toBe(false);
      expect(result.litigantCheckedAt).not.toBeNull();
    } finally {
      litSpy.mockRestore();
    }
  });

  it('should allow clean leads to reach DIAL_READY', async () => {
    const leadInstanceId = await createTestLeadInstance('CLEAN-AUDIT-001', '555-CLEAN');
    const result = await runComplianceGating(leadInstanceId);

    expect(result.status).toBe('DIAL_READY');
    expect(result.complianceCleared).toBe(true);
    expect(result.dncCheckedAt).not.toBeNull();
    expect(result.litigantCheckedAt).not.toBeNull();
  });

  it('should populate compliance timestamp fields', async () => {
    const leadInstanceId = await createTestLeadInstance('TIMESTAMP-AUDIT-001', '555-TS-TEST');
    await runComplianceGating(leadInstanceId);

    const [lead] = await db
      .select()
      .from(leadInstances)
      .where(eq(leadInstances.leadInstanceId, leadInstanceId));

    expect(lead.dncCheckedAt).toBeInstanceOf(Date);
    expect(lead.litigantCheckedAt).toBeInstanceOf(Date);
  });
});
