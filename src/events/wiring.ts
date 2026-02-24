import { domainEvents } from './bus.js';
import { logger } from '../config/logger.js';
import { logAudit } from '../modules/compliance/index.js';
import { createLeadInstance } from '../modules/workflow/index.js';
import { scoreProperty } from '../modules/scoring/service.js';
import { evaluateForPromotion } from '../modules/promotion/service.js';

const pendingScoreQueue = new Set<string>();
let scoreFlushTimer: ReturnType<typeof setTimeout> | null = null;
const SCORE_FLUSH_DELAY_MS = 5_000;

async function flushScoreQueue(): Promise<void> {
  if (pendingScoreQueue.size === 0) return;
  const batch = Array.from(pendingScoreQueue);
  pendingScoreQueue.clear();

  for (let i = 0; i < batch.length; i += 5) {
    const chunk = batch.slice(i, i + 5);
    await Promise.allSettled(
      chunk.map(async (id) => {
        try {
          const result = await scoreProperty(id);
          await evaluateForPromotion(id, result);
        } catch (err) {
          logger.warn({ err, dominionLeadId: id }, 'Auto-pipeline score/promote error');
        }
      }),
    );
  }
}

function enqueueForScoring(dominionLeadId: string): void {
  pendingScoreQueue.add(dominionLeadId);
  if (scoreFlushTimer) clearTimeout(scoreFlushTimer);
  scoreFlushTimer = setTimeout(() => {
    flushScoreQueue().catch((err) => logger.error({ err }, 'Auto-pipeline flush error'));
    scoreFlushTimer = null;
  }, SCORE_FLUSH_DELAY_MS);
}

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
    enqueueForScoring(dominionLeadId);
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
