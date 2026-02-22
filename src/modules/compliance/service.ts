import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { auditLog } from '../../db/schema/index.js';
import type { AuditLogEntry } from '../../db/schema/index.js';
import { generateId } from '../../lib/index.js';
import { domainEvents } from '../../events/bus.js';
import { logger } from '../../config/logger.js';

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

// ─── DNC Check (Stub — Phase 2 Integration) ───────

export interface DncCheckResult {
  phone: string;
  isOnDnc: boolean;
  checkedAt: Date;
  source: string;
}

/**
 * Check if a phone number is on the Do Not Call registry.
 *
 * Phase 1: Stub that always returns false.
 * Phase 2: Integrate with DNC registry API.
 *
 * All checks are logged for compliance.
 */
export async function checkDnc(
  phone: string,
  dominionLeadId?: string,
): Promise<DncCheckResult> {
  const result: DncCheckResult = {
    phone,
    isOnDnc: false,
    checkedAt: new Date(),
    source: 'stub_v1',
  };

  // Log the check regardless of result
  await logAudit({
    dominionLeadId,
    actionType: 'compliance.dnc_check',
    metadata: { phone, result: result.isOnDnc, source: result.source },
  });

  return result;
}

// ─── Litigator Blacklist (Stub) ────────────────────

export interface LitigatorCheckResult {
  ownerName: string;
  isLitigator: boolean;
  checkedAt: Date;
  source: string;
}

/**
 * Check if an owner is a known litigator.
 *
 * Phase 1: Stub.
 * Phase 2: Integrate with litigator list provider.
 */
export async function checkLitigator(
  ownerName: string,
  dominionLeadId?: string,
): Promise<LitigatorCheckResult> {
  const result: LitigatorCheckResult = {
    ownerName,
    isLitigator: false,
    checkedAt: new Date(),
    source: 'stub_v1',
  };

  await logAudit({
    dominionLeadId,
    actionType: 'compliance.litigator_check',
    metadata: { ownerName, result: result.isLitigator, source: result.source },
  });

  return result;
}
