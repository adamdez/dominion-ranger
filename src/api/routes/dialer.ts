import type { FastifyInstance } from 'fastify';
import twilio from 'twilio';
const { validateRequest } = twilio;
import { requireRole } from '../middleware/auth.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { logActivity } from '../../modules/analytics/activity-logger.js';
import {
  generateClientToken,
  getCallablePhone,
  generateVoiceTwiml,
  initiateCall,
  updateCallStatus,
  updateCallRecording,
  hangupCall,
  getCallLogByCallSid,
  isClientConfigured,
  isTwilioConfigured,
} from '../../modules/dialer/index.js';
import { z } from 'zod';
import { isFeatureEnabled } from '../../modules/feature-flags/index.js';

function mapCallStatusToOutcome(status: string) {
  switch (status) {
    case 'completed': return 'CONNECTED' as const;
    case 'busy': return 'BUSY' as const;
    case 'no-answer': return 'NO_ANSWER' as const;
    case 'failed': return 'DISCONNECTED' as const;
    case 'canceled': return 'DISCONNECTED' as const;
    default: return null;
  }
}

function validateTwilioWebhook(
  signature: string | undefined,
  url: string,
  params: Record<string, string>,
): boolean {
  if (env.NODE_ENV === 'development') return true;
  if (!signature || !env.TWILIO_AUTH_TOKEN) return false;
  return validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, params);
}

export async function dialerRoutes(app: FastifyInstance): Promise<void> {

  app.get(
    '/api/dialer/token',
    { preHandler: [requireRole('workflow.write')] },
    async (request) => {
      if (!await isFeatureEnabled('twilio_dialer')) {
        return { error: 'FEATURE_DISABLED', message: 'Twilio dialer is disabled. Enable via Settings > Feature Flags.' };
      }
      if (!isClientConfigured()) {
        return { error: 'TWILIO_NOT_CONFIGURED', message: 'Twilio Client is not configured. Set TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_TWIML_APP_SID.' };
      }
      const user = (request as unknown as Record<string, { userId: string }>).user;
      const token = generateClientToken(user.userId);
      return { token, identity: user.userId };
    },
  );

  app.get(
    '/api/dialer/status-check',
    { preHandler: [requireRole('workflow.write')] },
    async () => {
      return {
        configured: isTwilioConfigured(),
        clientConfigured: isClientConfigured(),
      };
    },
  );

  app.post<{ Body: { dominionLeadId: string; leadInstanceId?: string } }>(
    '/api/dialer/call',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      if (!await isFeatureEnabled('twilio_dialer')) {
        return reply.code(503).send({ error: 'FEATURE_DISABLED', message: 'Twilio dialer is disabled. Enable via Settings > Feature Flags.' });
      }
      if (!isTwilioConfigured()) {
        return reply.code(503).send({ error: 'TWILIO_NOT_CONFIGURED', message: 'Twilio is not configured' });
      }

      const body = z.object({
        dominionLeadId: z.string().uuid(),
        leadInstanceId: z.string().uuid().optional(),
      }).parse(request.body);

      const phone = await getCallablePhone(body.dominionLeadId);
      if (!phone) {
        return reply.code(400).send({ error: 'NO_PHONE', message: 'No phone number on file for this property' });
      }

      const user = (request as unknown as Record<string, { userId: string }>).user;

      const result = await initiateCall({
        dominionLeadId: body.dominionLeadId,
        leadInstanceId: body.leadInstanceId,
        toPhone: phone,
        userId: user.userId,
      });

      return result;
    },
  );

  app.post<{ Body: { callSid: string } }>(
    '/api/dialer/hangup',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      if (!isTwilioConfigured()) {
        return reply.code(503).send({ error: 'TWILIO_NOT_CONFIGURED' });
      }

      const { callSid } = z.object({ callSid: z.string() }).parse(request.body);
      await hangupCall(callSid);
      return { success: true };
    },
  );

  app.post<{ Querystring: { dominionLeadId?: string }; Body: Record<string, string> }>(
    '/api/dialer/voice',
    async (request, reply) => {
      const signature = request.headers['x-twilio-signature'] as string | undefined;
      const baseUrl = env.BASE_URL ?? `http://localhost:${env.PORT}`;
      const url = `${baseUrl}${request.url.split('?')[0]}`;

      if (!validateTwilioWebhook(signature, url, request.body as Record<string, string>)) {
        return reply.code(403).send('Invalid signature');
      }

      const toPhone = (request.body as Record<string, string>).To ?? '';
      const statusUrl = `${baseUrl}/api/dialer/status`;
      const recordingUrl = `${baseUrl}/api/dialer/recording`;

      const twimlXml = generateVoiceTwiml(toPhone, statusUrl, recordingUrl);
      reply.type('text/xml').send(twimlXml);
    },
  );

  app.post(
    '/api/dialer/status',
    async (request, reply) => {
      const signature = request.headers['x-twilio-signature'] as string | undefined;
      const baseUrl = env.BASE_URL ?? `http://localhost:${env.PORT}`;
      const url = `${baseUrl}/api/dialer/status`;

      if (!validateTwilioWebhook(signature, url, request.body as Record<string, string>)) {
        return reply.code(403).send('Invalid signature');
      }

      const body = request.body as Record<string, string>;
      const callSid = body.CallSid;
      const callStatus = body.CallStatus;
      const duration = body.CallDuration ? parseInt(body.CallDuration, 10) : undefined;

      if (!callSid || !callStatus) {
        return reply.code(400).send('Missing CallSid or CallStatus');
      }

      await updateCallStatus(callSid, callStatus, duration);

      if (callStatus === 'completed' || callStatus === 'busy' || callStatus === 'no-answer' || callStatus === 'failed') {
        const callLog = await getCallLogByCallSid(callSid);
        if (callLog) {
          const outcome = mapCallStatusToOutcome(callStatus);
          await logActivity({
            dominionLeadId: callLog.dominionLeadId,
            leadInstanceId: callLog.leadInstanceId ?? undefined,
            userId: callLog.userId,
            activityType: callStatus === 'completed' ? 'CALL_CONNECTED' : 'CALL_PLACED',
            channel: 'OUTBOUND_COLD',
            outcome: outcome ?? undefined,
            meta: {
              callSid,
              durationSeconds: duration ?? callLog.durationSeconds,
              recordingUrl: callLog.recordingUrl,
              toPhone: callLog.toPhone,
            },
          });
        }
      }

      reply.code(200).send('OK');
    },
  );

  app.post(
    '/api/dialer/recording',
    async (request, reply) => {
      const signature = request.headers['x-twilio-signature'] as string | undefined;
      const baseUrl = env.BASE_URL ?? `http://localhost:${env.PORT}`;
      const url = `${baseUrl}/api/dialer/recording`;

      if (!validateTwilioWebhook(signature, url, request.body as Record<string, string>)) {
        return reply.code(403).send('Invalid signature');
      }

      const body = request.body as Record<string, string>;
      const callSid = body.CallSid;
      const recordingUrl = body.RecordingUrl;
      const recordingSid = body.RecordingSid;

      if (callSid && recordingUrl && recordingSid) {
        await updateCallRecording(callSid, recordingUrl, recordingSid);
      }

      reply.code(200).send('OK');
    },
  );
}
