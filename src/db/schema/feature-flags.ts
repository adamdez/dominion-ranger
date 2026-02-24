import { pgTable, varchar, boolean, text, timestamp } from 'drizzle-orm/pg-core';

export const featureFlags = pgTable('feature_flags', {
  flagKey: varchar('flag_key', { length: 128 }).primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type NewFeatureFlag = typeof featureFlags.$inferInsert;
