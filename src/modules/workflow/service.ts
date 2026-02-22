import { eq, and, sql, ne } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { leadInstances, properties } from '../../db/schema/index.js';
import type { LeadInstance } from '../../db/schema/index.js';
import { generateId } from '../../lib/index.js';
import { checkDnc, checkLitigator, logAudit } from '../compliance/service.js';
import { domainEvents } from '../../events/bus.js';
import { logger } from '../../config/logger.js';

// ─── State Machine ─────────────────────────────────

type LeadStatus = LeadInstance['status'];

const VALID_TRANSITIONS: Record<string, LeadStatus[]> = {
  PROMOTED:            ['ASSIGNED', 'DEAD'],
  ASSIGNED:            ['COMPLIANCE_PENDING', 'DEAD'],
  COMPLIANCE_PENDING:  ['DIAL_READY', 'DEAD'],
  DIAL_READY:          ['DIALING', 'DEAD'],
  DIALING:             ['CONTACTED', 'DIAL_READY', 'DEAD'],
  CONTACTED:           ['OFFER_SENT', 'DEAD'],
  OFFER_SENT:          ['CONTRACTED', 'DEAD'],
  CONTRACTED:          ['CLOSED', 'DEAD'],
  CLOSED:              [],
  DEAD:                [],
};

const TERMINAL_STATUSES: LeadStatus[] = ['CLOSED', 'DEAD'];

function isValidTransition(from: LeadStatus, to: LeadStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Core Operations ───────────────────────────────

/**
 * Create a lead instance from a promotion.
 * Charter: One active lead_instance per property.
 */
export async function createLeadInstance(input: {
  dominionLeadId: string;
  promotionId: string;
}): Promise<LeadInstance> {
  const activeInstances = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leadInstances)
    .where(
      and(
        eq(leadInstances.dominionLeadId, input.dominionLeadId),
        ne(leadInstances.status, 'CLOSED'),
        ne(leadInstances.status, 'DEAD'),
      ),
    );

  if (activeInstances[0].count > 0) {
    throw new Error(`Active lead instance already exists for property ${input.dominionLeadId}`);
  }

  const leadInstanceId = generateId();
  const [instance] = await db
    .insert(leadInstances)
    .values({
      leadInstanceId,
      dominionLeadId: input.dominionLeadId,
      promotionId: input.promotionId,
      status: 'PROMOTED',
      version: 1,
    })
    .returning();

  await logAudit({
    dominionLeadId: input.dominionLeadId,
    actionType: 'workflow.lead_instance_created',
    metadata: { leadInstanceId, promotionId: input.promotionId },
  });

  logger.info({ leadInstanceId, dominionLeadId: input.dominionLeadId }, 'Lead instance created');
  return instance;
}

/**
 * Claim/assign a lead to a user.
 * Uses optimistic locking: only succeeds if version matches.
 * Charter: Two users cannot double-claim.
 */
export async function claimLead(input: {
  leadInstanceId: string;
  userId: string;
  expectedVersion: number;
}): Promise<LeadInstance> {
  const result = await db
    .update(leadInstances)
    .set({
      assignedTo: input.userId,
      status: 'ASSIGNED',
      version: sql`${leadInstances.version} + 1`,
      claimedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(leadInstances.leadInstanceId, input.leadInstanceId),
        eq(leadInstances.version, input.expectedVersion),
        eq(leadInstances.status, 'PROMOTED'),
      ),
    )
    .returning();

  if (result.length === 0) {
    throw new Error(
      `Claim failed for lead ${input.leadInstanceId}. ` +
      'Either the version changed (concurrent modification) or the lead is not in PROMOTED status.',
    );
  }

  const instance = result[0];

  await logAudit({
    dominionLeadId: instance.dominionLeadId,
    userId: input.userId,
    actionType: 'workflow.lead_claimed',
    metadata: { leadInstanceId: input.leadInstanceId, version: instance.version },
  });

  logger.info({ leadInstanceId: input.leadInstanceId, userId: input.userId }, 'Lead claimed');
  return instance;
}

/**
 * Run compliance checks (DNC + litigant) on a lead.
 * Charter: Compliance gating before dial eligibility.
 */
export async function runComplianceGating(leadInstanceId: string): Promise<LeadInstance> {
  const [instance] = await db
    .select()
    .from(leadInstances)
    .where(eq(leadInstances.leadInstanceId, leadInstanceId));

  if (!instance) throw new Error(`Lead instance not found: ${leadInstanceId}`);

  if (!isValidTransition(instance.status, 'COMPLIANCE_PENDING')) {
    throw new Error(`Cannot run compliance from status ${instance.status}`);
  }

  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.dominionLeadId, instance.dominionLeadId));

  const dncResult = property?.phone
    ? await checkDnc(property.phone, instance.dominionLeadId)
    : { isOnDnc: false, checkedAt: new Date() };

  const litigatorResult = property?.ownerName
    ? await checkLitigator(property.ownerName, instance.dominionLeadId)
    : { isLitigator: false, checkedAt: new Date() };

  const complianceCleared = !dncResult.isOnDnc && !litigatorResult.isLitigator;
  const nextStatus: LeadStatus = complianceCleared ? 'DIAL_READY' : 'DEAD';

  const [updated] = await db
    .update(leadInstances)
    .set({
      status: nextStatus,
      complianceCleared,
      dncCheckedAt: dncResult.checkedAt,
      litigantCheckedAt: litigatorResult.checkedAt,
      version: sql`${leadInstances.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(leadInstances.leadInstanceId, leadInstanceId),
        eq(leadInstances.version, instance.version),
      ),
    )
    .returning();

  if (!updated) throw new Error(`Concurrent modification on lead ${leadInstanceId}`);

  if (!complianceCleared) {
    const reason = dncResult.isOnDnc ? 'DNC' : 'LITIGATOR';
    logger.warn({ leadInstanceId, reason }, 'Lead blocked by compliance');
    await logAudit({
      dominionLeadId: instance.dominionLeadId,
      actionType: 'workflow.compliance_blocked',
      metadata: { leadInstanceId, reason, dncResult, litigatorResult },
    });
  }

  return updated;
}

/**
 * Transition a lead to a new status.
 * Validates the state machine and uses optimistic locking.
 */
export async function transitionLead(input: {
  leadInstanceId: string;
  toStatus: LeadStatus;
  expectedVersion: number;
  userId?: string;
  notes?: string;
}): Promise<LeadInstance> {
  const [current] = await db
    .select()
    .from(leadInstances)
    .where(eq(leadInstances.leadInstanceId, input.leadInstanceId));

  if (!current) throw new Error(`Lead instance not found: ${input.leadInstanceId}`);

  if (!isValidTransition(current.status, input.toStatus)) {
    throw new Error(
      `Invalid transition: ${current.status} -> ${input.toStatus}. ` +
      `Valid targets: ${VALID_TRANSITIONS[current.status]?.join(', ') || 'none'}`,
    );
  }

  if (input.toStatus === 'DIALING' && !current.complianceCleared) {
    throw new Error('Cannot dial: compliance not cleared. Run compliance gating first.');
  }

  const timestampField = STATUS_TIMESTAMP_MAP[input.toStatus];
  const updates: Record<string, unknown> = {
    status: input.toStatus,
    version: sql`${leadInstances.version} + 1`,
    updatedAt: new Date(),
  };

  if (timestampField) updates[timestampField] = new Date();
  if (input.notes) updates.notes = input.notes;

  const result = await db
    .update(leadInstances)
    .set(updates)
    .where(
      and(
        eq(leadInstances.leadInstanceId, input.leadInstanceId),
        eq(leadInstances.version, input.expectedVersion),
      ),
    )
    .returning();

  if (result.length === 0) {
    throw new Error(
      `Transition failed for lead ${input.leadInstanceId}. ` +
      `Expected version ${input.expectedVersion} but it has changed (concurrent modification).`,
    );
  }

  const updated = result[0];

  await logAudit({
    dominionLeadId: updated.dominionLeadId,
    userId: input.userId,
    actionType: `workflow.transition.${input.toStatus.toLowerCase()}`,
    metadata: {
      leadInstanceId: input.leadInstanceId,
      from: current.status,
      to: input.toStatus,
      version: updated.version,
    },
  });

  logger.info(
    { leadInstanceId: input.leadInstanceId, from: current.status, to: input.toStatus },
    'Lead transitioned',
  );

  return updated;
}

const STATUS_TIMESTAMP_MAP: Partial<Record<LeadStatus, string>> = {
  DIALING: 'dialedAt',
  CONTACTED: 'contactedAt',
  OFFER_SENT: 'offerSentAt',
  CONTRACTED: 'contractedAt',
  CLOSED: 'closedAt',
};

// ─── Query Helpers ─────────────────────────────────

export async function getLeadInstance(leadInstanceId: string): Promise<LeadInstance | null> {
  const [instance] = await db
    .select()
    .from(leadInstances)
    .where(eq(leadInstances.leadInstanceId, leadInstanceId));
  return instance ?? null;
}

export async function getActiveLeadInstance(dominionLeadId: string): Promise<LeadInstance | null> {
  const [instance] = await db
    .select()
    .from(leadInstances)
    .where(
      and(
        eq(leadInstances.dominionLeadId, dominionLeadId),
        ne(leadInstances.status, 'CLOSED'),
        ne(leadInstances.status, 'DEAD'),
      ),
    );
  return instance ?? null;
}

export async function getLeadsByStatus(status: LeadStatus): Promise<LeadInstance[]> {
  return db
    .select()
    .from(leadInstances)
    .where(eq(leadInstances.status, status))
    .orderBy(leadInstances.createdAt);
}

export async function getDialQueue(userId?: string): Promise<LeadInstance[]> {
  const conditions = [eq(leadInstances.status, 'DIAL_READY')];
  if (userId) conditions.push(eq(leadInstances.assignedTo, userId));

  return db
    .select()
    .from(leadInstances)
    .where(and(...conditions))
    .orderBy(leadInstances.createdAt);
}
