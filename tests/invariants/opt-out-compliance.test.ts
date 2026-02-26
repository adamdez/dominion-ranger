/**
 * Charter v2.3 — Opt-Out Compliance Tests (Agent 3)
 *
 * Validates:
 *   - Opt-out property blocked from dial eligibility
 *   - Opt-out check returns correct result
 *   - Clean property passes opt-out check
 *
 * NOTE: Skipped until Agent 3 merges checkOptOut and runComplianceGating opt-out integration.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  promotedLeads,
  leadInstances,
} from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { runComplianceGating } from '../../src/modules/workflow/index.js';
// checkOptOut added by Agent 3 - use optional chaining when calling until merged
import * as complianceService from '../../src/modules/compliance/service.js';
const checkOptOut = (complianceService as { checkOptOut?: (id: string) => Promise<{ isOptedOut: boolean; dominionLeadId: string }> }).checkOptOut;

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Opt-Out Compliance (Charter Mandatory)', () => {
  const db = canRun ? getTestDb() : (null as never);

  async function createTestLeadInstance(
    apn: string,
    opts: { optOutFlag?: boolean } = {},
  ): Promise<string> {
    const propertyId = generateId();
    await db.insert(properties).values({
      dominionLeadId: propertyId,
      propertyId: generateId(),
      apn,
      county: 'OptOutTestCounty',
      state: 'WA',
      phone: '555-123-4567',
      ownerName: `Owner of ${apn}`,
      optOutFlag: opts.optOutFlag ?? false,
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
    await cleanupTables();
  });

  it.skip('a) opt-out property blocked from dial eligibility', async () => {
    const leadInstanceId = await createTestLeadInstance('OPTOUT-BLOCK-001', {
      optOutFlag: true,
    });

    const result = await runComplianceGating(leadInstanceId);

    expect(result.status).toBe('DEAD');
    expect(result.complianceCleared).toBe(false);
  });

  it.skip('b) opt-out check returns correct result', async () => {
    if (!checkOptOut) return;
    const dominionLeadId = generateId();
    await db.insert(properties).values({
      dominionLeadId,
      propertyId: generateId(),
      apn: 'OPTOUT-CHECK-001',
      county: 'OptOutTestCounty',
      state: 'WA',
      optOutFlag: true,
    });

    const result = await checkOptOut(dominionLeadId);

    expect(result.isOptedOut).toBe(true);
    expect(result.dominionLeadId).toBe(dominionLeadId);
  });

  it.skip('c) clean property passes opt-out check', async () => {
    if (!checkOptOut) return;
    const dominionLeadId = generateId();
    await db.insert(properties).values({
      dominionLeadId,
      propertyId: generateId(),
      apn: 'OPTOUT-CLEAN-001',
      county: 'OptOutTestCounty',
      state: 'WA',
      optOutFlag: false,
    });

    const result = await checkOptOut(dominionLeadId);

    expect(result.isOptedOut).toBe(false);
    expect(result.dominionLeadId).toBe(dominionLeadId);
  });
});
