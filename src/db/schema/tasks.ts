import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const taskStatusEnum = pgEnum('task_status', [
  'PENDING',
  'COMPLETED',
  'CANCELLED',
]);

export const taskTypeEnum = pgEnum('task_type', [
  'CALLBACK',
  'FOLLOW_UP',
  'RESEARCH',
  'SEND_OFFER',
  'SITE_VISIT',
  'GENERAL',
  'SEND_MAILER',
  'SEND_EMAIL',
  'SEND_SMS',
  'NURTURE_CALL',
]);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    title: varchar('title', { length: 256 }).notNull(),
    description: text('description'),
    taskType: taskTypeEnum('task_type').default('GENERAL').notNull(),
    status: taskStatusEnum('status').default('PENDING').notNull(),

    leadInstanceId: uuid('lead_instance_id'),
    dominionLeadId: uuid('dominion_lead_id'),

    assignedTo: varchar('assigned_to', { length: 128 }),
    createdBy: varchar('created_by', { length: 128 }),

    priority: varchar('priority', { length: 10 }).notNull().default('NORMAL'),
    source: varchar('source', { length: 64 }).notNull().default('MANUAL'),
    cadenceRule: varchar('cadence_rule', { length: 64 }),
    attemptNumber: integer('attempt_number').default(1),

    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_tasks_lead').on(table.leadInstanceId),
    index('idx_tasks_assigned').on(table.assignedTo),
    index('idx_tasks_due').on(table.dueAt),
    index('idx_tasks_status').on(table.status),
  ],
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
