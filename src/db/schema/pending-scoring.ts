import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { properties } from './properties';

/**
 * DB-backed fallback queue when Redis is unavailable.
 * Idempotent: unique on dominion_lead_id.
 */
export const pendingScoring = pgTable('pending_scoring', {
  dominionLeadId: uuid('dominion_lead_id')
    .primaryKey()
    .references(() => properties.dominionLeadId, { onDelete: 'cascade' }),
  reason: varchar('reason', { length: 32 }).notNull().default('event_ingested'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type PendingScoring = typeof pendingScoring.$inferSelect;
export type NewPendingScoring = typeof pendingScoring.$inferInsert;
