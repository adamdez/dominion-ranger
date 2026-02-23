import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/** Admin-managed tag definitions with display color. */
export const tags = pgTable(
  'tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 64 }).notNull(),
    color: varchar('color', { length: 7 }).default('#6B7280'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('idx_tags_name').on(table.name)],
);

/** Many-to-many junction: tags applied to lead instances. */
export const leadInstanceTags = pgTable(
  'lead_instance_tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leadInstanceId: uuid('lead_instance_id').notNull(),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    appliedBy: varchar('applied_by', { length: 128 }),
    appliedAt: timestamp('applied_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_lead_tags_unique').on(table.leadInstanceId, table.tagId),
    index('idx_lead_tags_lead').on(table.leadInstanceId),
    index('idx_lead_tags_tag').on(table.tagId),
  ],
);

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type LeadInstanceTag = typeof leadInstanceTags.$inferSelect;
export type NewLeadInstanceTag = typeof leadInstanceTags.$inferInsert;
