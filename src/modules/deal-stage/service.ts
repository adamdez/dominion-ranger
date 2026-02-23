import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { leadInstances, DealStage } from '../../db/schema/index.js';
import type { DealStageValue } from '../../db/schema/constants.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { logActivity } from '../analytics/activity-logger.js';
import { logger } from '../../config/logger.js';

const VALID_DEAL_TRANSITIONS: Record<string, string[]> = {
  [DealStage.NEW_LEAD]:       [DealStage.SKIP_TRACED, DealStage.DEAD],
  [DealStage.SKIP_TRACED]:    [DealStage.CONTACTED, DealStage.DEAD],
  [DealStage.CONTACTED]:      [DealStage.INTERESTED, DealStage.DEAD],
  [DealStage.INTERESTED]:     [DealStage.OFFER_MADE, DealStage.DEAD],
  [DealStage.OFFER_MADE]:     [DealStage.UNDER_CONTRACT, DealStage.DEAD],
  [DealStage.UNDER_CONTRACT]: [DealStage.TITLE_ESCROW, DealStage.CLOSED_LOST],
  [DealStage.TITLE_ESCROW]:   [DealStage.CLOSED_WON, DealStage.CLOSED_LOST],
  [DealStage.CLOSED_WON]:     [],
  [DealStage.CLOSED_LOST]:    [],
  [DealStage.DEAD]:           [DealStage.NEW_LEAD],
};

export async function transitionDealStage(
  leadInstanceId: string,
  newStage: DealStageValue,
  userId: string,
): Promise<{ leadInstanceId: string; dealStage: string }> {
  const [lead] = await db
    .select({
      leadInstanceId: leadInstances.leadInstanceId,
      dominionLeadId: leadInstances.dominionLeadId,
      dealStage: leadInstances.dealStage,
    })
    .from(leadInstances)
    .where(eq(leadInstances.leadInstanceId, leadInstanceId));

  if (!lead) throw new NotFoundError('LeadInstance', leadInstanceId);

  const currentStage = lead.dealStage ?? DealStage.NEW_LEAD;
  const allowed = VALID_DEAL_TRANSITIONS[currentStage] ?? [];

  if (!allowed.includes(newStage)) {
    throw new ValidationError(
      `Invalid deal stage transition: ${currentStage} → ${newStage}`,
      { currentStage, newStage, allowedTransitions: allowed },
    );
  }

  await db
    .update(leadInstances)
    .set({ dealStage: newStage, updatedAt: sql`now()` })
    .where(eq(leadInstances.leadInstanceId, leadInstanceId));

  await logActivity({
    dominionLeadId: lead.dominionLeadId,
    leadInstanceId,
    userId,
    activityType: 'STATUS_CHANGED',
    channel: 'OUTBOUND_COLD',
    meta: {
      action: 'DEAL_STAGE_TRANSITION',
      fromStage: currentStage,
      toStage: newStage,
    },
  }).catch(err => logger.error({ err }, 'Failed to log deal stage activity'));

  return { leadInstanceId, dealStage: newStage };
}
