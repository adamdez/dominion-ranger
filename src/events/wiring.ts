import { domainEvents } from './bus.js';
import { logger } from '../config/logger.js';
import { logAudit } from '../modules/compliance/index.js';
import { createLeadInstance } from '../modules/workflow/index.js';
import { logActivity } from '../modules/analytics/activity-logger.js';
import { scoringQueue } from '../jobs/queues.js';
import { isFeatureEnabled } from '../modules/feature-flags/index.js';

async function enqueueForScoring(dominionLeadId: string): Promise<void> {
  try {
    await scoringQueue.add('score-property', {
      dominionLeadId,
      reason: 'event_ingested' as const,
    }, {
      jobId: `score-${dominionLeadId}`,
    });
    logger.debug({ dominionLeadId }, 'Enqueued scoring job (BullMQ)');
  } catch (err: unknown) {
    logger.error({ err, dominionLeadId }, 'Failed to enqueue scoring job — Redis may be unavailable');
  }
}

/**
 * Wire domain event handlers.
 *
 * Cross-module side effects: audit logging, activity logging,
 * BullMQ scoring enqueue, and lead instance creation.
 */
export function wireEventHandlers(): void {

  // ─── Property Events ───────────────────────────
  domainEvents.on('property.created', async ({ dominionLeadId }) => {
    await logAudit({
      dominionLeadId,
      actionType: 'property.created',
      metadata: { source: 'pipeline' },
    });
  });

  // ─── Distress Event Ingestion → enqueue durable scoring ──
  domainEvents.on('distress_event.ingested', async ({ eventId, dominionLeadId, eventType, eventLayer }) => {
    await logAudit({
      dominionLeadId,
      actionType: 'distress_event.ingested',
      metadata: { eventId, eventType, eventLayer },
    });

    if (await isFeatureEnabled('auto_pipeline')) {
      await enqueueForScoring(dominionLeadId);
    } else {
      logger.debug({ dominionLeadId }, 'auto_pipeline disabled — skipping scoring enqueue');
    }
  });

  // ─── Scoring Completed → activity log ───────────
  domainEvents.on('scoring.completed', async ({ dominionLeadId, scoreId, compositeScore }) => {
    await logAudit({
      dominionLeadId,
      actionType: 'scoring.completed',
      metadata: { scoreId, compositeScore },
    });

    try {
      await logActivity({
        dominionLeadId,
        activityType: 'STATUS_CHANGED',
        channel: 'OUTBOUND_COLD',
        meta: { action: 'scoring_completed', scoreId, compositeScore },
      });
    } catch (err: unknown) {
      logger.error({ err, dominionLeadId }, 'Failed to log scoring activity');
    }
  });

  // ─── Lead Promoted → Create Lead Instance + activity log ──
  domainEvents.on('lead.promoted', async ({ promotionId, dominionLeadId, compositeScore, marketingTier }) => {
    await logAudit({
      dominionLeadId,
      actionType: 'lead.promoted',
      metadata: { promotionId, compositeScore, marketingTier },
    });

    try {
      await logActivity({
        dominionLeadId,
        activityType: 'LEAD_PROMOTED',
        channel: 'OUTBOUND_COLD',
        meta: { promotionId, compositeScore, marketingTier },
      });
    } catch (err: unknown) {
      logger.error({ err, dominionLeadId }, 'Failed to log promotion activity');
    }

    try {
      await createLeadInstance({ dominionLeadId, promotionId });
    } catch (err) {
      if (err instanceof Error && err.message.includes('Active lead instance already exists')) {
        logger.debug({ dominionLeadId, promotionId }, 'Lead instance already exists, skipping');
      } else {
        logger.error({ err, dominionLeadId, promotionId }, 'Failed to create lead instance from promotion');
      }
    }
  });

  // ─── Sentinel Events ──────────────────────────
  domainEvents.on('sentinel.exported', async ({ dominionLeadId, promotionId }) => {
    await logAudit({
      dominionLeadId,
      actionType: 'sentinel.exported',
      metadata: { promotionId },
    });
  });

  domainEvents.on('sentinel.status_received', async ({ dominionLeadId, status }) => {
    await logAudit({
      dominionLeadId,
      actionType: 'sentinel.status_received',
      metadata: { status },
    });
  });

  logger.info('Domain event handlers wired');
}
