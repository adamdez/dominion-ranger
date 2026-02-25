import {
  pgTable,
  varchar,
  text,
  timestamp,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { userRoleEnum } from './enums';

export const users = pgTable(
  'users',
  {
    userId: varchar('user_id', { length: 128 }).primaryKey(),
    email: varchar('email', { length: 256 }).notNull().unique(),
    passwordHash: text('password_hash'),
    name: varchar('name', { length: 256 }),
    firstName: text('first_name'),
    lastName: text('last_name'),
    role: userRoleEnum('role').notNull().default('READONLY'),
    phone: varchar('phone', { length: 20 }),
    twilioCallerId: varchar('twilio_caller_id', { length: 20 }),
    avatarUrl: text('avatar_url'),
    active: boolean('active').default(true).notNull(),
    inviteToken: text('invite_token'),
    inviteTokenExpiresAt: timestamp('invite_token_expires_at', { withTimezone: true }),
    inviteAcceptedAt: timestamp('invite_accepted_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_users_email').on(table.email),
    index('idx_users_role').on(table.role),
    index('idx_users_invite_token').on(table.inviteToken),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
