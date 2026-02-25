import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import { autoImportNewFiles } from '../../jobs/auto-import.js';
import { incrementalScore } from '../../jobs/incremental-scoring.js';
import { autoPromote } from '../../jobs/auto-promotion.js';
import { fullRescore } from '../../jobs/full-rescore.js';
import {
  getPipelineToggles,
  setPipelineToggles,
  getLastJobResult,
  isPipelineEnabled,
} from '../../jobs/pipeline-settings.js';
import { db } from '../../db/connection.js';
import { systemSettings } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../config/logger.js';

export async function pipelineRoutes(app: FastifyInstance): Promise<void> {

  // ─── Pipeline Status ──────────────────────────

  app.get(
    '/api/pipeline/status',
    { preHandler: [requireRole('pipeline.run')] },
    async () => {
      const [enabled, toggles, lastImport, lastScoring, lastPromotion, lastRescore] =
        await Promise.all([
          isPipelineEnabled(),
          getPipelineToggles(),
          getLastJobResult('import'),
          getLastJobResult('scoring'),
          getLastJobResult('promotion'),
          getLastJobResult('rescore'),
        ]);

      return {
        enabled,
        toggles,
        lastRuns: {
          import: lastImport,
          scoring: lastScoring,
          promotion: lastPromotion,
          rescore: lastRescore,
        },
      };
    },
  );

  // ─── Pipeline Master Toggle ──────────────────

  app.patch(
    '/api/pipeline/enabled',
    { preHandler: [requireRole('pipeline.run')] },
    async (request) => {
      const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
      await db
        .insert(systemSettings)
        .values({ key: 'pipeline_automation', value: { enabled } })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: { enabled }, updatedAt: new Date() },
        });
      logger.info({ enabled }, 'Pipeline automation toggle updated');
      return { enabled };
    },
  );

  // ─── Pipeline Toggles ────────────────────────

  app.patch(
    '/api/pipeline/toggles',
    { preHandler: [requireRole('pipeline.run')] },
    async (request) => {
      const body = z.object({
        autoImport: z.boolean().optional(),
        autoScoring: z.boolean().optional(),
        autoPromotion: z.boolean().optional(),
        nightlyRescore: z.boolean().optional(),
      }).parse(request.body);

      const updated = await setPipelineToggles(body);
      return { toggles: updated };
    },
  );

  // ─── Manual Trigger Endpoints ─────────────────

  app.post(
    '/api/system/run-import',
    { preHandler: [requireRole('pipeline.run')] },
    async (_request, reply) => {
      try {
        const result = await autoImportNewFiles();
        return reply.send({ status: 'completed', ...result });
      } catch (err: unknown) {
        logger.error({ err }, 'Manual import trigger failed');
        return reply.code(500).send({
          error: 'IMPORT_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  app.post(
    '/api/system/run-scoring',
    { preHandler: [requireRole('pipeline.run')] },
    async (_request, reply) => {
      try {
        const result = await incrementalScore();
        return reply.send({ status: 'completed', ...result });
      } catch (err: unknown) {
        logger.error({ err }, 'Manual scoring trigger failed');
        return reply.code(500).send({
          error: 'SCORING_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  app.post(
    '/api/system/run-promotion',
    { preHandler: [requireRole('pipeline.run')] },
    async (_request, reply) => {
      try {
        const result = await autoPromote();
        return reply.send({ status: 'completed', ...result });
      } catch (err: unknown) {
        logger.error({ err }, 'Manual promotion trigger failed');
        return reply.code(500).send({
          error: 'PROMOTION_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  app.post(
    '/api/system/run-rescore',
    { preHandler: [requireRole('pipeline.run')] },
    async (_request, reply) => {
      reply.send({ status: 'started', message: 'Full rescore started in background' });

      setImmediate(async () => {
        try {
          await fullRescore();
        } catch (err) {
          logger.error({ err }, 'Manual full rescore trigger failed');
        }
      });
    },
  );
}
