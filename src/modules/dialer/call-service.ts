import AccessToken from 'twilio/lib/jwt/AccessToken.js';
import { twiml as TwiML } from 'twilio';
import {
  getTwilioClient,
  TWILIO_PHONE_NUMBER,
  isTwilioConfigured,
  isClientConfigured,
} from '../../config/twilio.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { db } from '../../db/connection.js';
import { properties, callLogs } from '../../db/schema/index.js';
import { eq, desc } from 'drizzle-orm';

export function generateClientToken(identity: string): string {
  if (!env.TWILIO_API_KEY || !env.TWILIO_API_SECRET || !env.TWILIO_TWIML_APP_SID) {
    throw new Error(
      'Twilio Client not configured. Set TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_TWIML_APP_SID.',
    );
  }

  const token = new AccessToken(
    env.TWILIO_ACCOUNT_SID!,
    env.TWILIO_API_KEY,
    env.TWILIO_API_SECRET,
    { identity, ttl: 3600 },
  );

  const voiceGrant = new AccessToken.VoiceGrant({
    outgoingApplicationSid: env.TWILIO_TWIML_APP_SID,
    incomingAllow: true,
  });

  token.addGrant(voiceGrant);
  return token.toJwt();
}

export async function getCallablePhone(dominionLeadId: string): Promise<string | null> {
  const [prop] = await db
    .select({
      phone: properties.phone,
      phone2: properties.phone2,
      phone3: properties.phone3,
    })
    .from(properties)
    .where(eq(properties.dominionLeadId, dominionLeadId))
    .limit(1);

  if (prop?.phone) return prop.phone;
  if (prop?.phone2) return prop.phone2;
  if (prop?.phone3) return prop.phone3;
  return null;
}

export function generateVoiceTwiml(toPhone: string, statusCallbackUrl: string, recordingCallbackUrl: string): string {
  const response = new TwiML.VoiceResponse();
  const dial = response.dial({
    callerId: TWILIO_PHONE_NUMBER,
    record: 'record-from-answer-dual',
    recordingStatusCallback: recordingCallbackUrl,
    recordingStatusCallbackEvent: ['completed'],
  });
  dial.number(
    {
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    },
    toPhone,
  );
  return response.toString();
}

export interface InitiateCallParams {
  dominionLeadId: string;
  leadInstanceId?: string;
  toPhone: string;
  userId: string;
}

export async function initiateCall(params: InitiateCallParams): Promise<{ callSid: string; status: string }> {
  if (!isTwilioConfigured()) {
    throw new Error('Twilio is not configured');
  }

  const client = getTwilioClient();
  const baseUrl = env.BASE_URL ?? 'https://your-domain.com';

  const call = await client.calls.create({
    url: `${baseUrl}/api/dialer/voice?dominionLeadId=${params.dominionLeadId}`,
    to: params.toPhone,
    from: TWILIO_PHONE_NUMBER,
    statusCallback: `${baseUrl}/api/dialer/status`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    record: true,
  });

  await db.insert(callLogs).values({
    callSid: call.sid,
    dominionLeadId: params.dominionLeadId,
    leadInstanceId: params.leadInstanceId ?? null,
    userId: params.userId,
    toPhone: params.toPhone,
    fromPhone: TWILIO_PHONE_NUMBER,
    status: 'initiated',
    direction: 'OUTBOUND',
  });

  logger.info(
    { callSid: call.sid, to: params.toPhone, dominionLeadId: params.dominionLeadId },
    'Outbound call initiated',
  );

  return { callSid: call.sid, status: 'initiated' };
}

export async function updateCallStatus(
  callSid: string,
  status: string,
  durationSeconds?: number,
): Promise<void> {
  const updates: Record<string, unknown> = { status };

  if (status === 'in-progress') {
    updates.answeredAt = new Date();
  }

  if (status === 'completed' || status === 'busy' || status === 'no-answer' || status === 'failed' || status === 'canceled') {
    updates.endedAt = new Date();
    if (durationSeconds !== undefined) {
      updates.durationSeconds = durationSeconds;
    }
  }

  await db
    .update(callLogs)
    .set(updates)
    .where(eq(callLogs.callSid, callSid));

  logger.info({ callSid, status, durationSeconds }, 'Call status updated');
}

export async function updateCallRecording(
  callSid: string,
  recordingUrl: string,
  recordingSid: string,
): Promise<void> {
  await db
    .update(callLogs)
    .set({ recordingUrl, recordingSid })
    .where(eq(callLogs.callSid, callSid));

  logger.info({ callSid, recordingSid }, 'Call recording saved');
}

export async function hangupCall(callSid: string): Promise<void> {
  if (!isTwilioConfigured()) {
    throw new Error('Twilio is not configured');
  }

  const client = getTwilioClient();
  await client.calls(callSid).update({ status: 'completed' });
  logger.info({ callSid }, 'Call hung up');
}

export async function getCallLogByCallSid(callSid: string) {
  const [row] = await db
    .select()
    .from(callLogs)
    .where(eq(callLogs.callSid, callSid))
    .limit(1);
  return row ?? null;
}

export async function getCallHistory(dominionLeadId: string, limit = 20) {
  return db
    .select()
    .from(callLogs)
    .where(eq(callLogs.dominionLeadId, dominionLeadId))
    .orderBy(desc(callLogs.startedAt))
    .limit(limit);
}

export { isClientConfigured, isTwilioConfigured };
