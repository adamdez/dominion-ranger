import 'dotenv/config';
import { logger } from './config/logger.js';
import { env } from './config/env.js';
import { checkDatabaseConnection, closeDatabase } from './db/connection.js';
import { startServer } from './api/server.js';
import { initializeAdapters } from './ingestion/adapters/registry.js';
import { scheduleIngestionJobs } from './jobs/queues.js';
import { wireEventHandlers } from './events/wiring.js';
import { startWorkers, stopWorkers } from './jobs/worker.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.js';

async function main(): Promise<void> {
  logger.info('╔══════════════════════════════════════════╗');
  logger.info('║   DOMINION RANGER — Intelligence Engine  ║');
  logger.info('║   Signal → Score → Rank → Promote        ║');
  logger.info('╚══════════════════════════════════════════╝');
  logger.info(`Pipeline enabled: ${env.AUTO_PIPELINE_ENABLED}`);
  logger.info(`Scheduler enabled: ${env.AUTO_PIPELINE_ENABLED && env.INGESTION_SCHEDULER_ENABLED}`);

  // Step 1: Verify database connection
  const dbOk = await checkDatabaseConnection();
  if (!dbOk) {
    logger.fatal('Database connection failed. Exiting.');
    process.exit(1);
  }
  logger.info('Database connected');

  // Step 2: Apply database invariants (append-only triggers)
  const { applyAppendOnlyInvariants } = await import('./db/invariants.js');
  await applyAppendOnlyInvariants();

  // Step 3: Initialize data source adapters
  initializeAdapters();

  // Step 4: Wire domain event handlers
  wireEventHandlers();

  // Step 5–7: Workers when auto-pipeline enabled; scheduler/repeatables only when both flags true
  if (env.AUTO_PIPELINE_ENABLED) {
    await startWorkers();

    if (env.INGESTION_SCHEDULER_ENABLED) {
      try {
        await scheduleIngestionJobs();
        startScheduler();
      } catch (err) {
        logger.warn({ err }, 'Could not schedule BullMQ jobs (Redis may be unavailable)');
      }
    }
  }

  // Step 8: Start API server
  const app = await startServer();

  // ─── Graceful Shutdown ─────────────────────────
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');

    if (env.AUTO_PIPELINE_ENABLED) {
      if (env.INGESTION_SCHEDULER_ENABLED) {
        stopScheduler();
      }
      await stopWorkers();
    }
    await app.close();
    await closeDatabase();

    logger.info('Dominion Ranger shut down cleanly');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Dominion Ranger startup failed');
  process.exit(1);
});
