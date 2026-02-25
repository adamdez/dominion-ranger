import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { properties } from './properties';
import { promotedLeads } from './promoted-leads';
import { users } from './users';
import { leadInstanceStatusEnum } from './enums';

/**
 * Charter: lead_instances = temporal acquisition lifecycle.
 *
 * Properties are permanent. Lead attempts are temporal.
 * Each lead_instance represents one acquisition attempt for a property.
 *
 * Enforces:
 *   - Assignment before dial
 *   - Optimistic locking (version column)
 *   - Transactional state transitions
 *   - Compliance gating before dial eligibility
 *   - One active instance per property (app-level enforcement)
 */
export const leadInstances = pgTable(
  'lead_instances',
  {
    leadInstanceId: uuid('lead_instance_id').primaryKey().notNull(),

    dominionLeadId: uuid('dominion_lead_id')
      .notNull()
      .references(() => properties.dominionLeadId),

    promotionId: uuid('promotion_id')
      .references(() => promotedLeads.promotionId),

    assignedTo: varchar('assigned_to', { length: 128 })
      .references(() => users.userId),

    status: leadInstanceStatusEnum('status').notNull().default('PROMOTED'),

    version: integer('version').notNull().default(1),

    complianceCleared: boolean('compliance_cleared').notNull().default(false),
    dncCheckedAt: timestamp('dnc_checked_at', { withTimezone: true }),
    litigantCheckedAt: timestamp('litigant_checked_at', { withTimezone: true }),

    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    dialedAt: timestamp('dialed_at', { withTimezone: true }),
    contactedAt: timestamp('contacted_at', { withTimezone: true }),
    offerSentAt: timestamp('offer_sent_at', { withTimezone: true }),
    contractedAt: timestamp('contracted_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),

    notes: text('notes'),

    dealStage: varchar('deal_stage', { length: 32 }).default('NEW_LEAD'),

    funnelStage: text('funnel_stage').notNull().default('prospect'),
    declinedCount: integer('declined_count').notNull().default(0),
    declinedAt: timestamp('declined_at', { withTimezone: true }),
    previousFunnelStage: text('previous_funnel_stage'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_lead_instances_dominion_lead_id').on(table.dominionLeadId),
    index('idx_lead_instances_assigned_to').on(table.assignedTo),
    index('idx_lead_instances_status').on(table.status),
    index('idx_lead_instances_created_at').on(table.createdAt),
    index('idx_lead_instances_deal_stage').on(table.dealStage),
    index('idx_lead_instances_funnel_stage').on(table.funnelStage),
  ],
);

export type LeadInstance = typeof leadInstances.$inferSelect;
export type NewLeadInstance = typeof leadInstances.$inferInsert;
