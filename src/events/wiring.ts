import { domainEvents } from './bus.js';
import { logger } from '../config/logger.js';
import { logAudit } from '../modules/compliance/service.js';
import { createLeadInstance, getActiveLeadInstance } from '../modules/workflow/service.js';

/**
 * Wire domain event handlers.
 *
 * This is where cross-module side effects are configured.
 * Each handler runs in-process (not queued) for immediate side effects.
 * Heavy work should be pushed to BullMQ queues instead.
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

  // ─── Distress Event Ingestion ──────────────────
  domainEvents.on('distress_event.ingested', async ({ eventId, dominionLeadId, eventType, eventLayer }) => {
    await logAudit({
      dominionLeadId,
      actionType: 'distress_event.ingested',
      metadata: { eventId, eventType, eventLayer },
    });
  });

  // ─── Scoring Completed ─────────────────────────
  domainEvents.on('scoring.completed', async ({ dominionLeadId, scoreId, compositeScore }) => {
    await logAudit({
      dominionLeadId,
      actionType: 'scoring.completed',
      metadata: { scoreId, compositeScore },
    });
  });

  // ─── Lead Promoted → Create Lead Instance ──────
  domainEvents.on('lead.promoted', async ({ promotionId, dominionLeadId, compositeScore, marketingTier }) => {
    await logAudit({
      dominionLeadId,
      actionType: 'lead.promoted',
      metadata: { promotionId, compositeScore, marketingTier },
    });

    try {
      const existing = await getActiveLeadInstance(dominionLeadId);
      if (!existing) {
        await createLeadInstance({ dominionLeadId, promotionId });
      }
    } catch (err) {
      logger.error({ err, dominionLeadId, promotionId }, 'Failed to create lead instance from promotion');
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
