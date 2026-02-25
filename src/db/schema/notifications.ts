import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';

export const notifications = pgTable(
  'notifications',
  {
    notificationId: uuid('notification_id').defaultRandom().primaryKey(),
    userId: varchar('user_id', { length: 128 }),
    title: varchar('title', { length: 256 }).notNull(),
    body: text('body'),
    type: varchar('type', { length: 64 }).notNull().default('INFO'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_notifications_user_id').on(table.userId),
    index('idx_notifications_created_at').on(table.createdAt),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
