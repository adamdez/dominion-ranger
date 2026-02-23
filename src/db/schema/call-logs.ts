import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  text,
  index,
} from 'drizzle-orm/pg-core';

export const callLogs = pgTable(
  'call_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    callSid: varchar('call_sid', { length: 64 }).unique(),

    dominionLeadId: uuid('dominion_lead_id').notNull(),
    leadInstanceId: uuid('lead_instance_id'),
    userId: varchar('user_id', { length: 128 }).notNull(),

    direction: varchar('direction', { length: 16 }).notNull().default('OUTBOUND'),
    toPhone: varchar('to_phone', { length: 20 }).notNull(),
    fromPhone: varchar('from_phone', { length: 20 }).notNull(),

    status: varchar('status', { length: 24 }).notNull().default('initiated'),
    durationSeconds: integer('duration_seconds'),
    recordingUrl: text('recording_url'),
    recordingSid: varchar('recording_sid', { length: 64 }),

    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_call_logs_lead').on(table.dominionLeadId),
    index('idx_call_logs_user').on(table.userId),
    index('idx_call_logs_sid').on(table.callSid),
    index('idx_call_logs_started').on(table.startedAt),
  ],
);

export type CallLog = typeof callLogs.$inferSelect;
export type NewCallLog = typeof callLogs.$inferInsert;
