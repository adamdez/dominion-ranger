import { eq, and, sql, ne, isNull } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { leadInstances, properties, LeadStatus } from '../../db/schema/index.js';
import type { LeadInstance } from '../../db/schema/index.js';
import { generateId } from '../../lib/index.js';
import { checkDnc, checkLitigator, logAudit } from '../compliance/index.js';
import { logActivity } from '../analytics/activity-logger.js';
import { logger } from '../../config/logger.js';
import { NotFoundError, ValidationError, ConcurrencyError, ComplianceError } from '../../lib/errors.js';

// ─── State Machine ─────────────────────────────────

type LeadStatusType = LeadInstance['status'];

const VALID_TRANSITIONS: Record<string, LeadStatusType[]> = {
  [LeadStatus.PROMOTED]:            [LeadStatus.ASSIGNED, LeadStatus.COMPLIANCE_PENDING, LeadStatus.DEAD],
  [LeadStatus.ASSIGNED]:            [LeadStatus.COMPLIANCE_PENDING, LeadStatus.DEAD],
  [LeadStatus.COMPLIANCE_PENDING]:  [LeadStatus.DIAL_READY, LeadStatus.DEAD],
  [LeadStatus.DIAL_READY]:          [LeadStatus.DIALING, LeadStatus.DEAD],
  [LeadStatus.DIALING]:             [LeadStatus.CONTACTED, LeadStatus.DIAL_READY, LeadStatus.DEAD],
  [LeadStatus.CONTACTED]:           [LeadStatus.OFFER_SENT, LeadStatus.DEAD],
  [LeadStatus.OFFER_SENT]:          [LeadStatus.CONTRACTED, LeadStatus.DEAD],
  [LeadStatus.CONTRACTED]:          [LeadStatus.CLOSED, LeadStatus.DEAD],
  [LeadStatus.CLOSED]:              [],
  [LeadStatus.DEAD]:                [],
};

const _TERMINAL_STATUSES: LeadStatusType[] = [LeadStatus.CLOSED, LeadStatus.DEAD];

function isValidTransition(from: LeadStatusType, to: LeadStatusType): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Core Operations ───────────────────────────────

/**
 * Create a lead instance (from promotion or manual add to funnel).
 * Charter: One active lead_instance per property.
 *
 * Uses atomic INSERT ... SELECT ... WHERE NOT EXISTS to prevent race conditions.
 * Two concurrent promotions for the same property will only create one instance.
 *
 * promotionId is optional — null for manual funnel adds (no promoted_leads record).
 */
export async function createLeadInstance(input: {
  dominionLeadId: string;
  promotionId?: string | null;
}): Promise<LeadInstance> {
  const leadInstanceId = generateId();
  const promotionId = input.promotionId ?? null;

  const result = await db.execute<LeadInstance>(sql`
    INSERT INTO lead_instances (lead_instance_id, dominion_lead_id, promotion_id, status, version)
    SELECT ${leadInstanceId}, ${input.dominionLeadId}, ${promotionId}, ${LeadStatus.PROMOTED}, 1
    WHERE NOT EXISTS (
      SELECT 1 FROM lead_instances
      WHERE dominion_lead_id = ${input.dominionLeadId}
        AND status NOT IN (${LeadStatus.CLOSED}, ${LeadStatus.DEAD})
    )
    RETURNING *
  `);

  if (result.rows.length === 0) {
    throw new ValidationError(`Active lead instance already exists for property ${input.dominionLeadId}`);
  }

  const raw = result.rows[0] as Record<string, unknown>;
  const instance = { ...raw, leadInstanceId: raw.lead_instance_id ?? raw.leadInstanceId } as LeadInstance;

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
      status: LeadStatus.ASSIGNED,
      funnelStage: 'lead',
      version: sql`${leadInstances.version} + 1`,
      claimedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(leadInstances.leadInstanceId, input.leadInstanceId),
        eq(leadInstances.version, input.expectedVersion),
        isNull(leadInstances.assignedTo),
      ),
    )
    .returning();

  if (result.length === 0) {
    const [existing] = await db
      .select({ assignedTo: leadInstances.assignedTo })
      .from(leadInstances)
      .where(eq(leadInstances.leadInstanceId, input.leadInstanceId));

    if (existing?.assignedTo) {
      throw new ValidationError('Lead already claimed by another user');
    }
    throw new ConcurrencyError('lead_instance', input.leadInstanceId);
  }

  const instance = result[0];

  await logAudit({
    dominionLeadId: instance.dominionLeadId,
    userId: input.userId,
    actionType: 'workflow.lead_claimed',
    metadata: { leadInstanceId: input.leadInstanceId, version: instance.version },
  });

  await logActivity({
    dominionLeadId: instance.dominionLeadId,
    leadInstanceId: input.leadInstanceId,
    userId: input.userId,
    activityType: 'LEAD_ASSIGNED',
    channel: 'OUTBOUND_COLD',
  });

  logger.info({ leadInstanceId: input.leadInstanceId, userId: input.userId }, 'Lead claimed');

  try {
    await logActivity({
      dominionLeadId: instance.dominionLeadId,
      leadInstanceId: input.leadInstanceId,
      userId: input.userId,
      activityType: 'LEAD_ASSIGNED',
      channel: 'OUTBOUND_COLD',
      meta: { version: instance.version },
    });
  } catch (err: unknown) {
    logger.error({ err, leadInstanceId: input.leadInstanceId }, 'Failed to log claim activity');
  }

  return instance;
}

/**
 * Run compliance checks (DNC + litigant) on a lead.
 * Charter: Compliance gating before dial eligibility.
 *
 * Two-phase transition:
 *   ASSIGNED → COMPLIANCE_PENDING  (phase 1: begin checks)
 *   COMPLIANCE_PENDING → DIAL_READY | DEAD  (phase 2: apply result)
 */
export async function runComplianceGating(leadInstanceId: string): Promise<LeadInstance> {
  const [instance] = await db
    .select()
    .from(leadInstances)
    .where(eq(leadInstances.leadInstanceId, leadInstanceId));

  if (!instance) throw new NotFoundError('LeadInstance', leadInstanceId);

  // Phase 1: transition to COMPLIANCE_PENDING (from ASSIGNED or PROMOTED for auto-queue)
  let current = instance;
  if (current.status === LeadStatus.ASSIGNED || current.status === LeadStatus.PROMOTED) {
    if (!isValidTransition(current.status, LeadStatus.COMPLIANCE_PENDING)) {
      throw new ValidationError(`Cannot run compliance from status ${current.status}`);
    }

    const [pending] = await db
      .update(leadInstances)
      .set({
        status: LeadStatus.COMPLIANCE_PENDING,
        version: sql`${leadInstances.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(leadInstances.leadInstanceId, leadInstanceId),
          eq(leadInstances.version, current.version),
        ),
      )
      .returning();

    if (!pending) throw new ConcurrencyError('lead_instance', leadInstanceId);
    current = pending;

    await logAudit({
      dominionLeadId: current.dominionLeadId,
      actionType: 'workflow.compliance_started',
      metadata: { leadInstanceId },
    });
  } else if (current.status !== LeadStatus.COMPLIANCE_PENDING) {
    throw new ValidationError(`Cannot run compliance from status ${current.status}`);
  }

  // Phase 2: run checks and resolve
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.dominionLeadId, current.dominionLeadId));

  const dncResult = await checkDnc(property?.phone ?? '', current.dominionLeadId);

  const litigatorResult = await checkLitigator(property?.ownerName ?? '', current.dominionLeadId);

  const complianceCleared = !dncResult.isOnDnc && !litigatorResult.isLitigator;
  const nextStatus: LeadStatusType = complianceCleared ? LeadStatus.DIAL_READY : LeadStatus.DEAD;

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
        eq(leadInstances.version, current.version),
      ),
    )
    .returning();

  if (!updated) throw new ConcurrencyError('lead_instance', leadInstanceId);

  if (!complianceCleared) {
    const reason = dncResult.isOnDnc ? 'DNC' : 'LITIGATOR';
    logger.warn({ leadInstanceId, reason }, 'Lead blocked by compliance');
    await logAudit({
      dominionLeadId: current.dominionLeadId,
      actionType: 'workflow.compliance_blocked',
      metadata: { leadInstanceId, reason, dncResult, litigatorResult },
    });
  }

  try {
    await logActivity({
      dominionLeadId: updated.dominionLeadId,
      leadInstanceId,
      activityType: 'COMPLIANCE_CHECKED',
      channel: 'OUTBOUND_COLD',
      outcome: complianceCleared ? undefined : 'DO_NOT_CALL',
      meta: { complianceCleared, dnc: dncResult.isOnDnc, litigator: litigatorResult.isLitigator },
    });
  } catch (err: unknown) {
    logger.error({ err, leadInstanceId }, 'Failed to log compliance activity');
  }

  return updated;
}

/**
 * Transition a lead to a new status.
 * Validates the state machine and uses optimistic locking.
 */
export async function transitionLead(input: {
  leadInstanceId: string;
  toStatus: LeadStatusType;
  expectedVersion: number;
  userId?: string;
  notes?: string;
}): Promise<LeadInstance> {
  const [current] = await db
    .select()
    .from(leadInstances)
    .where(eq(leadInstances.leadInstanceId, input.leadInstanceId));

  if (!current) throw new NotFoundError('LeadInstance', input.leadInstanceId);

  if (!isValidTransition(current.status, input.toStatus)) {
    throw new ValidationError(
      `Invalid transition: ${current.status} -> ${input.toStatus}. ` +
      `Valid targets: ${VALID_TRANSITIONS[current.status]?.join(', ') || 'none'}`,
    );
  }

  if (input.toStatus === LeadStatus.DIALING && !current.complianceCleared) {
    throw new ComplianceError('Compliance not cleared', current.dominionLeadId);
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
    throw new ConcurrencyError('lead_instance', input.leadInstanceId);
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

  try {
    await logActivity({
      dominionLeadId: updated.dominionLeadId,
      leadInstanceId: input.leadInstanceId,
      userId: input.userId,
      activityType: 'STATUS_CHANGED',
      channel: 'OUTBOUND_COLD',
      meta: { from: current.status, to: input.toStatus, version: updated.version },
    });
  } catch (err: unknown) {
    logger.error({ err, leadInstanceId: input.leadInstanceId }, 'Failed to log transition activity');
  }

  return updated;
}

const STATUS_TIMESTAMP_MAP: Partial<Record<LeadStatusType, string>> = {
  [LeadStatus.DIALING]: 'dialedAt',
  [LeadStatus.CONTACTED]: 'contactedAt',
  [LeadStatus.OFFER_SENT]: 'offerSentAt',
  [LeadStatus.CONTRACTED]: 'contractedAt',
  [LeadStatus.CLOSED]: 'closedAt',
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
        ne(leadInstances.status, LeadStatus.CLOSED),
        ne(leadInstances.status, LeadStatus.DEAD),
      ),
    );
  return instance ?? null;
}

export async function getLeadsByStatus(status: LeadStatusType): Promise<LeadInstance[]> {
  return db
    .select()
    .from(leadInstances)
    .where(eq(leadInstances.status, status))
    .orderBy(leadInstances.createdAt);
}

export async function getDialQueue(userId?: string): Promise<LeadInstance[]> {
  const conditions = [eq(leadInstances.status, LeadStatus.DIAL_READY)];
  if (userId) conditions.push(eq(leadInstances.assignedTo, userId));

  return db
    .select()
    .from(leadInstances)
    .where(and(...conditions))
    .orderBy(leadInstances.createdAt);
}
