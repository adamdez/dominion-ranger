import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const smsLogs = pgTable(
  'sms_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageSid: varchar('message_sid', { length: 64 }).unique(),

    dominionLeadId: uuid('dominion_lead_id'),
    leadInstanceId: uuid('lead_instance_id'),
    userId: varchar('user_id', { length: 128 }),

    direction: varchar('direction', { length: 16 }).notNull().default('OUTBOUND'),
    toPhone: varchar('to_phone', { length: 20 }).notNull(),
    fromPhone: varchar('from_phone', { length: 20 }).notNull(),
    body: text('body').notNull(),

    status: varchar('status', { length: 24 }).default('queued'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_sms_logs_lead').on(table.dominionLeadId),
    index('idx_sms_logs_sid').on(table.messageSid),
  ],
);

export type SmsLog = typeof smsLogs.$inferSelect;
export type NewSmsLog = typeof smsLogs.$inferInsert;
