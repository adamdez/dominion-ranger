import cron from 'node-cron';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { isPipelineEnabled, getPipelineToggles } from './pipeline-settings.js';
import { autoImportNewFiles } from './auto-import.js';
import { incrementalScore } from './incremental-scoring.js';
import { autoPromote } from './auto-promotion.js';
import { fullRescore } from './full-rescore.js';
import { runAdapterPipeline } from '../ingestion/pipeline.js';
import { initializeAdapters } from '../ingestion/adapters/registry.js';

const activeTasks: ReturnType<typeof cron.schedule>[] = [];
const runningJobs = new Set<string>();
let adaptersInitialized = false;

async function ensureAdapters(): Promise<void> {
  if (!adaptersInitialized) {
    initializeAdapters();
    adaptersInitialized = true;
  }
}

async function guardedRun(jobName: string, fn: () => Promise<unknown>): Promise<void> {
  if (runningJobs.has(jobName)) {
    logger.warn({ jobName }, 'Skipping — job already running');
    return;
  }

  if (!await isPipelineEnabled()) {
    logger.info({ jobName }, 'Pipeline automation disabled — skipping');
    return;
  }

  const toggles = await getPipelineToggles();
  const toggleMap: Record<string, boolean> = {
    import: toggles.autoImport,
    scoring: toggles.autoScoring,
    promotion: toggles.autoPromotion,
    rescore: toggles.nightlyRescore,
    recorders: toggles.autoImport,
    regrid: toggles.autoImport,
  };

  if (toggleMap[jobName] === false) {
    logger.info({ jobName }, 'Job toggle disabled — skipping');
    return;
  }

  runningJobs.add(jobName);
  try {
    logger.info({ jobName }, 'Pipeline job starting');
    await fn();
  } catch (err) {
    logger.error({ err, jobName }, 'Pipeline job failed');
  } finally {
    runningJobs.delete(jobName);
  }
}

async function runCountyRecorders(): Promise<void> {
  await ensureAdapters();

  const adapters = ['spokane_recorder', 'kootenai_recorder'];
  for (const name of adapters) {
    try {
      const stats = await runAdapterPipeline(name);
      logger.info({ adapter: name, ...stats }, 'County recorder pipeline completed');
    } catch (err) {
      logger.error({ err, adapter: name }, 'County recorder pipeline failed');
    }
  }
}

async function runRegridIngestion(): Promise<void> {
  await ensureAdapters();

  try {
    const stats = await runAdapterPipeline('regrid', { limit: 1000, maxRecords: 100000 });
    logger.info({ ...stats }, 'Regrid ingestion pipeline completed');
  } catch (err) {
    logger.error({ err }, 'Regrid ingestion pipeline failed');
  }
}

export function startScheduler(): void {
  if (!env.AUTO_PIPELINE_ENABLED || !env.INGESTION_SCHEDULER_ENABLED) {
    logger.info(
      { AUTO_PIPELINE_ENABLED: env.AUTO_PIPELINE_ENABLED, INGESTION_SCHEDULER_ENABLED: env.INGESTION_SCHEDULER_ENABLED },
      'Scheduler disabled',
    );
    return;
  }

  // Every 6 hours: check for new CSV files and auto-import
  activeTasks.push(
    cron.schedule('0 */6 * * *', () => {
      guardedRun('import', autoImportNewFiles);
    }),
  );

  // Every hour: score any unscored/stale properties
  activeTasks.push(
    cron.schedule('0 * * * *', () => {
      guardedRun('scoring', incrementalScore);
    }),
  );

  // Daily at 2 AM: full rescore of all properties
  activeTasks.push(
    cron.schedule('0 2 * * *', () => {
      guardedRun('rescore', fullRescore);
    }),
  );

  // Daily at 6 AM: run county recorder adapters for fresh pre-foreclosure signals
  activeTasks.push(
    cron.schedule('0 6 * * *', () => {
      guardedRun('recorders', runCountyRecorders);
    }),
  );

  // Weekly Sunday 3 AM: Regrid parcel data refresh
  activeTasks.push(
    cron.schedule('0 3 * * 0', () => {
      guardedRun('regrid', runRegridIngestion);
    }),
  );

  logger.info(
    { jobs: ['import@*/6h', 'scoring@hourly', 'rescore@2am', 'recorders@6am', 'regrid@sun3am'] },
    'Pipeline scheduler started',
  );
}

export function stopScheduler(): void {
  for (const task of activeTasks) {
    task.stop();
  }
  activeTasks.length = 0;
  logger.info('Pipeline scheduler stopped');
}

export { autoImportNewFiles, incrementalScore, autoPromote, fullRescore };
