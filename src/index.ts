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

  // Step 2.5: Validate scoring config — auto-seed if missing
  const { validateScoringConfig } = await import('./modules/scoring/validate-config.js');
  const configCheck = await validateScoringConfig();

  if (!configCheck.valid) {
    logger.warn({ errors: configCheck.errors }, 'Scoring config invalid or missing — auto-seeding...');
    const { seedScoringConfig } = await import('./scripts/seed-scoring-config.js');
    await seedScoringConfig();

    const recheck = await validateScoringConfig();
    if (recheck.valid) {
      logger.info('Scoring configuration auto-seeded and validated');
    } else {
      logger.error({ errors: recheck.errors }, 'SCORING CONFIG STILL INVALID after auto-seed. Run: npx tsx src/scripts/recover-system.ts --seed-config');
      for (const err of recheck.errors) {
        logger.error(`  ${err}`);
      }
    }
  } else {
    logger.info('Scoring configuration validated');
  }

  if (configCheck.warnings.length > 0) {
    for (const warn of configCheck.warnings) {
      logger.warn(warn);
    }
  }

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
