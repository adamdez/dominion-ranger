/**
 * Charter v2.3 — Invariant 7: Compliance Gating (Litigator Path)
 *
 * Existing test (workflow-concurrency.test.ts) covers DNC blocking.
 * This test covers the litigator path, which was previously untested.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  promotedLeads,
  leadInstances,
} from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { runComplianceGating } from '../../src/modules/workflow/service.js';
import * as complianceService from '../../src/modules/compliance/service.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Litigator Compliance Gating', () => {
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
    await db.execute(sql`DELETE FROM users`);
    await db.execute(sql`DELETE FROM properties`);
  });

  async function createAssignedLead(apn: string, ownerName: string) {
    const propertyId = generateId();
    await db.insert(properties).values({
      dominionLeadId: propertyId,
      propertyId: generateId(),
      apn,
      county: 'TestCounty',
      state: 'AZ',
      phone: '555-TEST',
      ownerName,
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

  it('litigator-flagged lead is transitioned to DEAD, not DIAL_READY', async () => {
    const litSpy = vi.spyOn(complianceService, 'checkLitigator').mockResolvedValue({
      ownerName: 'Known Litigator LLC',
      isLitigator: true,
      checkedAt: new Date(),
      source: 'test_mock',
    });

    try {
      const leadInstanceId = await createAssignedLead('LIT-001', 'Known Litigator LLC');
      const result = await runComplianceGating(leadInstanceId);

      expect(result.status).toBe('DEAD');
      expect(result.complianceCleared).toBe(false);
      expect(result.litigantCheckedAt).not.toBeNull();
    } finally {
      litSpy.mockRestore();
    }
  });

  it('both DNC + litigator flagged — lead is DEAD', async () => {
    const dncSpy = vi.spyOn(complianceService, 'checkDnc').mockResolvedValue({
      phone: '555-BOTH',
      isOnDnc: true,
      checkedAt: new Date(),
      source: 'test_mock',
    });
    const litSpy = vi.spyOn(complianceService, 'checkLitigator').mockResolvedValue({
      ownerName: 'Double Flag LLC',
      isLitigator: true,
      checkedAt: new Date(),
      source: 'test_mock',
    });

    try {
      const leadInstanceId = await createAssignedLead('BOTH-001', 'Double Flag LLC');
      const result = await runComplianceGating(leadInstanceId);

      expect(result.status).toBe('DEAD');
      expect(result.complianceCleared).toBe(false);
    } finally {
      dncSpy.mockRestore();
      litSpy.mockRestore();
    }
  });

  it('clean lead passes both checks and reaches DIAL_READY', async () => {
    const leadInstanceId = await createAssignedLead('CLEAN-002', 'Clean Owner');
    const result = await runComplianceGating(leadInstanceId);

    expect(result.status).toBe('DIAL_READY');
    expect(result.complianceCleared).toBe(true);
    expect(result.dncCheckedAt).not.toBeNull();
    expect(result.litigantCheckedAt).not.toBeNull();
  });

  it('compliance timestamps are always populated', async () => {
    const leadInstanceId = await createAssignedLead('TS-001', 'Timestamp Test');
    const result = await runComplianceGating(leadInstanceId);

    expect(result.dncCheckedAt).toBeInstanceOf(Date);
    expect(result.litigantCheckedAt).toBeInstanceOf(Date);
  });
});
