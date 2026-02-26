import { db } from '../../db/connection.js';
import { tasks } from '../../db/schema/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { logger } from '../../config/logger.js';
import { NURTURE_CADENCE_STEPS } from './nurture-cadence.js';

/**
 * Enroll a lead in the nurture cadence.
 * Called when a lead's funnelStage transitions to 'nurture'.
 *
 * Creates ALL cadence tasks upfront with future dueAt dates.
 * This way the task queue acts as the schedule — no separate
 * scheduler needed. Tasks appear in the user's task list as they
 * come due.
 */
export async function enrollInNurtureCadence(params: {
  leadInstanceId: string;
  dominionLeadId: string;
  assignedTo: string | null;
}): Promise<{ tasksCreated: number }> {

  const assignedTo = params.assignedTo ?? 'unassigned';

  // Cancel any existing nurture cadence tasks for this lead
  // (in case they were previously enrolled and re-enrolled)
  await db
    .update(tasks)
    .set({ status: 'CANCELLED', updatedAt: new Date() })
    .where(and(
      eq(tasks.leadInstanceId, params.leadInstanceId),
      eq(tasks.source, 'NURTURE_CADENCE'),
      eq(tasks.status, 'PENDING'),
    ));

  const now = Date.now();
  const taskValues = NURTURE_CADENCE_STEPS.map(step => ({
    leadInstanceId: params.leadInstanceId,
    dominionLeadId: params.dominionLeadId,
    assignedTo,
    taskType: step.taskType,
    title: step.title,
    description: step.description,
    dueAt: new Date(now + step.delayDays * 86_400_000),
    priority: step.priority,
    source: 'NURTURE_CADENCE',
    cadenceRule: 'NURTURE_12MO',
    attemptNumber: step.stepNumber,
  }));

  // Batch insert all 55 tasks
  await db.insert(tasks).values(taskValues);

  logger.info({
    leadInstanceId: params.leadInstanceId,
    tasksCreated: taskValues.length,
    firstDue: taskValues[0].dueAt.toISOString(),
    lastDue: taskValues[taskValues.length - 1].dueAt.toISOString(),
  }, 'Lead enrolled in nurture cadence');

  return { tasksCreated: taskValues.length };
}

/**
 * Unenroll a lead from the nurture cadence.
 * Called when a lead is reactivated (moved back to 'lead')
 * or moved to Dead.
 */
export async function unenrollFromNurtureCadence(
  leadInstanceId: string
): Promise<{ tasksCancelled: number }> {

  const result = await db
    .update(tasks)
    .set({ status: 'CANCELLED', updatedAt: new Date() })
    .where(and(
      eq(tasks.leadInstanceId, leadInstanceId),
      eq(tasks.source, 'NURTURE_CADENCE'),
      eq(tasks.status, 'PENDING'),
    ))
    .returning({ id: tasks.id });

  logger.info({
    leadInstanceId,
    tasksCancelled: result.length,
  }, 'Lead unenrolled from nurture cadence');

  return { tasksCancelled: result.length };
}

/**
 * Get nurture cadence progress for a lead.
 * Returns how many steps are completed, pending, channel breakdown, and the next due task.
 */
export async function getNurtureCadenceProgress(leadInstanceId: string) {
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where status = 'COMPLETED')::int`,
      pending: sql<number>`count(*) filter (where status = 'PENDING')::int`,
      cancelled: sql<number>`count(*) filter (where status = 'CANCELLED')::int`,
      nextDue: sql<string | null>`min(due_at) filter (where status = 'PENDING')`,
      mailCompleted: sql<number>`count(*) filter (where status = 'COMPLETED' and task_type = 'SEND_MAILER')::int`,
      emailCompleted: sql<number>`count(*) filter (where status = 'COMPLETED' and task_type = 'SEND_EMAIL')::int`,
      smsCompleted: sql<number>`count(*) filter (where status = 'COMPLETED' and task_type = 'SEND_SMS')::int`,
      callCompleted: sql<number>`count(*) filter (where status = 'COMPLETED' and task_type = 'NURTURE_CALL')::int`,
    })
    .from(tasks)
    .where(and(
      eq(tasks.leadInstanceId, leadInstanceId),
      eq(tasks.source, 'NURTURE_CADENCE'),
    ));

  const total = stats?.total ?? 0;
  const completed = stats?.completed ?? 0;

  return {
    totalSteps: total,
    completedSteps: completed,
    pendingSteps: stats?.pending ?? 0,
    cancelledSteps: stats?.cancelled ?? 0,
    nextDueDate: stats?.nextDue ?? null,
    percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
    channels: {
      mail: stats?.mailCompleted ?? 0,
      email: stats?.emailCompleted ?? 0,
      sms: stats?.smsCompleted ?? 0,
      call: stats?.callCompleted ?? 0,
    },
  };
}
