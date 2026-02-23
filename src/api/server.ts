import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { authMiddleware } from './middleware/auth.js';
import { propertyRoutes } from './routes/properties.js';
import { rankingRoutes } from './routes/ranking.js';
import { sentinelRoutes } from './routes/sentinel.js';
import { ingestionRoutes } from './routes/ingestion.js';
import { systemRoutes } from './routes/system.js';
import { enrichmentRoutes } from './routes/enrichment.js';
import { scoringRoutes } from './routes/scoring.js';
import { leadRoutes } from './routes/leads.js';
import { inboundRoutes } from './routes/inbound.js';
import { skipTraceRoutes } from './routes/skip-trace.js';
import { dialerRoutes } from './routes/dialer.js';
import { smsRoutes } from './routes/sms.js';
import { propertyDetailRoutes } from './routes/property-detail.js';
import { tagRoutes } from './routes/tags.js';
import { taskRoutes } from './routes/tasks.js';
import { contactRoutes } from './routes/contacts.js';
import { savedFilterRoutes } from './routes/saved-filters.js';
import { RangerError } from '../lib/errors.js';
import { ZodError } from 'zod';

export async function createServer() {
  const app = Fastify({
    logger: false, // We use our own pino logger
    requestTimeout: 30_000,
    bodyLimit: 10 * 1024 * 1024, // 10MB for ingestion payloads
  });

  // ─── Plugins ───────────────────────────────────
  await app.register(cors, {
    origin: env.NODE_ENV === 'production'
      ? (process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : false)
      : true,
    credentials: true,
  });

  await app.register(helmet);

  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });

  // ─── Auth Hook (skip health check) ────────────
  app.addHook('preHandler', async (request, reply) => {
    // Skip auth for health check
    if (request.url === '/health') return;
    // Skip auth for public inbound lead endpoint
    if (request.url === '/api/inbound/website-lead') return;
    // Skip auth for system stats in dev
    if (request.url === '/api/system/stats' && env.NODE_ENV === 'development') return;
    // Skip auth for Twilio webhooks (validated via X-Twilio-Signature)
    if (request.url.startsWith('/api/dialer/voice') || request.url === '/api/dialer/status' || request.url === '/api/dialer/recording') return;
    if (request.url === '/api/sms/status' || request.url === '/api/sms/inbound') return;

    await authMiddleware(request, reply);
  });

  // ─── Error Handler ─────────────────────────────
  app.setErrorHandler((error: Error, request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({
        error: 'VALIDATION_ERROR',
        details: error.errors.map(e => ({ path: e.path.join('.'), message: e.message })),
      });
      return;
    }

    if (error instanceof RangerError) {
      logger.warn({ err: error, url: request.url }, 'Ranger error');
      reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        metadata: error.metadata,
      });
      return;
    }

    logger.error({ err: error, url: request.url }, 'Unhandled error');
    reply.code(500).send({
      error: 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    });
  });

  // ─── Routes ────────────────────────────────────
  await app.register(systemRoutes);
  await app.register(propertyRoutes);
  await app.register(rankingRoutes);
  await app.register(sentinelRoutes);
  await app.register(ingestionRoutes);
  await app.register(enrichmentRoutes);
  await app.register(scoringRoutes);
  await app.register(leadRoutes);
  await app.register(inboundRoutes);
  await app.register(skipTraceRoutes);
  await app.register(dialerRoutes);
  await app.register(smsRoutes);
  await app.register(propertyDetailRoutes);
  await app.register(tagRoutes);
  await app.register(taskRoutes);
  await app.register(contactRoutes);
  await app.register(savedFilterRoutes);

  return app;
}

export async function startServer() {
  const app = await createServer();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info({ port: env.PORT, host: env.HOST }, 'Dominion Ranger API server started');
  } catch (err: unknown) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }

  return app;
}
