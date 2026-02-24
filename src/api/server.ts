import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { authMiddleware } from './middleware/auth.js';
import { authRoutes } from './routes/auth.js';
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
import { settingsRoutes } from './routes/settings.js';
import { compRoutes } from './routes/comps.js';
import { RangerError } from '../lib/errors.js';
import { ZodError } from 'zod';
import { logError } from '../modules/error-logging/index.js';
import { isTwilioConfigured, isClientConfigured } from '../modules/dialer/index.js';

export async function createServer() {
  const app = Fastify({
    logger: false,
    requestTimeout: 30_000,
    bodyLimit: 10 * 1024 * 1024,
  });

  // ─── Plugins ───────────────────────────────────
  await app.register(cors, {
    origin: env.NODE_ENV === 'production'
      ? (process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : false)
      : true,
    credentials: true,
  });

  await app.register(helmet);

  await app.register(cookie);

  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });

  // ─── Auth Hook (skip health check) ────────────
  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health') return;
    if (request.url === '/api/inbound/website-lead') return;
    if (request.url === '/api/system/stats' && env.NODE_ENV === 'development') return;
    if (request.url.startsWith('/api/dialer/voice') || request.url === '/api/dialer/status' || request.url === '/api/dialer/recording') return;
    if (request.url === '/api/sms/status' || request.url === '/api/sms/inbound') return;
    if (request.url === '/api/health/deep') return;
    if (request.url === '/api/auth/login' || request.url === '/api/auth/refresh' || request.url === '/api/auth/logout') return;

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
    logError({
      errorType: 'UNHANDLED_API_ERROR',
      message: error.message,
      stack: error.stack,
      context: { url: request.url, method: request.method },
    }).catch(() => {});
    reply.code(500).send({
      error: 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    });
  });

  // ─── Routes ────────────────────────────────────
  await app.register(authRoutes);
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
  await app.register(settingsRoutes);
  await app.register(compRoutes);

  return app;
}

export async function startServer() {
  const app = await createServer();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info({ port: env.PORT, host: env.HOST }, 'Dominion Ranger API server started');

    if (isTwilioConfigured()) {
      logger.info({
        configured: true,
        clientConfigured: isClientConfigured(),
        phoneNumber: env.TWILIO_PHONE_NUMBER,
        baseUrl: env.BASE_URL ?? 'NOT SET',
      }, 'Twilio dialer status');
    } else {
      logger.warn('Twilio not configured — dialer disabled');
    }
  } catch (err: unknown) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }

  return app;
}
