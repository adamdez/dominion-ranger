import { getTwilioClient, TWILIO_PHONE_NUMBER, isTwilioConfigured } from '../../config/twilio.js';
import { logger } from '../../config/logger.js';
import { db } from '../../db/connection.js';
import { smsLogs, properties } from '../../db/schema/index.js';
import { eq, desc, sql, and } from 'drizzle-orm';
import { env } from '../../config/env.js';

export interface SmsResult {
  success: boolean;
  messageSid?: string;
  error?: string;
}

export async function sendSms(
  toPhone: string,
  body: string,
  userId: string,
  dominionLeadId?: string,
  leadInstanceId?: string,
): Promise<SmsResult> {
  if (!isTwilioConfigured()) {
    return { success: false, error: 'Twilio not configured' };
  }

  const recentCount = await getRecentSmsCount(toPhone);
  if (recentCount > 0) {
    return { success: false, error: 'SMS rate limit: max 1 per phone per 24 hours' };
  }

  try {
    const client = getTwilioClient();
    const baseUrl = env.BASE_URL ?? 'https://your-domain.com';

    const message = await client.messages.create({
      body,
      from: TWILIO_PHONE_NUMBER,
      to: toPhone,
      statusCallback: `${baseUrl}/api/sms/status`,
    });

    await db.insert(smsLogs).values({
      messageSid: message.sid,
      dominionLeadId: dominionLeadId ?? null,
      leadInstanceId: leadInstanceId ?? null,
      userId,
      direction: 'OUTBOUND',
      toPhone,
      fromPhone: TWILIO_PHONE_NUMBER,
      body,
      status: 'queued',
    });

    logger.info({ messageSid: message.sid, to: toPhone, dominionLeadId }, 'SMS sent');
    return { success: true, messageSid: message.sid };
  } catch (err: unknown) {
    logger.error({ err, to: toPhone }, 'SMS send failed');
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function updateSmsStatus(messageSid: string, status: string): Promise<void> {
  await db
    .update(smsLogs)
    .set({ status })
    .where(eq(smsLogs.messageSid, messageSid));

  logger.info({ messageSid, status }, 'SMS status updated');
}

export async function logInboundSms(
  fromPhone: string,
  toPhone: string,
  body: string,
  messageSid: string,
): Promise<{ dominionLeadId: string | null }> {
  const normalizedPhone = fromPhone.replace(/\D/g, '').slice(-10);

  const [match] = await db
    .select({ dominionLeadId: properties.dominionLeadId })
    .from(properties)
    .where(
      sql`REPLACE(REPLACE(REPLACE(REPLACE(${properties.phone}, '-', ''), '(', ''), ')', ''), ' ', '') LIKE ${'%' + normalizedPhone}`,
    )
    .limit(1);

  const dominionLeadId = match?.dominionLeadId ?? null;

  await db.insert(smsLogs).values({
    messageSid,
    dominionLeadId,
    direction: 'INBOUND',
    toPhone,
    fromPhone,
    body,
    status: 'received',
  });

  logger.info({ messageSid, fromPhone, dominionLeadId }, 'Inbound SMS logged');
  return { dominionLeadId };
}

export async function getSmsHistory(dominionLeadId: string, limit = 50) {
  return db
    .select()
    .from(smsLogs)
    .where(eq(smsLogs.dominionLeadId, dominionLeadId))
    .orderBy(desc(smsLogs.createdAt))
    .limit(limit);
}

async function getRecentSmsCount(toPhone: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(smsLogs)
    .where(
      and(
        eq(smsLogs.toPhone, toPhone),
        eq(smsLogs.direction, 'OUTBOUND'),
        sql`${smsLogs.createdAt} > now() - interval '24 hours'`,
      ),
    );
  return result?.count ?? 0;
}
