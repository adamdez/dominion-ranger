import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  numeric,
  index,
} from 'drizzle-orm/pg-core';

export const inboundLeads = pgTable(
  'inbound_leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dominionLeadId: uuid('dominion_lead_id'),
    leadInstanceId: uuid('lead_instance_id'),

    submittedName: varchar('submitted_name', { length: 256 }),
    submittedPhone: varchar('submitted_phone', { length: 32 }),
    submittedEmail: varchar('submitted_email', { length: 256 }),
    submittedAddress: text('submitted_address'),
    submittedCity: varchar('submitted_city', { length: 128 }),
    submittedState: varchar('submitted_state', { length: 2 }),
    submittedZip: varchar('submitted_zip', { length: 10 }),
    submittedMessage: text('submitted_message'),

    source: varchar('source', { length: 64 }).notNull(),
    sourceDetail: varchar('source_detail', { length: 128 }),

    utmSource: varchar('utm_source', { length: 128 }),
    utmMedium: varchar('utm_medium', { length: 128 }),
    utmCampaign: varchar('utm_campaign', { length: 256 }),
    utmContent: varchar('utm_content', { length: 256 }),
    utmTerm: varchar('utm_term', { length: 256 }),

    matchedExisting: boolean('matched_existing').default(false),
    matchConfidence: numeric('match_confidence', { precision: 3, scale: 2 }),

    autoReplySent: boolean('auto_reply_sent').default(false),
    firstContactAt: timestamp('first_contact_at', { withTimezone: true }),
    timeToContactSeconds: integer('time_to_contact_seconds'),
    outcome: varchar('outcome', { length: 32 }),

    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_inbound_leads_dominion_lead_id').on(table.dominionLeadId),
    index('idx_inbound_leads_source').on(table.source),
    index('idx_inbound_leads_submitted_at').on(table.submittedAt),
  ],
);

export type InboundLead = typeof inboundLeads.$inferSelect;
export type NewInboundLead = typeof inboundLeads.$inferInsert;
