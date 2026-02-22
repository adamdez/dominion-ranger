import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { dispositions } from '../../db/schema/index.js';
import { generateId } from '../../lib/index.js';
import { logAudit } from '../compliance/index.js';
import { logger } from '../../config/logger.js';
import type { Disposition } from '../../db/schema/index.js';

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

  return record;
}

export async function getDispositions(leadInstanceId: string): Promise<Disposition[]> {
  return db
    .select()
    .from(dispositions)
    .where(eq(dispositions.leadInstanceId, leadInstanceId))
    .orderBy(desc(dispositions.createdAt));
}
