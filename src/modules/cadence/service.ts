import { db } from '../../db/connection.js';
import { tasks } from '../../db/schema/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { logger } from '../../config/logger.js';
import { DISPOSITION_CADENCE_MAP } from './rules.js';

export async function createFollowUpFromDisposition(params: {
  leadInstanceId: string;
  dominionLeadId: string;
  disposition: string;
  assignedTo: string;
  currentAttempt?: number;
}): Promise<void> {
  const cadence = DISPOSITION_CADENCE_MAP[params.disposition];
  if (!cadence) {
    logger.debug({ disposition: params.disposition }, 'No cadence rule for disposition');
    return;
  }

  const attempt = params.currentAttempt ?? 1;

  const nextStep = cadence.steps.find(s => s.attemptNumber > attempt);
  if (!nextStep) {
    logger.info({ disposition: params.disposition, attempt }, 'Cadence complete — no more steps');
    return;
  }

  const dueAt = new Date(Date.now() + nextStep.delayMinutes * 60_000);

  // Cancel existing pending callback tasks to avoid duplicates
  await db
    .update(tasks)
    .set({ status: 'CANCELLED', updatedAt: new Date() })
    .where(and(
      eq(tasks.leadInstanceId, params.leadInstanceId),
      eq(tasks.status, 'PENDING'),
      eq(tasks.source, 'CADENCE'),
    ));

  await db.insert(tasks).values({
    leadInstanceId: params.leadInstanceId,
    dominionLeadId: params.dominionLeadId,
    assignedTo: params.assignedTo,
    taskType: nextStep.taskType,
    title: nextStep.title,
    dueAt,
    priority: nextStep.priority,
    source: 'CADENCE',
    cadenceRule: cadence.name,
    attemptNumber: nextStep.attemptNumber,
  });

  logger.info({
    leadInstanceId: params.leadInstanceId,
    cadence: cadence.name,
    nextAttempt: nextStep.attemptNumber,
    dueAt: dueAt.toISOString(),
  }, 'Follow-up task created from cadence');
}

export async function getTaskStats(userId: string) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const [stats] = await db
    .select({
      overdue: sql<number>`count(*) filter (where status = 'PENDING' and due_at < ${now})`,
      todayPending: sql<number>`count(*) filter (where status = 'PENDING' and due_at >= ${todayStart} and due_at < ${todayEnd})`,
      totalPending: sql<number>`count(*) filter (where status = 'PENDING')`,
      completedToday: sql<number>`count(*) filter (where status = 'COMPLETED' and completed_at >= ${todayStart})`,
    })
    .from(tasks)
    .where(eq(tasks.assignedTo, userId));

  return stats;
}
