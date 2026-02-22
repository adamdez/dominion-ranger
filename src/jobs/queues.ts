import { Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null }) as unknown as ConnectionOptions;

// ─── Queue Definitions ─────────────────────────────

/** Scheduled ingestion runs per adapter */
export const ingestionQueue = new Queue('ranger-ingestion', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
  },
});

/** Batch scoring recalculations (e.g., when model config changes) */
export const scoringQueue = new Queue('ranger-scoring', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 500 },
    attempts: 2,
    backoff: { type: 'exponential', delay: 3_000 },
  },
});

/** Sentinel webhook retries */
export const sentinelQueue = new Queue('ranger-sentinel', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
    attempts: 5,
    backoff: { type: 'exponential', delay: 10_000 },
  },
});

// ─── Job Types ─────────────────────────────────────

export interface IngestionJobData {
  adapterName: string;
  options?: Record<string, unknown>;
}

export interface ScoringJobData {
  dominionLeadId: string;
  reason: 'event_ingested' | 'model_change' | 'manual' | 'batch';
}

export interface SentinelDispatchJobData {
  promotionId: string;
  dominionLeadId: string;
}

// ─── Schedule Helpers ──────────────────────────────

/**
 * Schedule recurring ingestion runs.
 * Call once at startup — BullMQ handles repeat scheduling.
 */
export async function scheduleIngestionJobs(): Promise<void> {
  // Run all adapters every 6 hours
  await ingestionQueue.upsertJobScheduler(
    'daily-full-ingestion',
    { every: 6 * 60 * 60 * 1000 },
    {
      name: 'full-ingestion',
      data: { adapterName: '__all__' } satisfies IngestionJobData,
    },
  );
}

export { connection as redisConnection };
