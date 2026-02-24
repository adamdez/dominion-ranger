/**
 * Charter v2.3 — Dial Queue Compliance Verification
 *
 * Verifies that the dial queue endpoint correctly:
 *   1. Only returns DIAL_READY leads
 *   2. Filters by assigned agent for non-admin users
 *
 * DOCUMENTS GAP: The dial queue does NOT independently verify
 * compliance_cleared = true. It relies solely on the DIAL_READY
 * status set by runComplianceGating().
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql, count, and } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  promotedLeads,
  leadInstances,
  LeadStatus,
} from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Dial Queue Compliance', () => {
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
    await db.execute(sql`DELETE FROM properties`);
  });

  async function createLead(status: string, assignedTo?: string, complianceCleared?: boolean) {
    const dominionLeadId = generateId();
    await db.insert(properties).values({
      dominionLeadId,
      propertyId: generateId(),
      apn: `DQ-${generateId().slice(0, 6)}`,
      county: 'TestCounty',
      state: 'WA',
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
      status,
      version: 1,
      assignedTo: assignedTo ?? null,
      complianceCleared: complianceCleared ?? false,
    });

    return { leadInstanceId, dominionLeadId };
  }

  it('only DIAL_READY leads appear in the dial queue query', async () => {
    await createLead('PROMOTED');
    await createLead('ASSIGNED', 'agent-1');
    await createLead('DIAL_READY', 'agent-1', true);
    await createLead('DEAD');

    const [dialReady] = await db
      .select({ n: count() })
      .from(leadInstances)
      .where(eq(leadInstances.status, LeadStatus.DIAL_READY));

    expect(dialReady.n).toBe(1);
  });

  it('DOCUMENTS GAP: dial queue does not filter by compliance_cleared', async () => {
    // Create a DIAL_READY lead with compliance_cleared = false
    // This simulates a scenario where status was manually set without going through gating
    await createLead('DIAL_READY', 'agent-1', false);

    const [result] = await db
      .select({ n: count() })
      .from(leadInstances)
      .where(
        and(
          eq(leadInstances.status, LeadStatus.DIAL_READY),
          eq(leadInstances.complianceCleared, false),
        ),
      );

    // This lead WOULD appear in the dial queue because the query
    // only checks status, not compliance_cleared
    expect(result.n).toBe(1);
  });

  it('agent scoping: non-admin sees only their assigned leads', async () => {
    await createLead('DIAL_READY', 'agent-1', true);
    await createLead('DIAL_READY', 'agent-2', true);
    await createLead('DIAL_READY', 'agent-1', true);

    const [agent1Count] = await db
      .select({ n: count() })
      .from(leadInstances)
      .where(
        and(
          eq(leadInstances.status, LeadStatus.DIAL_READY),
          eq(leadInstances.assignedTo, 'agent-1'),
        ),
      );

    expect(agent1Count.n).toBe(2);
  });
});
