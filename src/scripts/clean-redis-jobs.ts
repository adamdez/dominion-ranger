/**
 * One-time cleanup: Remove stale BullMQ repeatable/scheduled jobs from Redis.
 *
 * Run after deploying the lazy-init queues fix to clear jobs that were
 * registered by previous server starts when AUTO_PIPELINE_ENABLED was true.
 *
 * Usage: npx tsx src/scripts/clean-redis-jobs.ts
 */
import 'dotenv/config';
import IORedis from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import { Queue } from 'bullmq';
import { env } from '../config/env.js';

async function cleanRedisJobs(): Promise<void> {
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const conn = connection as unknown as ConnectionOptions;

  const queueNames = ['ranger-ingestion', 'ranger-scoring', 'ranger-sentinel'];

  for (const name of queueNames) {
    const queue = new Queue(name, { connection: conn });

    try {
      // Remove all job schedulers (repeatable jobs)
      const schedulers = await queue.getJobSchedulers(0, 999, true);
      for (const s of schedulers) {
        // BullMQ removeJobScheduler expects the scheduler key (from getJobSchedulers)
        const schedulerKey = s.key ?? s.id ?? s.name ?? String(s);
        const removed = await queue.removeJobScheduler(schedulerKey);
        if (removed) {
          console.log(`Removed scheduler: ${name}/${schedulerKey}`);
        }
      }

      // Drain waiting/delayed jobs
      await queue.drain(true);
      console.log(`Drained queue: ${name}`);

      // Clean completed/failed
      await queue.clean(0, 1000, 'completed');
      await queue.clean(0, 1000, 'failed');
      console.log(`Cleaned queue: ${name}`);

      await queue.close();
    } catch (err) {
      console.error(`Error cleaning ${name}:`, err);
    }
  }

  await connection.quit();
  console.log('Done — all stale BullMQ jobs removed');
}

cleanRedisJobs().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
