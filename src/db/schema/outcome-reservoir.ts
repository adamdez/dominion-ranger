import {
  pgTable,
  uuid,
  numeric,
  integer,
  bigint,
  text,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { outcomeStatusEnum } from './enums';
import { properties } from './properties';

export const outcomeReservoir = pgTable(
  'outcome_reservoir',
  {
    dominionLeadId: uuid('dominion_lead_id')
      .primaryKey()
      .references(() => properties.dominionLeadId),

    outcomeStatus: outcomeStatusEnum('outcome_status').notNull().default('PROMOTED'),

    contactedAt: timestamp('contacted_at', { withTimezone: true }),
    contractSignedAt: timestamp('contract_signed_at', { withTimezone: true }),
    dealClosedAt: timestamp('deal_closed_at', { withTimezone: true }),

    assignmentFee: numeric('assignment_fee', { precision: 12, scale: 2 }),
    buyerPriceCents: bigint('buyer_price_cents', { mode: 'number' }),
    daysToContract: integer('days_to_contract'),
    lostReason: text('lost_reason'),

    signalSnapshot: jsonb('signal_snapshot'),

    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_outcome_reservoir_status').on(table.outcomeStatus),
  ],
);

export type OutcomeReservoir = typeof outcomeReservoir.$inferSelect;
export type NewOutcomeReservoir = typeof outcomeReservoir.$inferInsert;
