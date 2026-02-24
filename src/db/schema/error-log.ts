import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const errorLog = pgTable(
  'error_log',
  {
    errorId: uuid('error_id').defaultRandom().primaryKey(),
    errorType: varchar('error_type', { length: 64 }).notNull(),
    message: text('message').notNull(),
    stack: text('stack'),
    context: jsonb('context').default({}),
    resolved: boolean('resolved').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_error_log_type').on(table.errorType),
    index('idx_error_log_created').on(table.createdAt),
  ],
);

export type ErrorLogEntry = typeof errorLog.$inferSelect;
export type NewErrorLogEntry = typeof errorLog.$inferInsert;
