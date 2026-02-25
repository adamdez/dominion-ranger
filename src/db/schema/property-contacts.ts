import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  integer,
  text,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { properties } from './properties';

/**
 * One-to-many contacts per property.
 *
 * Skip trace returns multiple phone numbers / emails per property.
 * Each phone+contact combo is a separate row, enabling per-channel
 * DND tracking and source attribution.
 */
export const propertyContacts = pgTable(
  'property_contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    dominionLeadId: uuid('dominion_lead_id')
      .notNull()
      .references(() => properties.dominionLeadId, { onDelete: 'cascade' }),

    contactName: varchar('contact_name', { length: 256 }),
    contactType: varchar('contact_type', { length: 32 }).notNull().default('OWNER'),

    phone: varchar('phone', { length: 20 }),
    phoneType: varchar('phone_type', { length: 16 }),
    phoneStatus: varchar('phone_status', { length: 16 }).default('UNKNOWN'),

    email: varchar('email', { length: 256 }),

    dndCalls: boolean('dnd_calls').default(false),
    dndSms: boolean('dnd_sms').default(false),
    dndEmail: boolean('dnd_email').default(false),

    source: varchar('source', { length: 32 }),
    confidence: varchar('confidence', { length: 16 }).default('medium'),

    isPrimary: boolean('is_primary').default(false),
    isOwnerMatch: boolean('is_owner_match').default(false),

    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    lastAttemptedAt: timestamp('last_attempted_at', { withTimezone: true }),
    attemptCount: integer('attempt_count').default(0),
    notes: text('notes'),

    rawData: jsonb('raw_data'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_property_contacts_lead').on(table.dominionLeadId),
    index('idx_property_contacts_phone').on(table.phone),
  ],
);

export type PropertyContact = typeof propertyContacts.$inferSelect;
export type NewPropertyContact = typeof propertyContacts.$inferInsert;
