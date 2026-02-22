import 'dotenv/config';
import { logger } from './config/logger.js';
import { checkDatabaseConnection, closeDatabase } from './db/connection.js';
import { startServer } from './api/server.js';
import { initializeAdapters } from './ingestion/adapters/registry.js';
import { scheduleIngestionJobs } from './jobs/queues.js';
import { wireEventHandlers } from './events/wiring.js';
import { startWorkers } from './jobs/worker.js';

async function main(): Promise<void> {
  logger.info('╔══════════════════════════════════════════╗');
  logger.info('║   DOMINION RANGER — Intelligence Engine  ║');
  logger.info('║   Signal → Score → Rank → Promote        ║');
  logger.info('╚══════════════════════════════════════════╝');

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

  // Step 5: Start BullMQ workers
  await startWorkers();

  // Step 6: Schedule recurring jobs
  try {
    await scheduleIngestionJobs();
    logger.info('Ingestion jobs scheduled');
  } catch (err) {
    // Redis may not be available in all environments
    logger.warn({ err }, 'Could not schedule BullMQ jobs (Redis may be unavailable)');
  }

  // Step 7: Start API server
  const app = await startServer();

  // ─── Graceful Shutdown ─────────────────────────
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');

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
