import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { dispositions, leadInstances } from '../../db/schema/index.js';
import { generateId } from '../../lib/index.js';
import { logAudit } from '../compliance/index.js';
import { logActivity } from '../analytics/activity-logger.js';
import { logger } from '../../config/logger.js';
import type { Disposition, NewActivityLog } from '../../db/schema/index.js';

type DispositionType = Disposition['disposition'];

export async function logDisposition(input: {
  leadInstanceId: string;
  disposition: DispositionType;
  notes?: string;
  userId?: string;
}): Promise<Disposition> {
  const id = generateId();

  const [record] = await db
    .insert(dispositions)
    .values({
      id,
      leadInstanceId: input.leadInstanceId,
      disposition: input.disposition,
      notes: input.notes ?? null,
      createdBy: input.userId ?? null,
    })
    .returning();

  await logAudit({
    actionType: 'workflow.disposition_logged',
    metadata: {
      dispositionId: id,
      leadInstanceId: input.leadInstanceId,
      disposition: input.disposition,
    },
    userId: input.userId,
  });

  logger.info(
    { dispositionId: id, leadInstanceId: input.leadInstanceId, disposition: input.disposition },
    'Disposition logged',
  );

  // Log activity for analytics — fire-and-forget
  const [instance] = await db
    .select({ dominionLeadId: leadInstances.dominionLeadId })
    .from(leadInstances)
    .where(eq(leadInstances.leadInstanceId, input.leadInstanceId))
    .limit(1);

  if (instance) {
    await logActivity({
      dominionLeadId: instance.dominionLeadId,
      leadInstanceId: input.leadInstanceId,
      userId: input.userId,
      activityType: 'CALL_PLACED',
      channel: 'OUTBOUND_COLD',
      outcome: mapDispositionToOutcome(input.disposition),
      meta: { disposition: input.disposition, notes: input.notes },
    }).catch(err => logger.error({ err }, 'Failed to log disposition activity'));
  }

  return record;
}

function mapDispositionToOutcome(disposition: string): NewActivityLog['outcome'] {
  const map: Record<string, NewActivityLog['outcome']> = {
    NO_ANSWER: 'NO_ANSWER',
    LEFT_VOICEMAIL: 'VOICEMAIL',
    CALLBACK_REQUESTED: 'FOLLOW_UP',
    NOT_INTERESTED: 'NOT_INTERESTED',
    WRONG_NUMBER: 'WRONG_NUMBER',
    DO_NOT_CALL: 'DO_NOT_CALL',
    INTERESTED: 'WARM',
    APPOINTMENT_SET: 'APPT_SET',
  };
  return map[disposition] ?? 'NO_ANSWER';
}

export async function getDispositions(leadInstanceId: string): Promise<Disposition[]> {
  return db
    .select()
    .from(dispositions)
    .where(eq(dispositions.leadInstanceId, leadInstanceId))
    .orderBy(desc(dispositions.createdAt));
}
