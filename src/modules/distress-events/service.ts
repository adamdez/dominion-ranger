import { eq, sql, and, gte } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { distressEvents } from '../../db/schema/index.js';
import type { DistressEvent, NewDistressEvent } from '../../db/schema/index.js';
import { generateId, daysBetween, classifyFreshness } from '../../lib/index.js';
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
 * Automatically:
 * - Generates UUID v7 event_id
 * - Classifies freshness based on trigger date
 * - Emits domain event for downstream scoring
 */
export async function ingestDistressEvent(input: DistressEventInput): Promise<DistressEvent> {
  const eventId = generateId();

  // Determine freshness from trigger date
  const referenceDate = input.triggerEventDate ?? input.filingDate ?? input.recordedDate;
  const daysSince = referenceDate ? daysBetween(referenceDate) : 0;
  const freshness = classifyFreshness(daysSince);

  // Clamp reliability score
  const reliability = Math.max(0, Math.min(1, input.reliabilityScore));

  const newEvent: NewDistressEvent = {
    eventId,
    dominionLeadId: input.dominionLeadId,
    eventType: input.eventType,
    eventLayer: input.eventLayer,
    triggerEventDate: input.triggerEventDate ?? null,
    filingDate: input.filingDate ?? null,
    recordedDate: input.recordedDate ?? null,
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl ?? null,
    sourceLegitimacyNotes: input.sourceLegitimacyNotes ?? null,
    freshnessCategory: freshness,
    reliabilityScore: reliability.toFixed(2),
    rawEventPayload: input.rawEventPayload ?? null,
  };

  const [event] = await db.insert(distressEvents).values(newEvent).returning();

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

/**
 * Check for duplicate event (same type, same source, same trigger date).
 * Prevents re-ingesting the same filing from the same source.
 */
export async function isDuplicateEvent(
  dominionLeadId: string,
  eventType: string,
  sourceName: string,
  triggerDate: Date | null,
): Promise<boolean> {
  const conditions = [
    eq(distressEvents.dominionLeadId, dominionLeadId),
    eq(distressEvents.eventType, eventType as DistressEvent['eventType']),
    eq(distressEvents.sourceName, sourceName),
  ];

  if (triggerDate) {
    // Match within same day
    const dayStart = new Date(triggerDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(triggerDate);
    dayEnd.setHours(23, 59, 59, 999);

    conditions.push(
      gte(distressEvents.triggerEventDate, dayStart),
      sql`${distressEvents.triggerEventDate} <= ${dayEnd}`,
    );
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(distressEvents)
    .where(and(...conditions));

  return result.count > 0;
}
