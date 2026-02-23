import { domainEvents } from './bus.js';
import { logger } from '../config/logger.js';
import { logAudit } from '../modules/compliance/index.js';
import { createLeadInstance } from '../modules/workflow/index.js';
import { scoreProperty } from '../modules/scoring/index.js';
import { evaluateForPromotion } from '../modules/promotion/index.js';

// ─── Auto-Pipeline Queue ─────────────────────────
// Debounced batch: collect property IDs during bulk imports,
// then score + promote in the background after a quiet period.
const pendingScoreQueue = new Set<string>();
let scoreFlushTimer: ReturnType<typeof setTimeout> | null = null;
const SCORE_FLUSH_DELAY_MS = 5_000;
const SCORE_BATCH_CONCURRENCY = 5;

async function flushScoreQueue(): Promise<void> {
  if (pendingScoreQueue.size === 0) return;

  const batch = Array.from(pendingScoreQueue);
  pendingScoreQueue.clear();

  logger.info({ count: batch.length }, 'Auto-pipeline: flushing score queue');

  let scored = 0;
  let promoted = 0;
  let errors = 0;

  for (let i = 0; i < batch.length; i += SCORE_BATCH_CONCURRENCY) {
    const chunk = batch.slice(i, i + SCORE_BATCH_CONCURRENCY);
    await Promise.allSettled(
      chunk.map(async (dominionLeadId) => {
        try {
          const scoringResult = await scoreProperty(dominionLeadId);
          scored++;

          try {
            await evaluateForPromotion(dominionLeadId, scoringResult);
            promoted++;
          } catch (promoErr) {
            if (promoErr instanceof Error && promoErr.message.includes('already promoted')) {
              // Expected for re-scores of already-promoted leads
            } else {
              logger.error({ err: promoErr, dominionLeadId }, 'Auto-promote failed');
            }
          }
        } catch (err) {
          errors++;
          logger.error({ err, dominionLeadId }, 'Auto-score failed');
        }
      }),
    );
  }

  logger.info({ scored, promoted, errors, total: batch.length }, 'Auto-pipeline: flush complete');
}

function enqueueForScoring(dominionLeadId: string): void {
  pendingScoreQueue.add(dominionLeadId);

  if (scoreFlushTimer) clearTimeout(scoreFlushTimer);
  scoreFlushTimer = setTimeout(() => {
    flushScoreQueue().catch(err => logger.error({ err }, 'Auto-pipeline flush error'));
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
