/**
 * Durable scoring enqueue — replaces volatile in-memory queue.
 *
 * Uses BullMQ when Redis is available. Idempotent via jobId = dominionLeadId.
 * Falls back to DB-backed pending_scoring when Redis is unavailable.
 */
import type { Queue } from 'bullmq';
import type { ScoringJobData } from './queues.js';
import { logger } from '../config/logger.js';
import { db } from '../db/connection.js';
import { pendingScoring } from '../db/schema/index.js';

type ScoringReason = 'event_ingested' | 'model_change' | 'manual' | 'batch';

type ScoringQueue = Queue<ScoringJobData> | null;

async function withQueue<T>(fn: (q: Queue<ScoringJobData>) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  const queue = await loadQueue();
  if (!queue) return { ok: false };
  try {
    const value = await fn(queue);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

let _queue: ScoringQueue | undefined;
async function loadQueue(): Promise<ScoringQueue> {
  if (_queue !== undefined) return _queue;
  try {
    const { scoringQueue } = await import('./queues.js');
    _queue = scoringQueue;
    return scoringQueue;
  } catch {
    _queue = null;
    return null;
  }
}

/**
 * Enqueue a property for scoring. Idempotent — duplicate dominionLeadId
 * does not create duplicate work.
 */
export async function enqueueForScoring(
  dominionLeadId: string,
  reason: ScoringReason = 'event_ingested',
): Promise<void> {
  const result = await withQueue((q) =>
    q.add('score', { dominionLeadId, reason }, { jobId: dominionLeadId, removeOnComplete: { count: 500 } }),
  );

  if (result.ok) {
    logger.info({ dominionLeadId, reason }, 'enqueued scoring job');
    return;
  }

  await db
    .insert(pendingScoring)
    .values({ dominionLeadId, reason })
    .onConflictDoNothing({ target: [pendingScoring.dominionLeadId] });
  logger.info({ dominionLeadId, reason }, 'enqueued scoring job (DB fallback)');
}

/**
 * Enqueue a batch of properties. Idempotent per dominionLeadId.
 */
export async function enqueueForScoringBatch(
  dominionLeadIds: string[],
  reason: ScoringReason = 'batch',
): Promise<{ enqueued: number; failed: number }> {
  const unique = [...new Set(dominionLeadIds)];

  const result = await withQueue((q) => {
    const jobs = unique.map((dominionLeadId) => ({
      name: 'score',
      data: { dominionLeadId, reason } as const,
      opts: { jobId: dominionLeadId },
    }));
    return q.addBulk(jobs);
  });

  if (result.ok) {
    logger.info({ count: unique.length, reason }, 'enqueued scoring batch');
    return { enqueued: unique.length, failed: 0 };
  }

  logger.warn({ count: unique.length }, 'Redis scoring batch failed, using DB fallback');

  let inserted = 0;
  for (const dominionLeadId of unique) {
    const r = await db
      .insert(pendingScoring)
      .values({ dominionLeadId, reason })
      .onConflictDoNothing({ target: [pendingScoring.dominionLeadId] })
      .returning();
    if (r.length > 0) inserted++;
  }
  logger.info({ count: inserted, total: unique.length, reason }, 'enqueued scoring batch (DB fallback)');
  return { enqueued: inserted, failed: unique.length - inserted };
}
