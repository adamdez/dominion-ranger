import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { marketConfigs } from './market-configs';

export const adapterRunHistory = pgTable(
  'adapter_run_history',
  {
    runId: uuid('run_id').primaryKey().defaultRandom(),
    adapterName: varchar('adapter_name', { length: 64 }).notNull(),
    marketId: uuid('market_id').references(() => marketConfigs.marketId),
    status: varchar('status', { length: 20 }).notNull().default('running'),
    recordsProcessed: integer('records_processed').default(0),
    eventsCreated: integer('events_created').default(0),
    eventsDeduplicated: integer('events_deduplicated').default(0),
    errors: integer('errors').default(0),
    errorDetails: jsonb('error_details'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
  },
  (table) => [
    index('idx_adapter_run_adapter').on(table.adapterName),
    index('idx_adapter_run_started').on(table.startedAt),
  ],
);

export type AdapterRunHistory = typeof adapterRunHistory.$inferSelect;
export type NewAdapterRunHistory = typeof adapterRunHistory.$inferInsert;
