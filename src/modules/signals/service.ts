import { eq, sql, and, gte } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { signalAccumulation, distressEvents } from '../../db/schema/index.js';
import type { SignalAccumulation } from '../../db/schema/index.js';
import { logger } from '../../config/logger.js';

/**
 * Recalculate signal accumulation metrics for a property.
 *
 * Called after every distress event ingestion.
 * Updates rolling counts, acceleration rate, and density score.
 */
export async function recalculateSignalAccumulation(dominionLeadId: string): Promise<SignalAccumulation> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Count signals in windows
  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      last7d: sql<number>`count(*) filter (where ${distressEvents.createdAt} >= ${sevenDaysAgo})::int`,
      last30d: sql<number>`count(*) filter (where ${distressEvents.createdAt} >= ${thirtyDaysAgo})::int`,
    })
    .from(distressEvents)
    .where(eq(distressEvents.dominionLeadId, dominionLeadId));

  // Get first signal date
  const [firstSignal] = await db
    .select({ minDate: sql<Date>`min(${distressEvents.createdAt})` })
    .from(distressEvents)
    .where(eq(distressEvents.dominionLeadId, dominionLeadId));

  const firstSignalDate = firstSignal?.minDate ?? now;

  // Acceleration: ratio of 7d signals to 30d signals
  // High ratio = signals are accelerating recently
  const acceleration = counts.last30d > 0
    ? (counts.last7d / counts.last30d) * (30 / 7) // Normalized: 1.0 = uniform, >1.0 = accelerating
    : counts.last7d > 0 ? 2.0 : 0;

  // Density: signals per 30-day period, weighted by diversity
  const uniqueTypes = await db
    .select({ count: sql<number>`count(distinct ${distressEvents.eventType})::int` })
    .from(distressEvents)
    .where(
      and(
        eq(distressEvents.dominionLeadId, dominionLeadId),
        gte(distressEvents.createdAt, thirtyDaysAgo),
      ),
    );

  const typeCount = uniqueTypes[0]?.count ?? 0;
  // Density = count × diversity bonus (multiple signal types = stronger signal)
  const density = counts.last30d * (1 + (typeCount - 1) * 0.15);

  // Upsert
  const result = await db
    .insert(signalAccumulation)
    .values({
      dominionLeadId,
      firstSignalDetectedAt: firstSignalDate,
      signalCount7d: counts.last7d,
      signalCount30d: counts.last30d,
      totalSignalCount: counts.total,
      signalAccelerationRate: acceleration.toFixed(4),
      signalDensityScore: density.toFixed(4),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: signalAccumulation.dominionLeadId,
      set: {
        signalCount7d: counts.last7d,
        signalCount30d: counts.last30d,
        totalSignalCount: counts.total,
        signalAccelerationRate: acceleration.toFixed(4),
        signalDensityScore: density.toFixed(4),
        updatedAt: now,
      },
    })
    .returning();

  logger.debug(
    { dominionLeadId, total: counts.total, acceleration: acceleration.toFixed(2), density: density.toFixed(2) },
    'Signal accumulation updated',
  );

  return result[0];
}

export async function getSignalAccumulation(dominionLeadId: string): Promise<SignalAccumulation | null> {
  const [record] = await db
    .select()
    .from(signalAccumulation)
    .where(eq(signalAccumulation.dominionLeadId, dominionLeadId));
  return record ?? null;
}
