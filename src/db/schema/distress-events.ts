import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { eventTypeEnum, eventLayerEnum, freshnessEnum } from './enums';
import { properties } from './properties';

export const distressEvents = pgTable(
  'distress_events',
  {
    eventId: uuid('event_id').primaryKey().notNull(),

    dominionLeadId: uuid('dominion_lead_id')
      .notNull()
      .references(() => properties.dominionLeadId),

    eventType: eventTypeEnum('event_type').notNull(),
    eventLayer: eventLayerEnum('event_layer').notNull(),

    // Dates from source
    triggerEventDate: timestamp('trigger_event_date', { withTimezone: true }),
    filingDate: timestamp('filing_date', { withTimezone: true }),
    recordedDate: timestamp('recorded_date', { withTimezone: true }),

    // Source provenance
    sourceName: varchar('source_name', { length: 128 }).notNull(),
    sourceUrl: text('source_url'),
    sourceLegitimacyNotes: text('source_legitimacy_notes'),

    // Quality signals
    freshnessCategory: freshnessEnum('freshness_category'),
    reliabilityScore: numeric('reliability_score', { precision: 3, scale: 2 }).notNull(),

    // Raw payload preserved for audit and future ML
    rawEventPayload: jsonb('raw_event_payload'),

    // Timestamps
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_distress_events_dominion_lead_id').on(table.dominionLeadId),
    index('idx_distress_events_type').on(table.eventType),
    index('idx_distress_events_layer').on(table.eventLayer),
    index('idx_distress_events_created_at').on(table.createdAt),
    index('idx_distress_events_lead_created').on(table.dominionLeadId, table.createdAt),
    index('idx_distress_events_type_layer').on(table.eventType, table.eventLayer),
  ],
);

export type DistressEvent = typeof distressEvents.$inferSelect;
export type NewDistressEvent = typeof distressEvents.$inferInsert;
