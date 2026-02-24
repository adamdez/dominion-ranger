/**
 * Auto-pipeline: debounced batch scoring + promotion after ingestion.
 *
 * When property/distress data is ingested, events trigger enqueueForScoring().
 * After SCORE_FLUSH_DELAY_MS of no new ingestions, the queue is flushed:
 * recalculate signal accumulation → score → promote → create lead instances.
 *
 * Safe for bulk imports: 9,000 rows → 9,000 enqueues (Set dedupes by dominionLeadId)
 * → single batched flush with concurrency limit.
 */
import { logger } from '../../config/logger.js';
import { recalculateSignalAccumulation } from '../signals/service.js';
import { scoreProperty } from '../scoring/service.js';
import { evaluateForPromotion } from '../promotion/service.js';
import { dispatchToSentinel } from '../sentinel/service.js';
import { getPropertyById } from '../properties/service.js';

const SCORE_FLUSH_DELAY_MS = 5_000;
const SCORE_BATCH_CONCURRENCY = 5;

const pendingScoreQueue = new Set<string>();
let scoreFlushTimer: ReturnType<typeof setTimeout> | null = null;

export interface ScorePromoteResult {
  scored: number;
  promoted: number;
  errors: number;
  total: number;
}

/**
 * Run scoring + promotion for a batch of property IDs.
 * Callable from wiring (flush) or standalone scripts (reimport).
 */
export async function scoreAndPromoteBatch(dominionLeadIds: string[]): Promise<ScorePromoteResult> {
  const ids = [...new Set(dominionLeadIds)];
  if (ids.length === 0) return { scored: 0, promoted: 0, errors: 0, total: 0 };

  logger.info({ count: ids.length }, 'Auto-pipeline: ingest → scored → promoted (batch start)');

  let scored = 0;
  let promoted = 0;
  let errors = 0;

  for (let i = 0; i < ids.length; i += SCORE_BATCH_CONCURRENCY) {
    const chunk = ids.slice(i, i + SCORE_BATCH_CONCURRENCY);
    await Promise.allSettled(
      chunk.map(async (dominionLeadId) => {
        try {
          await recalculateSignalAccumulation(dominionLeadId);
          const scoringResult = await scoreProperty(dominionLeadId);
          scored++;

          try {
            const promo = await evaluateForPromotion(dominionLeadId, scoringResult);
            if (promo) {
              promoted++;
              const property = await getPropertyById(dominionLeadId);
              await dispatchToSentinel(promo, property);
            }
          } catch (promoErr) {
            if (promoErr instanceof Error && promoErr.message.includes('already exists')) {
              // Idempotent: re-import same file, lead instance already exists
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

  logger.info(
    { scored, promoted, errors, total: ids.length },
    'Auto-pipeline: ingest → scored → promoted (batch complete)',
  );

  return { scored, promoted, errors, total: ids.length };
}

/**
 * Add a property to the debounced scoring queue.
 * Flush runs SCORE_FLUSH_DELAY_MS after the last enqueue.
 */
export function enqueueForScoring(dominionLeadId: string): void {
  pendingScoreQueue.add(dominionLeadId);

  if (scoreFlushTimer) clearTimeout(scoreFlushTimer);
  scoreFlushTimer = setTimeout(() => {
    scoreFlushTimer = null;
    const batch = Array.from(pendingScoreQueue);
    pendingScoreQueue.clear();
    scoreAndPromoteBatch(batch).catch((err) =>
      logger.error({ err }, 'Auto-pipeline flush error'),
    );
  }, SCORE_FLUSH_DELAY_MS);
}

/**
 * Flush the queue immediately (for scripts that need to complete before exit).
 */
export async function flushNow(): Promise<ScorePromoteResult> {
  if (scoreFlushTimer) {
    clearTimeout(scoreFlushTimer);
    scoreFlushTimer = null;
  }
  const batch = Array.from(pendingScoreQueue);
  pendingScoreQueue.clear();
  return scoreAndPromoteBatch(batch);
}
