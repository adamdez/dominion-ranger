/**
 * Verification utility: List BullMQ repeatable jobs and queue counts.
 *
 * Usage: npx tsx src/scripts/list-redis-jobs.ts
 *
 * Requires REDIS_URL in env. Prints:
 * - Job schedulers (repeatables) per queue
 * - Waiting/delayed/active/completed/failed counts
 */
import 'dotenv/config';
import IORedis from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import { Queue } from 'bullmq';
import { env } from '../config/env.js';

async function listRedisJobs(): Promise<void> {
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const conn = connection as unknown as ConnectionOptions;

  const queueNames = ['ranger-ingestion', 'ranger-scoring', 'ranger-sentinel'];

  for (const name of queueNames) {
    const queue = new Queue(name, { connection: conn });

    try {
      const schedulers = await queue.getJobSchedulers(0, 999, true);

      console.log(`\n--- ${name} ---`);
      console.log('  Repeatable jobs (schedulers):', schedulers.length);
      for (const s of schedulers) {
        console.log(`    - ${s.key ?? s.id ?? s.name ?? String(s)}`);
      }

      await queue.close();
    } catch (err) {
      console.error(`Error listing ${name}:`, err);
    }
  }

  await connection.quit();
  console.log('\nDone.');
}

listRedisJobs().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
