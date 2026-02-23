import { db } from '../../db/connection.js';
import { activityLog } from '../../db/schema/index.js';
import type { NewActivityLog } from '../../db/schema/index.js';

interface LogActivityInput {
  dominionLeadId: string;
  leadInstanceId?: string;
  userId?: string;
  activityType: NewActivityLog['activityType'];
  channel: NewActivityLog['channel'];
  outcome?: NewActivityLog['outcome'];
  costCents?: number;
  revenueCents?: number;
  meta?: Record<string, unknown>;
  occurredAt?: Date;
}

export async function logActivity(input: LogActivityInput): Promise<void> {
  await db.insert(activityLog).values({
    dominionLeadId: input.dominionLeadId,
    leadInstanceId: input.leadInstanceId ?? null,
    userId: input.userId ?? null,
    activityType: input.activityType,
    channel: input.channel,
    outcome: input.outcome ?? null,
    costCents: input.costCents ?? null,
    revenueCents: input.revenueCents ?? null,
    meta: input.meta ?? null,
    occurredAt: input.occurredAt ?? new Date(),
  });
}
