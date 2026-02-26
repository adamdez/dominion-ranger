import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  auditLog,
  properties,
  propertyContacts,
} from '../../db/schema/index.js';
import type { AuditLogEntry } from '../../db/schema/index.js';
import { generateId } from '../../lib/index.js';
import { domainEvents } from '../../events/bus.js';

// ─── Audit Logging ─────────────────────────────────

interface AuditInput {
  dominionLeadId?: string;
  userId?: string;
  actionType: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an immutable audit entry.
 * Charter: All audit logs must include dominion_lead_id, user_id, action_type, timestamp, metadata JSON.
 */
export async function logAudit(input: AuditInput): Promise<AuditLogEntry> {
  const logId = generateId();

  const [entry] = await db
    .insert(auditLog)
    .values({
      logId,
      dominionLeadId: input.dominionLeadId ?? null,
      userId: input.userId ?? 'system',
      actionType: input.actionType,
      metadata: input.metadata ?? {},
    })
    .returning();

  domainEvents.emit('audit.logged', { logId, actionType: input.actionType });
  return entry;
}

/**
 * Get audit trail for a property.
 */
export async function getAuditTrail(
  dominionLeadId: string,
  limit: number = 100,
): Promise<AuditLogEntry[]> {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.dominionLeadId, dominionLeadId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

// ─── DNC Check (Charter Section VIII) ──────────────

export interface DncCheckResult {
  phone: string;
  isOnDnc: boolean;
  checkedAt: Date;
  source: string;
}

/**
 * Check if a property/lead is on Do Not Call.
 *
 * Charter Section VIII: DNC scrub before dial eligibility.
 * No exceptions.
 *
 * Checks (in order):
 * 1. property.dnc_flag — agent-set flag
 * 2. property_contacts.dnd_calls — skip-trace derived (Tracerfy/BatchData)
 *
 * All checks are logged for compliance.
 */
export async function checkDnc(
  phone: string,
  dominionLeadId?: string,
): Promise<DncCheckResult> {
  const checkedAt = new Date();

  if (!dominionLeadId) {
    await logAudit({
      dominionLeadId: undefined,
      actionType: 'compliance.dnc_check',
      metadata: { phone, result: false, source: 'no_lead_id' },
    });
    return { phone, isOnDnc: false, checkedAt, source: 'no_lead_id' };
  }

  // 1. Check property-level DNC flag (agent-set)
  const [property] = await db
    .select({ dncFlag: properties.dncFlag })
    .from(properties)
    .where(eq(properties.dominionLeadId, dominionLeadId))
    .limit(1);

  if (property?.dncFlag === true) {
    await logAudit({
      dominionLeadId,
      actionType: 'compliance.dnc_check',
      metadata: { phone, result: true, source: 'property_flag' },
    });
    return { phone, isOnDnc: true, checkedAt, source: 'property_flag' };
  }

  // 2. Check property_contacts — if ANY contact has dnd_calls=true, block
  const contacts = await db
    .select({ dndCalls: propertyContacts.dndCalls, phone: propertyContacts.phone })
    .from(propertyContacts)
    .where(eq(propertyContacts.dominionLeadId, dominionLeadId));

  for (const contact of contacts) {
    if (contact.dndCalls === true) {
      const source = `contact_dnd:${contact.phone ?? 'unknown'}`;
      await logAudit({
        dominionLeadId,
        actionType: 'compliance.dnc_check',
        metadata: { phone: contact.phone, result: true, source },
      });
      return { phone, isOnDnc: true, checkedAt, source };
    }
  }

  await logAudit({
    dominionLeadId,
    actionType: 'compliance.dnc_check',
    metadata: { phone, result: false, source: 'db_check' },
  });
  return { phone, isOnDnc: false, checkedAt, source: 'db_check' };
}

// ─── Litigator Check (Charter Section VIII) ─────────

export interface LitigatorCheckResult {
  ownerName: string;
  isLitigator: boolean;
  checkedAt: Date;
  source: string;
}

/**
 * Check if a property/lead is a known litigator.
 *
 * Charter Section VIII: Litigant suppression before dial eligibility.
 * No exceptions.
 *
 * Checks:
 * 1. property.litigant_flag — agent-set flag
 */
export async function checkLitigator(
  ownerName: string,
  dominionLeadId?: string,
): Promise<LitigatorCheckResult> {
  const checkedAt = new Date();

  if (!dominionLeadId) {
    await logAudit({
      dominionLeadId: undefined,
      actionType: 'compliance.litigator_check',
      metadata: { ownerName, result: false, source: 'no_lead_id' },
    });
    return { ownerName, isLitigator: false, checkedAt, source: 'no_lead_id' };
  }

  const [property] = await db
    .select({ litigantFlag: properties.litigantFlag })
    .from(properties)
    .where(eq(properties.dominionLeadId, dominionLeadId))
    .limit(1);

  if (property?.litigantFlag === true) {
    await logAudit({
      dominionLeadId,
      actionType: 'compliance.litigator_check',
      metadata: { ownerName, result: true, source: 'property_flag' },
    });
    return { ownerName, isLitigator: true, checkedAt, source: 'property_flag' };
  }

  await logAudit({
    dominionLeadId,
    actionType: 'compliance.litigator_check',
    metadata: { ownerName, result: false, source: 'db_check' },
  });
  return { ownerName, isLitigator: false, checkedAt, source: 'db_check' };
}

// ─── Opt-Out Check (Charter Section VIII) ──────────

export interface OptOutCheckResult {
  dominionLeadId: string;
  isOptedOut: boolean;
  checkedAt: Date;
  source: string;
}

/**
 * Check if a property/lead has opted out of contact.
 *
 * Charter Section VIII: Opt-out enforcement before dial eligibility.
 * No exceptions.
 *
 * Checks:
 * 1. property.opt_out_flag — agent-set or system-set flag
 */
export async function checkOptOut(
  dominionLeadId?: string,
): Promise<OptOutCheckResult> {
  const checkedAt = new Date();

  if (!dominionLeadId) {
    await logAudit({
      dominionLeadId: undefined,
      actionType: 'compliance.opt_out_check',
      metadata: { result: false, source: 'no_lead_id' },
    });
    return { dominionLeadId: '', isOptedOut: false, checkedAt, source: 'no_lead_id' };
  }

  const [property] = await db
    .select({ optOutFlag: properties.optOutFlag })
    .from(properties)
    .where(eq(properties.dominionLeadId, dominionLeadId))
    .limit(1);

  if (property?.optOutFlag === true) {
    await logAudit({
      dominionLeadId,
      actionType: 'compliance.opt_out_check',
      metadata: { result: true, source: 'property_flag' },
    });
    return { dominionLeadId, isOptedOut: true, checkedAt, source: 'property_flag' };
  }

  await logAudit({
    dominionLeadId,
    actionType: 'compliance.opt_out_check',
    metadata: { result: false, source: 'db_check' },
  });
  return { dominionLeadId, isOptedOut: false, checkedAt, source: 'db_check' };
}
