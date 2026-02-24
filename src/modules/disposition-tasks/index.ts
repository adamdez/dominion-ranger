/**
 * Phase 3.6: Auto-create tasks from dispositions per UX spec.
 * Replaces cadence for simpler single-task-per-disposition mapping.
 */
import { db } from '../../db/connection.js';
import { tasks } from '../../db/schema/index.js';
import { logger } from '../../config/logger.js';

const DISPOSITION_TASK_MAP: Record<
  string,
  { title: string; taskType: string; daysOffset: number; useCallbackDate?: boolean }
> = {
  NO_ANSWER: { title: 'Follow-up call', taskType: 'FOLLOW_UP', daysOffset: 2 },
  LEFT_VOICEMAIL: { title: 'Follow-up call', taskType: 'FOLLOW_UP', daysOffset: 3 },
  CALLBACK_REQUESTED: { title: 'Callback', taskType: 'CALLBACK', daysOffset: 0, useCallbackDate: true },
  INTERESTED: { title: 'Send offer / comps', taskType: 'SEND_OFFER', daysOffset: 1, useCallbackDate: true },
  WRONG_NUMBER: { title: 'Re-skip trace', taskType: 'GENERAL', daysOffset: 1 },
  DISCONNECTED: { title: 'Re-skip trace', taskType: 'GENERAL', daysOffset: 1 },
};

export async function createTaskFromDisposition(params: {
  leadInstanceId: string;
  dominionLeadId: string;
  disposition: string;
  assignedTo: string;
  callbackDate?: string;
}): Promise<void> {
  const rule = DISPOSITION_TASK_MAP[params.disposition];
  if (!rule) {
    logger.debug({ disposition: params.disposition }, 'No auto-task for disposition');
    return;
  }

  let dueAt: Date;
  if (rule.useCallbackDate && params.callbackDate) {
    dueAt = new Date(params.callbackDate);
  } else {
    dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + rule.daysOffset);
    dueAt.setHours(9, 0, 0, 0);
  }

  await db.insert(tasks).values({
    leadInstanceId: params.leadInstanceId,
    dominionLeadId: params.dominionLeadId,
    assignedTo: params.assignedTo,
    title: rule.title,
    taskType: rule.taskType as 'CALLBACK' | 'FOLLOW_UP' | 'SEND_OFFER' | 'GENERAL',
    dueAt,
    source: 'DISPOSITION',
  });

  logger.info(
    { leadInstanceId: params.leadInstanceId, disposition: params.disposition, title: rule.title },
    'Disposition task created',
  );
}
