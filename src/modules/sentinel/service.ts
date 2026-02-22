import { eq } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  systemSettings,
  promotedLeads,
  properties,
  outcomeReservoir,
  auditLog,
} from '../../db/schema/index.js';
import type { PromotedLead, Property } from '../../db/schema/index.js';
import { generateId } from '../../lib/index.js';
import { domainEvents } from '../../events/bus.js';
import { logger } from '../../config/logger.js';

// ─── Sentinel Payload (Charter VIII.3) ─────────────

interface SentinelPayload {
  dominion_lead_id: string;
  apn: string | null;
  heat_score: number;
  confidence_score: number;
  score_model_version: string;
  score_breakdown: Record<string, unknown> | null;
  tags: string[];
  ghost_mode_used: boolean;
  pushed_at: string;
  audit_url: string;
  owner_name: string | null;
  contact_first: string | null;
  contact_last: string | null;
  phone: string | null;
  email: string | null;
  mailing_address: string | null;
  property_address: string | null;
  motivation_notes: string | null;
  source_stack_history: string[];
}

/**
 * Build and dispatch the Sentinel promotion payload.
 *
 * If sentinel_webhook_url exists in system_settings → POST payload.
 * If not → store event only. No code change required later.
 */
export async function dispatchToSentinel(
  promotion: PromotedLead,
  property: Property,
): Promise<boolean> {
  const webhookUrl = await getSentinelWebhookUrl();

  const payload = buildSentinelPayload(promotion, property);

  if (!webhookUrl) {
    logger.debug({ dominionLeadId: promotion.dominionLeadId }, 'No Sentinel webhook URL configured, skipping dispatch');
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Dominion-Source': 'ranger',
        'X-Dominion-Lead-Id': promotion.dominionLeadId,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      logger.error(
        { status: response.status, dominionLeadId: promotion.dominionLeadId },
        'Sentinel webhook dispatch failed',
      );
      return false;
    }

    // Mark as exported
    await db
      .update(promotedLeads)
      .set({ exportedToSentinelAt: new Date() })
      .where(eq(promotedLeads.promotionId, promotion.promotionId));

    domainEvents.emit('sentinel.exported', {
      dominionLeadId: promotion.dominionLeadId,
      promotionId: promotion.promotionId,
    });

    logger.info({ dominionLeadId: promotion.dominionLeadId }, 'Lead exported to Sentinel');
    return true;
  } catch (err) {
    logger.error({ err, dominionLeadId: promotion.dominionLeadId }, 'Sentinel webhook dispatch error');
    return false;
  }
}

function buildSentinelPayload(promotion: PromotedLead, property: Property): SentinelPayload {
  const signalSummary = promotion.signalSummary as Record<string, unknown> | null;
  const topSignals = (signalSummary?.topSignals as Array<{ type: string }>) ?? [];

  return {
    dominion_lead_id: promotion.dominionLeadId,
    apn: property.apn,
    heat_score: parseFloat(promotion.compositeScore),
    confidence_score: parseFloat(promotion.confidenceScore),
    score_model_version: promotion.scoreModelVersion,
    score_breakdown: signalSummary,
    tags: topSignals.map((s) => s.type),
    ghost_mode_used: false,
    pushed_at: promotion.promotedAt.toISOString(),
    audit_url: `/api/properties/${promotion.dominionLeadId}/audit`,
    owner_name: property.ownerName,
    contact_first: property.ownerFirst,
    contact_last: property.ownerLast,
    phone: property.phone,
    email: property.email,
    mailing_address: property.mailingAddress,
    property_address: property.standardizedAddress ?? property.streetAddress,
    motivation_notes: promotion.recommendedAction,
    source_stack_history: topSignals.map((s) => s.type),
  };
}

// ─── Status Sync (Charter VIII.4) ──────────────────

export type SentinelStatus =
  | 'CLAIMED' | 'DIALED' | 'OFFER_SENT' | 'CONTRACTED'
  | 'CLOSED' | 'DEAD' | 'LISTED' | 'SOLD';

interface StatusSyncInput {
  dominionLeadId: string;
  status: SentinelStatus;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Receive status update from Sentinel.
 *
 * Updates outcome reservoir and logs audit entry.
 */
export async function receiveSentinelStatus(input: StatusSyncInput): Promise<void> {
  const now = new Date();

  // Upsert outcome reservoir
  const outcomeUpdates: Record<string, unknown> = {
    outcomeStatus: input.status,
    updatedAt: now,
  };

  // Map status to specific timestamp fields
  if (input.status === 'DIALED' || input.status === 'CLAIMED') {
    outcomeUpdates.contactedAt = now;
  } else if (input.status === 'CONTRACTED') {
    outcomeUpdates.contractSignedAt = now;
  } else if (input.status === 'CLOSED') {
    outcomeUpdates.dealClosedAt = now;
    if (input.metadata?.assignmentFee) {
      outcomeUpdates.assignmentFee = String(input.metadata.assignmentFee);
    }
  } else if (input.status === 'DEAD') {
    outcomeUpdates.lostReason = (input.metadata?.reason as string) ?? 'Unknown';
  }

  await db
    .insert(outcomeReservoir)
    .values({
      dominionLeadId: input.dominionLeadId,
      ...outcomeUpdates,
    })
    .onConflictDoUpdate({
      target: outcomeReservoir.dominionLeadId,
      set: outcomeUpdates,
    });

  // Audit log
  await db.insert(auditLog).values({
    logId: generateId(),
    dominionLeadId: input.dominionLeadId,
    userId: input.userId ?? 'sentinel',
    actionType: `sentinel.status.${input.status.toLowerCase()}`,
    metadata: input.metadata ?? {},
  });

  domainEvents.emit('sentinel.status_received', {
    dominionLeadId: input.dominionLeadId,
    status: input.status,
  });

  logger.info(
    { dominionLeadId: input.dominionLeadId, status: input.status },
    'Sentinel status received',
  );
}

// ─── Helpers ───────────────────────────────────────

async function getSentinelWebhookUrl(): Promise<string | null> {
  const [setting] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, 'sentinel_webhook_url'));

  if (!setting) return null;
  const url = (setting.value as { url?: string })?.url;
  return url ?? null;
}
