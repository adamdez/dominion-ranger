import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { leadInstances } from './lead-instances';
import { users } from './users';
import { dispositionTypeEnum } from './enums';

/**
 * Charter: Dispositions log every call attempt and its outcome.
 * Append-only by convention (no business reason to edit past dispositions).
 */
export const dispositions = pgTable(
  'dispositions',
  {
    id: uuid('id').primaryKey().notNull(),

    leadInstanceId: uuid('lead_instance_id')
      .notNull()
      .references(() => leadInstances.leadInstanceId),

    disposition: dispositionTypeEnum('disposition').notNull(),

    notes: text('notes'),

    createdBy: varchar('created_by', { length: 128 })
      .references(() => users.userId),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_dispositions_lead_instance_id').on(table.leadInstanceId),
    index('idx_dispositions_created_at').on(table.createdAt),
  ],
);

export type Disposition = typeof dispositions.$inferSelect;
export type NewDisposition = typeof dispositions.$inferInsert;
