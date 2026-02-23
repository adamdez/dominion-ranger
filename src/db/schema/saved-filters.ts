import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';

/** Saved filter presets (smart lists) for the leads view. */
export const savedFilters = pgTable('saved_filters', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  description: varchar('description', { length: 512 }),
  filterConfig: jsonb('filter_config').notNull(),
  isDefault: boolean('is_default').default(false),
  createdBy: varchar('created_by', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type SavedFilter = typeof savedFilters.$inferSelect;
export type NewSavedFilter = typeof savedFilters.$inferInsert;
