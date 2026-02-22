import { eq, sql, and, gte } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { distressEvents } from '../../db/schema/index.js';
import type { DistressEvent, NewDistressEvent } from '../../db/schema/index.js';
import { generateId, daysBetween, classifyFreshness } from '../../lib/index.js';
import { generateEventFingerprint } from '../../lib/fingerprint.js';
import { domainEvents } from '../../events/bus.js';
import { logger } from '../../config/logger.js';

export interface DistressEventInput {
  dominionLeadId: string;
  eventType: DistressEvent['eventType'];
  eventLayer: DistressEvent['eventLayer'];
  triggerEventDate?: Date | null;
  filingDate?: Date | null;
  recordedDate?: Date | null;
  sourceName: string;
  sourceUrl?: string | null;
  sourceLegitimacyNotes?: string | null;
  reliabilityScore: number;
  rawEventPayload?: Record<string, unknown> | null;
}

/**
 * Ingest a distress event. Append-only — never updates or deletes.
 *
 * Uses fingerprint-based atomic dedup:
 *   INSERT ... ON CONFLICT (fingerprint) DO NOTHING
 *
 * Returns null when the event is a duplicate (fingerprint collision).
 */
export async function ingestDistressEvent(input: DistressEventInput): Promise<DistressEvent | null> {
  const eventId = generateId();

  const referenceDate = input.triggerEventDate ?? input.filingDate ?? input.recordedDate;
  const daysSince = referenceDate ? daysBetween(referenceDate) : 0;
  const freshness = classifyFreshness(daysSince);
  const reliability = Math.max(0, Math.min(1, input.reliabilityScore));
  const fingerprint = generateEventFingerprint(input);

  const newEvent: NewDistressEvent = {
    eventId,
    dominionLeadId: input.dominionLeadId,
    eventType: input.eventType,
    eventLayer: input.eventLayer,
    triggerEventDate: input.triggerEventDate ?? null,
    filingDate: input.filingDate ?? null,
    recordedDate: input.recordedDate ?? null,
    sourceName: input.sourceName,
    fingerprint,
    sourceUrl: input.sourceUrl ?? null,
    sourceLegitimacyNotes: input.sourceLegitimacyNotes ?? null,
    freshnessCategory: freshness,
    reliabilityScore: reliability.toFixed(2),
    rawEventPayload: input.rawEventPayload ?? null,
  };

  const result = await db
    .insert(distressEvents)
    .values(newEvent)
    .onConflictDoNothing({ target: distressEvents.fingerprint })
    .returning();

  if (result.length === 0) {
    logger.debug({ fingerprint, eventType: input.eventType }, 'Duplicate event skipped (fingerprint match)');
    return null;
  }

  const event = result[0];

  logger.info(
    { eventId, dominionLeadId: input.dominionLeadId, eventType: input.eventType, eventLayer: input.eventLayer },
    'Distress event ingested',
  );

  domainEvents.emit('distress_event.ingested', {
    eventId,
    dominionLeadId: input.dominionLeadId,
    eventType: input.eventType,
    eventLayer: input.eventLayer,
  });

  return event;
}

/**
 * Get all distress events for a property, ordered by creation date descending.
 */
export async function getEventsByProperty(dominionLeadId: string): Promise<DistressEvent[]> {
  return db
    .select()
    .from(distressEvents)
    .where(eq(distressEvents.dominionLeadId, dominionLeadId))
    .orderBy(sql`${distressEvents.createdAt} DESC`);
}

/**
 * Get events for a property within a date range (for scoring window).
 */
export async function getRecentEvents(
  dominionLeadId: string,
  sinceDaysAgo: number = 365,
): Promise<DistressEvent[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - sinceDaysAgo);

  return db
    .select()
    .from(distressEvents)
    .where(
      and(
        eq(distressEvents.dominionLeadId, dominionLeadId),
        gte(distressEvents.createdAt, cutoff),
      ),
    )
    .orderBy(sql`${distressEvents.createdAt} DESC`);
}

/**
 * Count events by type for a property (used in signal accumulation).
 */
export async function countEventsByType(
  dominionLeadId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      eventType: distressEvents.eventType,
      count: sql<number>`count(*)::int`,
    })
    .from(distressEvents)
    .where(eq(distressEvents.dominionLeadId, dominionLeadId))
    .groupBy(distressEvents.eventType);

  return Object.fromEntries(rows.map((r) => [r.eventType, r.count]));
}
