import {
  pgTable,
  varchar,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';

export const systemSettings = pgTable('system_settings', {
  key: varchar('key', { length: 128 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type NewSystemSetting = typeof systemSettings.$inferInsert;
