import { Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { runAdapterPipeline } from '../ingestion/pipeline.js';

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
 * Uses BullMQ when Redis is available, setInterval fallback when not.
 */
function scheduleWithSetInterval(): void {
  logger.warn('Using setInterval fallback for adapter scheduling');
  setInterval(() => {
    runAdapterPipeline('regrid').catch((e) => logger.error({ e }, 'Regrid scheduled run failed'));
  }, 24 * 60 * 60 * 1000);
  setInterval(() => {
    runAdapterPipeline('spokane_recorder').catch((e) => logger.error({ e }, 'Spokane recorder failed'));
    runAdapterPipeline('kootenai_recorder').catch((e) => logger.error({ e }, 'Kootenai recorder failed'));
  }, 6 * 60 * 60 * 1000);
  setInterval(() => {
    runAdapterPipeline('sheriff_sale').catch((e) => logger.error({ e }, 'Sheriff sale failed'));
  }, 24 * 60 * 60 * 1000);
}

export async function scheduleIngestionJobs(): Promise<void> {
  try {
    await ingestionQueue.upsertJobScheduler(
      'daily-full-ingestion',
      { every: 6 * 60 * 60 * 1000 },
      {
        name: 'full-ingestion',
        data: { adapterName: '__all__' } satisfies IngestionJobData,
      },
    );

    await ingestionQueue.upsertJobScheduler(
      'regrid-daily',
      { every: 24 * 60 * 60 * 1000 },
      {
        name: 'regrid-ingestion',
        data: { adapterName: 'regrid' } satisfies IngestionJobData,
      },
    );

    await ingestionQueue.upsertJobScheduler(
      'recorder-6h',
      { every: 6 * 60 * 60 * 1000 },
      {
        name: 'recorder-ingestion',
        data: { adapterName: 'spokane_recorder' } satisfies IngestionJobData,
      },
    );

    await ingestionQueue.upsertJobScheduler(
      'kootenai-recorder-6h',
      { every: 6 * 60 * 60 * 1000 },
      {
        name: 'kootenai-recorder-ingestion',
        data: { adapterName: 'kootenai_recorder' } satisfies IngestionJobData,
      },
    );

    await ingestionQueue.upsertJobScheduler(
      'sheriff-daily',
      { every: 24 * 60 * 60 * 1000 },
      {
        name: 'sheriff-sale-ingestion',
        data: { adapterName: 'sheriff_sale' } satisfies IngestionJobData,
      },
    );
  } catch (err) {
    logger.warn({ err }, 'BullMQ scheduling failed — using setInterval fallback');
    scheduleWithSetInterval();
  }
}

export { connection as redisConnection };
