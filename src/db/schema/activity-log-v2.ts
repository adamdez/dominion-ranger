import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { properties } from './properties';
import { leadInstances } from './lead-instances';

export const activityTypeEnum = pgEnum('activity_type', [
  'CALL_PLACED', 'CALL_CONNECTED', 'TEXT_SENT', 'TEXT_REPLY',
  'EMAIL_SENT', 'EMAIL_REPLY', 'MAIL_SENT', 'MAIL_DELIVERED', 'MAIL_RETURNED',
  'RVM_DROPPED', 'INBOUND_FORM', 'INBOUND_CALL',
  'APPOINTMENT_SET', 'OFFER_SENT', 'CONTRACT_SENT', 'CONTRACT_SIGNED',
  'DEAL_CLOSED', 'STATUS_CHANGED', 'LEAD_ASSIGNED', 'LEAD_PROMOTED',
  'COMPLIANCE_CHECKED', 'DRIP_ENROLLED', 'DRIP_CANCELLED',
  'NOTE_ADDED', 'CALLBACK_SCHEDULED', 'CALLBACK_COMPLETED', 'CALLBACK_MISSED',
  'QR_SCANNED',
]);

export const activityChannelEnum = pgEnum('activity_channel', [
  'OUTBOUND_COLD', 'INBOUND_WEBSITE', 'INBOUND_CALL',
  'DRIP_SMS', 'DRIP_EMAIL', 'DRIP_RVM', 'DIRECT_MAIL',
  'MANUAL_EMAIL', 'MANUAL_SMS', 'GOOGLE_ADS', 'ORGANIC', 'REFERRAL',
]);

export const activityOutcomeEnum = pgEnum('activity_outcome', [
  'NO_ANSWER', 'VOICEMAIL', 'BUSY', 'DISCONNECTED', 'CONNECTED', 'WRONG_NUMBER',
  'WARM', 'FOLLOW_UP', 'OFFER_REQUESTED', 'APPT_SET',
  'NOT_INTERESTED', 'DO_NOT_CALL',
  'CONTRACTED', 'CLOSED', 'FELL_THROUGH', 'CANCELLED',
]);

/**
 * Append-only universal event substrate.
 * Every business action in Dominion gets logged here for analytics,
 * attribution, and audit replay.
 */
export const activityLog = pgTable(
  'activity_log',
  {
    activityId: uuid('activity_id').primaryKey().defaultRandom(),
    dominionLeadId: uuid('dominion_lead_id')
      .notNull()
      .references(() => properties.dominionLeadId),
    leadInstanceId: uuid('lead_instance_id')
      .references(() => leadInstances.leadInstanceId),
    userId: varchar('user_id', { length: 128 }),
    activityType: activityTypeEnum('activity_type').notNull(),
    channel: activityChannelEnum('channel').notNull(),
    outcome: activityOutcomeEnum('outcome'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    costCents: integer('cost_cents'),
    revenueCents: integer('revenue_cents'),
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_activity_log_dominion_lead_id').on(table.dominionLeadId),
    index('idx_activity_log_lead_instance_id').on(table.leadInstanceId),
    index('idx_activity_log_user_id').on(table.userId),
    index('idx_activity_log_activity_type').on(table.activityType),
    index('idx_activity_log_channel').on(table.channel),
    index('idx_activity_log_occurred_at').on(table.occurredAt),
    index('idx_activity_log_lead_type').on(table.dominionLeadId, table.activityType),
  ],
);

export type ActivityLog = typeof activityLog.$inferSelect;
export type NewActivityLog = typeof activityLog.$inferInsert;
