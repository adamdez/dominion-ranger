/**
 * Charter Section VIII: Compliance (SACRED)
 *
 * Tests the REAL compliance implementation — no mocks.
 * Verifies: property.dnc_flag, property.litigant_flag, property_contacts.dnd_calls
 * are correctly read and block dial eligibility.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  propertyContacts,
  promotedLeads,
  leadInstances,
} from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { checkDnc, checkLitigator } from '../../src/modules/compliance/service.js';
import { runComplianceGating } from '../../src/modules/workflow/service.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Charter Section VIII: Compliance (SACRED)', () => {
  const db = canRun ? getTestDb() : (null as unknown as ReturnType<typeof getTestDb>);

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
    await db.execute(sql`DELETE FROM property_contacts`);
    await db.execute(sql`DELETE FROM signal_accumulation`);
    await db.execute(sql`DELETE FROM users`);
    await db.execute(sql`DELETE FROM properties`);
  });

  describe('DNC enforcement', () => {
    it('should return isOnDnc=true when property.dnc_flag is true', async () => {
      const dominionLeadId = generateId();
      await db.insert(properties).values({
        dominionLeadId,
        propertyId: generateId(),
        apn: 'DNC-PROP-001',
        county: 'TestCounty',
        state: 'WA',
        phone: '555-DNC-TEST',
        dncFlag: true,
      });

      const result = await checkDnc('555-DNC-TEST', dominionLeadId);
      expect(result.isOnDnc).toBe(true);
      expect(result.source).toBe('property_flag');
    });

    it('should return isOnDnc=true when any property_contact has dnd_calls=true', async () => {
      const dominionLeadId = generateId();
      await db.insert(properties).values({
        dominionLeadId,
        propertyId: generateId(),
        apn: 'DND-CONTACT-001',
        county: 'TestCounty',
        state: 'WA',
      });
      await db.insert(propertyContacts).values({
        dominionLeadId,
        contactType: 'OWNER',
        phone: '555-DND-CONTACT',
        dndCalls: true,
      });

      const result = await checkDnc('555-OTHER', dominionLeadId);
      expect(result.isOnDnc).toBe(true);
      expect(result.source).toContain('contact_dnd');
    });

    it('should return isOnDnc=false when no DNC indicators exist', async () => {
      const dominionLeadId = generateId();
      await db.insert(properties).values({
        dominionLeadId,
        propertyId: generateId(),
        apn: 'CLEAN-001',
        county: 'TestCounty',
        state: 'WA',
        phone: '555-CLEAN',
        dncFlag: false,
      });

      const result = await checkDnc('555-CLEAN', dominionLeadId);
      expect(result.isOnDnc).toBe(false);
      expect(result.source).toBe('db_check');
    });
  });

  describe('Litigant enforcement', () => {
    it('should return isLitigator=true when property.litigant_flag is true', async () => {
      const dominionLeadId = generateId();
      await db.insert(properties).values({
        dominionLeadId,
        propertyId: generateId(),
        apn: 'LIT-001',
        county: 'TestCounty',
        state: 'WA',
        ownerName: 'Known Litigator LLC',
        litigantFlag: true,
      });

      const result = await checkLitigator('Known Litigator LLC', dominionLeadId);
      expect(result.isLitigator).toBe(true);
      expect(result.source).toBe('property_flag');
    });

    it('should return isLitigator=false when litigant_flag is false', async () => {
      const dominionLeadId = generateId();
      await db.insert(properties).values({
        dominionLeadId,
        propertyId: generateId(),
        apn: 'CLEAN-002',
        county: 'TestCounty',
        state: 'WA',
        ownerName: 'Clean Owner',
        litigantFlag: false,
      });

      const result = await checkLitigator('Clean Owner', dominionLeadId);
      expect(result.isLitigator).toBe(false);
    });
  });

  describe('Compliance gating integration', () => {
    it('DNC-flagged property blocks lead from reaching DIAL_READY', async () => {
      const dominionLeadId = generateId();
      await db.insert(properties).values({
        dominionLeadId,
        propertyId: generateId(),
        apn: 'GATE-DNC-001',
        county: 'TestCounty',
        state: 'WA',
        phone: '555-GATE',
        dncFlag: true,
      });

      const promotionId = generateId();
      await db.insert(promotedLeads).values({
        promotionId,
        dominionLeadId,
        compositeScore: '75.0000',
        confidenceScore: '0.8500',
        scoreModelVersion: 'v1.0',
        marketingTier: 'B',
        urgencyLevel: 'MEDIUM',
      });

      const leadInstanceId = generateId();
      await db.insert(leadInstances).values({
        leadInstanceId,
        dominionLeadId,
        promotionId,
        status: 'ASSIGNED',
        version: 1,
      });

      const result = await runComplianceGating(leadInstanceId);
      expect(result.status).toBe('DEAD');
      expect(result.complianceCleared).toBe(false);
    });

    it('litigant-flagged property blocks lead from reaching DIAL_READY', async () => {
      const dominionLeadId = generateId();
      await db.insert(properties).values({
        dominionLeadId,
        propertyId: generateId(),
        apn: 'GATE-LIT-001',
        county: 'TestCounty',
        state: 'WA',
        phone: '555-GATE',
        ownerName: 'Litigator LLC',
        litigantFlag: true,
      });

      const promotionId = generateId();
      await db.insert(promotedLeads).values({
        promotionId,
        dominionLeadId,
        compositeScore: '75.0000',
        confidenceScore: '0.8500',
        scoreModelVersion: 'v1.0',
        marketingTier: 'B',
        urgencyLevel: 'MEDIUM',
      });

      const leadInstanceId = generateId();
      await db.insert(leadInstances).values({
        leadInstanceId,
        dominionLeadId,
        promotionId,
        status: 'ASSIGNED',
        version: 1,
      });

      const result = await runComplianceGating(leadInstanceId);
      expect(result.status).toBe('DEAD');
      expect(result.complianceCleared).toBe(false);
    });
  });
});
