import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { adapterRunHistory } from '../db/schema/index.js';
import { generateId } from '../lib/index.js';
import type { PipelineStats } from './pipeline.js';

export async function withRunLogging(
  adapterName: string,
  marketId: string | null,
  fn: () => Promise<PipelineStats>,
): Promise<PipelineStats> {
  const runId = generateId();
  await db.insert(adapterRunHistory).values({
    runId,
    adapterName,
    marketId,
    status: 'running',
  });

  try {
    const stats = await fn();
    await db
      .update(adapterRunHistory)
      .set({
        status: stats.errors > 0 ? 'partial' : 'completed',
        recordsProcessed: stats.recordsProcessed,
        eventsCreated: stats.eventsIngested,
        eventsDeduplicated: stats.eventsDeduplicated,
        errors: stats.errors,
        completedAt: new Date(),
        durationMs: stats.durationMs,
      })
      .where(eq(adapterRunHistory.runId, runId));
    return stats;
  } catch (err) {
    await db
      .update(adapterRunHistory)
      .set({
        status: 'failed',
        errors: 1,
        completedAt: new Date(),
      })
      .where(eq(adapterRunHistory.runId, runId));
    throw err;
  }
}
