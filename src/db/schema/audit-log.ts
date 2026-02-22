import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const auditLog = pgTable(
  'audit_log',
  {
    logId: uuid('log_id').primaryKey().notNull(),

    // Nullable — some audit entries are system-level, not property-level
    dominionLeadId: uuid('dominion_lead_id'),

    userId: varchar('user_id', { length: 128 }),
    actionType: varchar('action_type', { length: 64 }).notNull(),
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_audit_log_dominion_lead_id').on(table.dominionLeadId),
    index('idx_audit_log_action_type').on(table.actionType),
    index('idx_audit_log_created_at').on(table.createdAt),
    index('idx_audit_log_user_id').on(table.userId),
  ],
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
