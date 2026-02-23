import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  date,
  text,
  jsonb,
  decimal,
  index,
} from 'drizzle-orm/pg-core';
import { leadInstances } from './lead-instances';
import { properties } from './properties';

/**
 * Closed-deal records for attribution, ROI, and model calibration.
 * Each row represents one completed (or fell-through) transaction.
 */
export const deals = pgTable(
  'deals',
  {
    dealId: uuid('deal_id').primaryKey().defaultRandom(),
    leadInstanceId: uuid('lead_instance_id')
      .notNull()
      .references(() => leadInstances.leadInstanceId),
    dominionLeadId: uuid('dominion_lead_id')
      .notNull()
      .references(() => properties.dominionLeadId),
    agentUserId: varchar('agent_user_id', { length: 128 }),
    propertyAddress: text('property_address'),
    purchasePriceCents: integer('purchase_price_cents'),
    assignmentFeeCents: integer('assignment_fee_cents').notNull(),
    grossRevenueCents: integer('gross_revenue_cents').notNull(),
    buyerPurchasePriceCents: integer('buyer_purchase_price_cents'),
    estimatedArvCents: integer('estimated_arv_cents'),
    buyerName: varchar('buyer_name', { length: 256 }),
    buyerCompany: varchar('buyer_company', { length: 256 }),
    leadSource: varchar('lead_source', { length: 64 }),
    leadSourceDetail: varchar('lead_source_detail', { length: 256 }),
    primaryDistressSignals: jsonb('primary_distress_signals'),
    compositeScoreAtClose: decimal('composite_score_at_close', { precision: 5, scale: 2 }),
    daysToClose: integer('days_to_close'),
    totalTouches: integer('total_touches'),
    contractDate: date('contract_date'),
    closeDate: date('close_date'),
    status: varchar('status', { length: 32 }).notNull().default('CLOSED'),
    fellThroughReason: text('fell_through_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_deals_lead_instance_id').on(table.leadInstanceId),
    index('idx_deals_dominion_lead_id').on(table.dominionLeadId),
    index('idx_deals_agent_user_id').on(table.agentUserId),
    index('idx_deals_status').on(table.status),
    index('idx_deals_close_date').on(table.closeDate),
  ],
);

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
