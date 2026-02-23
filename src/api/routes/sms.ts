import type { FastifyInstance } from 'fastify';
import { validateRequest } from 'twilio';
import { twiml as TwiML } from 'twilio';
import { requireRole } from '../middleware/auth.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { logActivity } from '../../modules/analytics/activity-logger.js';
import {
  sendSms,
  updateSmsStatus,
  logInboundSms,
  getSmsHistory,
  isTwilioConfigured,
} from '../../modules/dialer/index.js';
import { getCallHistory } from '../../modules/dialer/index.js';
import { z } from 'zod';

function validateTwilioWebhook(
  signature: string | undefined,
  url: string,
  params: Record<string, string>,
): boolean {
  if (env.NODE_ENV === 'development') return true;
  if (!signature || !env.TWILIO_AUTH_TOKEN) return false;
  return validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, params);
}

export async function smsRoutes(app: FastifyInstance): Promise<void> {

  app.post<{ Body: { dominionLeadId?: string; leadInstanceId?: string; toPhone: string; body: string } }>(
    '/api/sms/send',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      if (!isTwilioConfigured()) {
        return reply.code(503).send({ error: 'TWILIO_NOT_CONFIGURED', message: 'Twilio is not configured' });
      }

      const body = z.object({
        dominionLeadId: z.string().uuid().optional(),
        leadInstanceId: z.string().uuid().optional(),
        toPhone: z.string().min(10),
        body: z.string().min(1).max(1600),
      }).parse(request.body);

      const user = (request as unknown as Record<string, { userId: string }>).user;

      const result = await sendSms(
        body.toPhone,
        body.body,
        user.userId,
        body.dominionLeadId,
        body.leadInstanceId,
      );

      if (result.success && body.dominionLeadId) {
        await logActivity({
          dominionLeadId: body.dominionLeadId,
          leadInstanceId: body.leadInstanceId,
          userId: user.userId,
          activityType: 'TEXT_SENT',
          channel: 'MANUAL_SMS',
          meta: {
            messageSid: result.messageSid,
            toPhone: body.toPhone,
            bodyPreview: body.body.substring(0, 100),
          },
        });
      }

      if (!result.success) {
        return reply.code(400).send({ error: 'SMS_FAILED', message: result.error });
      }

      return { success: true, messageSid: result.messageSid };
    },
  );

  app.post(
    '/api/sms/status',
    async (request, reply) => {
      const signature = request.headers['x-twilio-signature'] as string | undefined;
      const baseUrl = env.BASE_URL ?? `http://localhost:${env.PORT}`;
      const url = `${baseUrl}/api/sms/status`;

      if (!validateTwilioWebhook(signature, url, request.body as Record<string, string>)) {
        return reply.code(403).send('Invalid signature');
      }

      const body = request.body as Record<string, string>;
      const messageSid = body.MessageSid;
      const messageStatus = body.MessageStatus;

      if (messageSid && messageStatus) {
        await updateSmsStatus(messageSid, messageStatus);
      }

      reply.code(200).send('OK');
    },
  );

  app.post(
    '/api/sms/inbound',
    async (request, reply) => {
      const signature = request.headers['x-twilio-signature'] as string | undefined;
      const baseUrl = env.BASE_URL ?? `http://localhost:${env.PORT}`;
      const url = `${baseUrl}/api/sms/inbound`;

      if (!validateTwilioWebhook(signature, url, request.body as Record<string, string>)) {
        return reply.code(403).send('Invalid signature');
      }

      const body = request.body as Record<string, string>;
      const fromPhone = body.From ?? '';
      const toPhone = body.To ?? '';
      const smsBody = body.Body ?? '';
      const messageSid = body.MessageSid ?? '';

      const { dominionLeadId } = await logInboundSms(fromPhone, toPhone, smsBody, messageSid);

      if (dominionLeadId) {
        await logActivity({
          dominionLeadId,
          activityType: 'TEXT_REPLY',
          channel: 'INBOUND_CALL',
          meta: {
            messageSid,
            fromPhone,
            bodyPreview: smsBody.substring(0, 100),
          },
        });
      }

      const response = new TwiML.MessagingResponse();
      reply.type('text/xml').send(response.toString());
    },
  );

  app.get<{ Params: { dominionLeadId: string } }>(
    '/api/leads/:dominionLeadId/messages',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const { dominionLeadId } = request.params;

      const [smsMessages, callHistory] = await Promise.all([
        getSmsHistory(dominionLeadId),
        getCallHistory(dominionLeadId),
      ]);

      const messages = [
        ...smsMessages.map(s => ({
          id: s.id,
          type: 'sms' as const,
          direction: s.direction,
          body: s.body,
          phone: s.direction === 'OUTBOUND' ? s.toPhone : s.fromPhone,
          status: s.status,
          timestamp: s.createdAt,
          messageSid: s.messageSid,
        })),
        ...callHistory.map(c => ({
          id: c.id,
          type: 'call' as const,
          direction: c.direction,
          body: null,
          phone: c.direction === 'OUTBOUND' ? c.toPhone : c.fromPhone,
          status: c.status,
          timestamp: c.startedAt,
          durationSeconds: c.durationSeconds,
          recordingUrl: c.recordingUrl,
          callSid: c.callSid,
        })),
      ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      return { messages, count: messages.length };
    },
  );
}
