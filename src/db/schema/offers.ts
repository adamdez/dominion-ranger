import {
  pgTable,
  uuid,
  text,
  bigint,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { properties } from './properties';
import { leadInstances } from './lead-instances';
import { users } from './users';

export const offers = pgTable(
  'offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    dominionLeadId: uuid('dominion_lead_id')
      .notNull()
      .references(() => properties.dominionLeadId),
    propertyId: uuid('property_id').notNull(),
    leadInstanceId: uuid('lead_instance_id').references(
      () => leadInstances.leadInstanceId,
    ),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.userId),

    propertyAddress: text('property_address').notNull(),
    propertyCity: text('property_city'),
    propertyState: text('property_state'),
    propertyZip: text('property_zip'),
    propertyCounty: text('property_county'),
    ownerName: text('owner_name'),

    offerAmountCents: bigint('offer_amount_cents', { mode: 'number' }).notNull(),
    earnestMoneyCents: bigint('earnest_money_cents', { mode: 'number' })
      .notNull()
      .default(100000),
    closingDays: integer('closing_days').notNull().default(21),
    inspectionDays: integer('inspection_days').notNull().default(10),
    offerExpiryDays: integer('offer_expiry_days').notNull().default(7),
    contingencies: text('contingencies')
      .array()
      .default(['inspection', 'title', 'financing']),
    additionalTerms: text('additional_terms'),

    compReportId: uuid('comp_report_id'),
    arvCents: bigint('arv_cents', { mode: 'number' }),
    rehabEstimateCents: bigint('rehab_estimate_cents', { mode: 'number' }),
    maxOfferCents: bigint('max_offer_cents', { mode: 'number' }),
    assignmentFeeCents: bigint('assignment_fee_cents', { mode: 'number' }).default(
      1000000,
    ),

    status: text('status').notNull().default('draft'),

    counterAmountCents: bigint('counter_amount_cents', { mode: 'number' }),
    counterNotes: text('counter_notes'),

    sentAt: timestamp('sent_at', { withTimezone: true }),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    pdfUrl: text('pdf_url'),

    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_offers_property').on(table.propertyId),
    index('idx_offers_dominion_lead').on(table.dominionLeadId),
    index('idx_offers_status').on(table.status),
    index('idx_offers_created_by').on(table.createdBy),
    index('idx_offers_expires').on(table.expiresAt),
  ],
);

export type Offer = typeof offers.$inferSelect;
export type NewOffer = typeof offers.$inferInsert;
