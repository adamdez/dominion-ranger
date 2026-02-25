import cron from 'node-cron';
import { logger } from '../config/logger.js';
import { isPipelineEnabled, getPipelineToggles } from './pipeline-settings.js';
import { autoImportNewFiles } from './auto-import.js';
import { incrementalScore } from './incremental-scoring.js';
import { autoPromote } from './auto-promotion.js';
import { fullRescore } from './full-rescore.js';

const activeTasks: cron.ScheduledTask[] = [];
const runningJobs = new Set<string>();

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

export function startScheduler(): void {
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

  // Every hour (at :05): promote newly qualified leads
  activeTasks.push(
    cron.schedule('5 * * * *', () => {
      guardedRun('promotion', autoPromote);
    }),
  );

  // Daily at 2 AM: full rescore of all properties
  activeTasks.push(
    cron.schedule('0 2 * * *', () => {
      guardedRun('rescore', fullRescore);
    }),
  );

  logger.info(
    { jobs: ['import@*/6h', 'scoring@hourly', 'promotion@hourly:05', 'rescore@2am'] },
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
