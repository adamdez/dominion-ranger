import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  numeric,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { mortgageStatusEnum } from './enums';

export const properties = pgTable(
  'properties',
  {
    // Charter-mandated: UUID v7, immutable, generated at first sighting
    dominionLeadId: uuid('dominion_lead_id').primaryKey().notNull(),

    // Internal reference UUID
    propertyId: uuid('property_id').notNull().unique(),

    // Identity fields — composite key for dedup
    apn: varchar('apn', { length: 64 }),
    county: varchar('county', { length: 128 }),
    state: varchar('state', { length: 2 }),

    // Address
    standardizedAddress: text('standardized_address'),
    streetAddress: varchar('street_address', { length: 256 }),
    city: varchar('city', { length: 128 }),
    zip: varchar('zip', { length: 10 }),

    // Owner
    ownerName: text('owner_name'),
    ownerFirst: varchar('owner_first', { length: 128 }),
    ownerLast: varchar('owner_last', { length: 128 }),

    // Contact (enriched via REISkip)
    phone: varchar('phone', { length: 20 }),
    email: varchar('email', { length: 256 }),
    mailingAddress: text('mailing_address'),

    // Property intelligence
    ownershipDurationMonths: integer('ownership_duration_months'),
    absenteeOwner: boolean('absentee_owner').default(false),
    equityEstimate: numeric('equity_estimate', { precision: 12, scale: 2 }),
    mortgageStatus: mortgageStatusEnum('mortgage_status').default('UNKNOWN'),

    // Metadata
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_properties_apn_county').on(table.apn, table.county),
    index('idx_properties_dominion_lead_id').on(table.dominionLeadId),
    index('idx_properties_state_county').on(table.state, table.county),
    index('idx_properties_owner_last').on(table.ownerLast),
    index('idx_properties_zip').on(table.zip),
  ],
);

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
