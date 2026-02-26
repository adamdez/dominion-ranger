/**
 * Call-Ready Auto Queue service.
 *
 * After skip trace or scoring completes, evaluates leads for call-ready eligibility
 * and auto-enqueues them to the dial queue (DIAL_READY) when criteria are met.
 *
 * Charter: Compliance gating before dial — we run runComplianceGating before DIAL_READY.
 */
import { eq, desc, and, sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  leadInstances,
  scoringRecords,
  callLogs,
  LeadStatus,
} from '../../db/schema/index.js';
import { logAudit } from '../compliance/index.js';
import { runComplianceGating } from '../workflow/service.js';
import { getCallablePhone } from '../dialer/call-service.js';
import { checkDnc } from '../compliance/service.js';
import { logger } from '../../config/logger.js';
import { getCallReadyConfig } from './config.js';
import { evaluateEligibility, type EligibilityReason } from './eligibility.js';

export interface CallReadyEvaluationResult {
  dominionLeadId: string;
  leadInstanceId: string | null;
  eligible: boolean;
  enqueued: boolean;
  reasons: EligibilityReason[];
  trigger: 'skip_trace' | 'scoring' | 'manual';
}

/**
 * Fetch the latest composite score for a property.
 */
async function getLatestScore(dominionLeadId: string): Promise<number | null> {
  const [row] = await db
    .select({ compositeScore: scoringRecords.compositeScore })
    .from(scoringRecords)
    .where(eq(scoringRecords.dominionLeadId, dominionLeadId))
    .orderBy(desc(scoringRecords.createdAt))
    .limit(1);
  return row?.compositeScore != null ? parseFloat(String(row.compositeScore)) : null;
}

/**
 * Get the most recent contact timestamp (call or lead instance contactedAt).
 * Uses call endedAt when available, else startedAt for in-progress calls.
 */
async function getLastContactAt(dominionLeadId: string): Promise<Date | null> {
  const callRows = await db
    .select({ endedAt: callLogs.endedAt, startedAt: callLogs.startedAt })
    .from(callLogs)
    .where(eq(callLogs.dominionLeadId, dominionLeadId))
    .orderBy(desc(callLogs.startedAt))
    .limit(5);

  const [leadRow] = await db
    .select({ contactedAt: leadInstances.contactedAt })
    .from(leadInstances)
    .where(eq(leadInstances.dominionLeadId, dominionLeadId))
    .orderBy(desc(leadInstances.contactedAt))
    .limit(1);

  const dates: Date[] = [];
  for (const r of callRows) {
    const d = r.endedAt ?? r.startedAt;
    if (d) dates.push(d);
  }
  if (leadRow?.contactedAt) dates.push(leadRow.contactedAt);
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map(d => d.getTime())));
}

/**
 * Check if property/contacts are DNC.
 */
async function checkPropertyDnc(dominionLeadId: string): Promise<{ isDnc: boolean; source?: string }> {
  const phone = await getCallablePhone(dominionLeadId);
  if (!phone) return { isDnc: false };

  const result = await checkDnc(phone, dominionLeadId);
  return { isDnc: result.isOnDnc, source: result.source };
}

/**
 * Evaluate and optionally enqueue a single lead for call-ready.
 * Logs the decision to audit_log.
 */
export async function evaluateAndEnqueueCallReady(
  dominionLeadId: string,
  trigger: 'skip_trace' | 'scoring' | 'manual',
): Promise<CallReadyEvaluationResult> {
  const config = getCallReadyConfig();
  if (!config.enabled) {
    return {
      dominionLeadId,
      leadInstanceId: null,
      eligible: false,
      enqueued: false,
      reasons: [{ code: 'NO_LEAD_INSTANCE', message: 'Call-ready auto queue disabled' }],
      trigger,
    };
  }

  const [lead] = await db
    .select()
    .from(leadInstances)
    .where(
      and(
        eq(leadInstances.dominionLeadId, dominionLeadId),
        sql`${leadInstances.status} NOT IN (${LeadStatus.CLOSED}, ${LeadStatus.DEAD})`,
      ),
    )
    .orderBy(desc(leadInstances.createdAt))
    .limit(1);

  const compositeScore = (await getLatestScore(dominionLeadId)) ?? 0;
  const hasCallablePhone = (await getCallablePhone(dominionLeadId)) != null;
  const { isDnc, source: dncSource } = await checkPropertyDnc(dominionLeadId);
  const lastContactAt = await getLastContactAt(dominionLeadId);

  const eligibilityResult = evaluateEligibility(
    {
      compositeScore,
      hasCallablePhone,
      isDnc,
      dncSource,
      lastContactAt,
      assignedTo: lead?.assignedTo ?? null,
      currentStatus: lead?.status ?? '',
      hasLeadInstance: !!lead,
    },
    {
      scoreThreshold: config.scoreThreshold,
      cooldownHours: config.cooldownHours,
      claimOwnedOnly: config.claimOwnedOnly,
    },
  );

  await logAudit({
    dominionLeadId,
    actionType: 'call_ready.evaluated',
    metadata: {
      trigger,
      eligible: eligibilityResult.eligible,
      reasons: eligibilityResult.reasons,
      leadInstanceId: lead?.leadInstanceId,
      compositeScore,
      hasCallablePhone,
      isDnc,
    },
  });

  if (!eligibilityResult.eligible || !lead) {
    logger.debug(
      { dominionLeadId, reasons: eligibilityResult.reasons, trigger },
      'Call-ready: ineligible',
    );
    return {
      dominionLeadId,
      leadInstanceId: lead?.leadInstanceId ?? null,
      eligible: false,
      enqueued: false,
      reasons: eligibilityResult.reasons,
      trigger,
    };
  }

  try {
    await runComplianceGating(lead.leadInstanceId);
    logger.info(
      { dominionLeadId, leadInstanceId: lead.leadInstanceId, trigger },
      'Call-ready: enqueued to dial queue',
    );
    await logAudit({
      dominionLeadId,
      actionType: 'call_ready.enqueued',
      metadata: { leadInstanceId: lead.leadInstanceId, trigger },
    });
    return {
      dominionLeadId,
      leadInstanceId: lead.leadInstanceId,
      eligible: true,
      enqueued: true,
      reasons: eligibilityResult.reasons,
      trigger,
    };
  } catch (err) {
    logger.error(
      { err, dominionLeadId, leadInstanceId: lead.leadInstanceId, trigger },
      'Call-ready: compliance gating failed',
    );
    await logAudit({
      dominionLeadId,
      actionType: 'call_ready.enqueue_failed',
      metadata: {
        leadInstanceId: lead.leadInstanceId,
        trigger,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return {
      dominionLeadId,
      leadInstanceId: lead.leadInstanceId,
      eligible: true,
      enqueued: false,
      reasons: eligibilityResult.reasons,
      trigger,
    };
  }
}

/**
 * Run call-ready rule on leads from the last N days.
 * Returns summary of evaluations.
 */
export async function runCallReadyForLastNDays(days: number): Promise<{
  evaluated: number;
  eligible: number;
  enqueued: number;
  errors: number;
  results: CallReadyEvaluationResult[];
}> {
  const config = getCallReadyConfig();
  if (!config.enabled) {
    return { evaluated: 0, eligible: 0, enqueued: 0, errors: 0, results: [] };
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const leads = await db
    .selectDistinct({ dominionLeadId: leadInstances.dominionLeadId })
    .from(leadInstances)
    .where(
      and(
        sql`${leadInstances.status} NOT IN (${LeadStatus.CLOSED}, ${LeadStatus.DEAD})`,
        sql`${leadInstances.createdAt} >= ${since}`,
      ),
    );

  const results: CallReadyEvaluationResult[] = [];
  let eligible = 0;
  let enqueued = 0;
  let errors = 0;

  for (const { dominionLeadId } of leads) {
    try {
      const result = await evaluateAndEnqueueCallReady(dominionLeadId, 'manual');
      results.push(result);
      if (result.eligible) eligible++;
      if (result.enqueued) enqueued++;
    } catch (err) {
      errors++;
      logger.error({ err, dominionLeadId }, 'Call-ready batch: evaluation failed');
    }
  }

  return {
    evaluated: leads.length,
    eligible,
    enqueued,
    errors,
    results,
  };
}
