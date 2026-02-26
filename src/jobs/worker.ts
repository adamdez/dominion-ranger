import { Worker, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { runAdapterPipeline, runFullIngestion } from '../ingestion/pipeline.js';
import { scoreProperty } from '../modules/scoring/service.js';
import { dispatchToSentinel } from '../modules/sentinel/service.js';
import { getPropertyById } from '../modules/properties/service.js';
import type { IngestionJobData, ScoringJobData, SentinelDispatchJobData } from './queues.js';
import { initializeAdapters } from '../ingestion/adapters/registry.js';
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { promotedLeads } from '../db/schema/index.js';

let redisInstance: IORedis | null = null;
let ingestionWorker: Worker<IngestionJobData> | null = null;
let scoringWorker: Worker<ScoringJobData> | null = null;
let sentinelWorker: Worker<SentinelDispatchJobData> | null = null;

function getConnection(): ConnectionOptions {
  if (!redisInstance) {
    redisInstance = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return redisInstance as unknown as ConnectionOptions;
}

function createWorkers(): void {
  if (ingestionWorker) return; // Already created
  const connection = getConnection();

  // ─── Ingestion Worker ──────────────────────────────
  ingestionWorker = new Worker<IngestionJobData>(
  'ranger-ingestion',
  async (job) => {
    logger.info({ jobId: job.id, adapter: job.data.adapterName }, 'Ingestion job started');

    if (job.data.adapterName === '__all__') {
      const results = await runFullIngestion(job.data.options);
      return { results };
    }

    const stats = await runAdapterPipeline(job.data.adapterName, job.data.options);
    return { stats };
  },
  {
    connection,
    concurrency: 1, // One ingestion at a time to avoid race conditions on identity resolution
  },
  );

  // ─── Scoring Worker ────────────────────────────────
  scoringWorker = new Worker<ScoringJobData>(
  'ranger-scoring',
  async (job) => {
    const { dominionLeadId, reason } = job.data;
    logger.info({ jobId: job.id, dominionLeadId, reason }, 'Scoring job started');

    const result = await scoreProperty(dominionLeadId);

    return {
      dominionLeadId,
      compositeScore: result.compositeScore,
      promoted: false,
    };
  },
  {
    connection,
    concurrency: 10, // Scoring is CPU-light, DB-read-heavy — can parallelize
  },
  );

  // ─── Sentinel Dispatch Worker ──────────────────────
  sentinelWorker = new Worker<SentinelDispatchJobData>(
  'ranger-sentinel',
  async (job) => {
    const { promotionId, dominionLeadId } = job.data;
    logger.info({ jobId: job.id, promotionId, dominionLeadId }, 'Sentinel dispatch job started');

    const property = await getPropertyById(dominionLeadId);

    const [promotion] = await db
      .select()
      .from(promotedLeads)
      .where(eq(promotedLeads.promotionId, promotionId))
      .limit(1);

    if (!promotion) {
      throw new Error(`Promotion not found: ${promotionId}`);
    }

    const dispatched = await dispatchToSentinel(promotion, property);
    if (!dispatched) {
      throw new Error('Sentinel dispatch failed — will retry');
    }

    return { dispatched: true };
  },
  {
    connection,
    concurrency: 5,
  },
  );

  // ─── Error Handlers ────────────────────────────────
  for (const [name, w] of [
    ['ingestion', ingestionWorker],
    ['scoring', scoringWorker],
    ['sentinel', sentinelWorker],
  ] as const) {
    (w as Worker).on('failed', (job, err) => {
      logger.error({ jobId: job?.id, worker: name, err: err.message }, 'Job failed');
    });
    (w as Worker).on('completed', (job) => {
      logger.debug({ jobId: job.id, worker: name }, 'Job completed');
    });
  }
}

/**
 * Start all workers. Call from main entrypoint or standalone worker process.
 * Workers are created lazily — only when AUTO_PIPELINE_ENABLED=true.
 */
export async function startWorkers(): Promise<void> {
  if (!env.AUTO_PIPELINE_ENABLED) {
    logger.info('Workers disabled (AUTO_PIPELINE_ENABLED=false)');
    return;
  }
  createWorkers();
  initializeAdapters();
  logger.info('All BullMQ workers started');
}

/**
 * Graceful shutdown.
 */
export async function stopWorkers(): Promise<void> {
  if (!ingestionWorker && !scoringWorker && !sentinelWorker) {
    return;
  }
  await Promise.all([
    ingestionWorker?.close(),
    scoringWorker?.close(),
    sentinelWorker?.close(),
  ]);
  ingestionWorker = null;
  scoringWorker = null;
  sentinelWorker = null;
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }
  logger.info('All BullMQ workers stopped');
}
