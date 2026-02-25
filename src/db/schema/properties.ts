import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  numeric,
  integer,
  timestamp,
  jsonb,
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

    // Contact (enriched via skip trace)
    phone: varchar('phone', { length: 20 }),
    phoneType: varchar('phone_type', { length: 16 }),
    phone2: varchar('phone_2', { length: 20 }),
    phone2Type: varchar('phone_2_type', { length: 16 }),
    phone3: varchar('phone_3', { length: 20 }),
    phone3Type: varchar('phone_3_type', { length: 16 }),
    email: varchar('email', { length: 256 }),
    email2: varchar('email_2', { length: 256 }),
    mailingAddress: text('mailing_address'),

    // Skip trace metadata
    skipTraceTier: varchar('skip_trace_tier', { length: 16 }),
    skipTracedAt: timestamp('skip_traced_at', { withTimezone: true }),
    skipTraceSource: varchar('skip_trace_source', { length: 32 }),
    skipTraceRaw: jsonb('skip_trace_raw'),

    // Compliance flags (Charter Section VIII — agent-set, skip-trace derived)
    dncFlag: boolean('dnc_flag').default(false),
    litigantFlag: boolean('litigant_flag').default(false),
    optOutFlag: boolean('opt_out_flag').default(false),

    // Property intelligence
    ownershipDurationMonths: integer('ownership_duration_months'),
    absenteeOwner: boolean('absentee_owner').default(false),
    equityEstimate: numeric('equity_estimate', { precision: 12, scale: 2 }),
    mortgageStatus: mortgageStatusEnum('mortgage_status').default('UNKNOWN'),

    // Regrid parcel enrichment
    zoning: text('zoning'),
    landUse: text('land_use'),
    legalDescription: text('legal_description'),
    acreage: numeric('acreage', { precision: 10, scale: 4 }),
    regridData: jsonb('regrid_data'),
    regridEnrichedAt: timestamp('regrid_enriched_at', { withTimezone: true }),

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
