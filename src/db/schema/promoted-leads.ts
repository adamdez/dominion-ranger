import {
  pgTable,
  uuid,
  numeric,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { marketingTierEnum, urgencyLevelEnum } from './enums';
import { properties } from './properties';

export const promotedLeads = pgTable(
  'promoted_leads',
  {
    promotionId: uuid('promotion_id').primaryKey().notNull(),

    dominionLeadId: uuid('dominion_lead_id')
      .notNull()
      .references(() => properties.dominionLeadId),

    // Score at time of promotion (snapshot)
    compositeScore: numeric('composite_score', { precision: 7, scale: 4 }).notNull(),
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 4 }).notNull(),
    scoreModelVersion: varchar('score_model_version', { length: 32 }).notNull(),

    // Tier and urgency
    marketingTier: marketingTierEnum('marketing_tier').notNull(),
    urgencyLevel: urgencyLevelEnum('urgency_level').notNull(),
    recommendedAction: text('recommended_action'),

    // Signal summary for downstream consumers
    signalSummary: jsonb('signal_summary'),

    // Timestamps
    promotedAt: timestamp('promoted_at', { withTimezone: true }).defaultNow().notNull(),
    exportedToSentinelAt: timestamp('exported_to_sentinel_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_promoted_leads_dominion_lead_id').on(table.dominionLeadId),
    index('idx_promoted_leads_promoted_at').on(table.promotedAt),
    index('idx_promoted_leads_tier').on(table.marketingTier),
    index('idx_promoted_leads_urgency').on(table.urgencyLevel),
  ],
);

export type PromotedLead = typeof promotedLeads.$inferSelect;
export type NewPromotedLead = typeof promotedLeads.$inferInsert;
