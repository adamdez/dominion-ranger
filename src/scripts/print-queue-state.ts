/**
 * Print BullMQ queue state: names, job counts, repeatable jobs.
 *
 * Connects directly to Redis (does not use queues module getters).
 * Safe to run regardless of AUTO_PIPELINE_ENABLED.
 *
 * Usage: npx tsx src/scripts/print-queue-state.ts
 */
import 'dotenv/config';
import IORedis from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import { QUEUE_NAMES } from '../jobs/queues.js';

const QUEUE_NAMES_LIST = [QUEUE_NAMES.ingestion, QUEUE_NAMES.scoring, QUEUE_NAMES.sentinel];

async function printQueueState(): Promise<void> {
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const conn = connection as unknown as ConnectionOptions;

  console.log('\n=== BullMQ Queue State ===\n');
  console.log('Queue names:', QUEUE_NAMES_LIST.join(', '));
  console.log('');

  for (const name of QUEUE_NAMES_LIST) {
    const queue = new Queue(name, { connection: conn });
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      console.log(`--- ${name} ---`);
      console.log(`  waiting:  ${waiting}`);
      console.log(`  active:   ${active}`);
      console.log(`  completed: ${completed}`);
      console.log(`  failed:  ${failed}`);
      console.log(`  delayed: ${delayed}`);

      const schedulers = await queue.getJobSchedulers(0, 100, true);
      if (schedulers.length > 0) {
        console.log('  repeatable jobs:');
        for (const s of schedulers) {
          const name = (s as { name?: string }).name ?? (s as { key?: string }).key ?? (s as { id?: string }).id ?? '?';
          const every = (s as { every?: string | number }).every;
          const pattern = (s as { pattern?: string }).pattern;
          const desc = every != null ? `every: ${every}` : pattern ?? '?';
          console.log(`    - ${name} (${desc})`);
        }
      } else {
        console.log('  repeatable jobs: (none)');
      }
      console.log('');

      await queue.close();
    } catch (err) {
      console.error(`Error reading ${name}:`, err);
    }
  }

  await connection.quit();
  console.log('Done.\n');
}

printQueueState().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
