import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  bigint,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { properties } from './properties';

export const compReports = pgTable(
  'comp_reports',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),

    dominionLeadId: uuid('dominion_lead_id')
      .notNull()
      .references(() => properties.dominionLeadId),

    subjectAddress: text('subject_address').notNull(),
    subjectCity: text('subject_city'),
    subjectState: text('subject_state'),
    subjectZip: text('subject_zip'),
    subjectBeds: integer('subject_beds'),
    subjectBaths: numeric('subject_baths', { precision: 3, scale: 1 }),
    subjectSqft: integer('subject_sqft'),
    subjectLotSqft: integer('subject_lot_sqft'),
    subjectYearBuilt: integer('subject_year_built'),
    subjectPropertyType: text('subject_property_type'),

    estimatedValueCents: bigint('estimated_value_cents', { mode: 'number' }),
    estimatedValueLowCents: bigint('estimated_value_low_cents', { mode: 'number' }),
    estimatedValueHighCents: bigint('estimated_value_high_cents', { mode: 'number' }),
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 2 }),

    comps: jsonb('comps').notNull().default([]),
    compCount: integer('comp_count').notNull().default(0),
    avgPricePerSqftCents: bigint('avg_price_per_sqft_cents', { mode: 'number' }),
    medianSalePriceCents: bigint('median_sale_price_cents', { mode: 'number' }),

    arvCents: bigint('arv_cents', { mode: 'number' }),
    maxOfferCents: bigint('max_offer_cents', { mode: 'number' }),
    rehabEstimateCents: bigint('rehab_estimate_cents', { mode: 'number' }).default(0),
    assignmentFeeCents: bigint('assignment_fee_cents', { mode: 'number' }).default(500000),

    searchRadiusMiles: numeric('search_radius_miles', { precision: 4, scale: 2 }).default('0.5'),
    searchMonths: integer('search_months').default(6),

    batchdataRequestId: text('batchdata_request_id'),
    rawResponse: jsonb('raw_response'),
    generatedBy: text('generated_by'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_comp_reports_dominion_lead_id').on(table.dominionLeadId),
    index('idx_comp_reports_created_at').on(table.createdAt),
  ],
);

export type CompReport = typeof compReports.$inferSelect;
export type NewCompReport = typeof compReports.$inferInsert;
