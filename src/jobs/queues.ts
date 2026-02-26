import { Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { runAdapterPipeline } from '../ingestion/pipeline.js';

/** Queue names — used by queues, workers, and scripts. Do not change. */
export const QUEUE_NAMES = {
  ingestion: 'ranger-ingestion',
  scoring: 'ranger-scoring',
  sentinel: 'ranger-sentinel',
} as const;

const PIPELINE_DISABLED_MSG =
  'Queue unavailable — AUTO_PIPELINE_ENABLED is false. Enable pipeline to use BullMQ queues.';

let _connection: IORedis | null = null;
let _ingestionQueue: Queue | null = null;
let _scoringQueue: Queue | null = null;
let _sentinelQueue: Queue | null = null;

function getConnection(): ConnectionOptions {
  if (!env.AUTO_PIPELINE_ENABLED) {
    throw new Error(PIPELINE_DISABLED_MSG);
  }
  if (!_connection) {
    _connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return _connection as unknown as ConnectionOptions;
}

/** Scheduled ingestion runs per adapter. Throws when AUTO_PIPELINE_ENABLED=false. */
export function getIngestionQueue(): Queue {
  if (!env.AUTO_PIPELINE_ENABLED) {
    throw new Error(PIPELINE_DISABLED_MSG);
  }
  if (!_ingestionQueue) {
    _ingestionQueue = new Queue(QUEUE_NAMES.ingestion, {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    });
  }
  return _ingestionQueue;
}

/** Batch scoring recalculations. Throws when AUTO_PIPELINE_ENABLED=false. */
export function getScoringQueue(): Queue {
  if (!env.AUTO_PIPELINE_ENABLED) {
    throw new Error(PIPELINE_DISABLED_MSG);
  }
  if (!_scoringQueue) {
    _scoringQueue = new Queue(QUEUE_NAMES.scoring, {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
        attempts: 2,
        backoff: { type: 'exponential', delay: 3_000 },
      },
    });
  }
  return _scoringQueue;
}

/** Sentinel webhook retries. Throws when AUTO_PIPELINE_ENABLED=false. */
export function getSentinelQueue(): Queue {
  if (!env.AUTO_PIPELINE_ENABLED) {
    throw new Error(PIPELINE_DISABLED_MSG);
  }
  if (!_sentinelQueue) {
    _sentinelQueue = new Queue(QUEUE_NAMES.sentinel, {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
      },
    });
  }
  return _sentinelQueue;
}

// Backward-compatible exports — proxies that lazy-init on first property access
export const ingestionQueue = new Proxy({} as Queue, {
  get(_, prop) {
    return (getIngestionQueue() as unknown as Record<string, unknown>)[prop as string];
  },
});

export const scoringQueue = new Proxy({} as Queue, {
  get(_, prop) {
    return (getScoringQueue() as unknown as Record<string, unknown>)[prop as string];
  },
});

export const sentinelQueue = new Proxy({} as Queue, {
  get(_, prop) {
    return (getSentinelQueue() as unknown as Record<string, unknown>)[prop as string];
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

/** Schedules repeatable ingestion jobs. Requires AUTO_PIPELINE_ENABLED=true AND INGESTION_SCHEDULER_ENABLED=true. */
export async function scheduleIngestionJobs(): Promise<void> {
  if (!env.AUTO_PIPELINE_ENABLED || !env.INGESTION_SCHEDULER_ENABLED) {
    logger.info(
      { AUTO_PIPELINE_ENABLED: env.AUTO_PIPELINE_ENABLED, INGESTION_SCHEDULER_ENABLED: env.INGESTION_SCHEDULER_ENABLED },
      'scheduleIngestionJobs skipped',
    );
    return;
  }
  try {
    const queue = getIngestionQueue();

    await queue.upsertJobScheduler(
      'daily-full-ingestion',
      { every: 6 * 60 * 60 * 1000 },
      { name: 'full-ingestion', data: { adapterName: '__all__' } satisfies IngestionJobData },
    );

    await queue.upsertJobScheduler(
      'regrid-daily',
      { every: 24 * 60 * 60 * 1000 },
      { name: 'regrid-ingestion', data: { adapterName: 'regrid' } satisfies IngestionJobData },
    );

    await queue.upsertJobScheduler(
      'recorder-6h',
      { every: 6 * 60 * 60 * 1000 },
      { name: 'recorder-ingestion', data: { adapterName: 'spokane_recorder' } satisfies IngestionJobData },
    );

    await queue.upsertJobScheduler(
      'kootenai-recorder-6h',
      { every: 6 * 60 * 60 * 1000 },
      { name: 'kootenai-recorder-ingestion', data: { adapterName: 'kootenai_recorder' } satisfies IngestionJobData },
    );

    await queue.upsertJobScheduler(
      'sheriff-daily',
      { every: 24 * 60 * 60 * 1000 },
      { name: 'sheriff-sale-ingestion', data: { adapterName: 'sheriff_sale' } satisfies IngestionJobData },
    );
  } catch (err) {
    logger.warn({ err }, 'BullMQ scheduling failed — using setInterval fallback');
    scheduleWithSetInterval();
  }
}

/** Lazy connection getter for consumers that need raw Redis (e.g. worker). Throws when AUTO_PIPELINE_ENABLED=false. */
export function getRedisConnection(): IORedis {
  if (!env.AUTO_PIPELINE_ENABLED) {
    throw new Error(PIPELINE_DISABLED_MSG);
  }
  return _connection ?? (getConnection() as unknown as IORedis);
}
