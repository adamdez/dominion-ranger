import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import { autoImportNewFiles } from '../../jobs/auto-import.js';
import { incrementalScore } from '../../jobs/incremental-scoring.js';
import { fullRescore } from '../../jobs/full-rescore.js';
import {
  getPipelineToggles,
  setPipelineToggles,
  getLastJobResult,
  isPipelineEnabled,
} from '../../jobs/pipeline-settings.js';
import { db } from '../../db/connection.js';
import { systemSettings, scoringRecords, leadInstances } from '../../db/schema/index.js';
import { eq, notInArray } from 'drizzle-orm';
import { LeadStatus } from '../../db/schema/constants.js';
import { logger } from '../../config/logger.js';
import { evaluateForPromotion } from '../../modules/promotion/service.js';
import { getLatestScore } from '../../modules/scoring/service.js';

export async function pipelineRoutes(app: FastifyInstance): Promise<void> {

  // ─── Pipeline Status ──────────────────────────

  app.get(
    '/api/pipeline/status',
    { preHandler: [requireRole('pipeline.run')] },
    async () => {
      const [enabled, toggles, lastImport, lastScoring, lastRescore] =
        await Promise.all([
          isPipelineEnabled(),
          getPipelineToggles(),
          getLastJobResult('import'),
          getLastJobResult('scoring'),
          getLastJobResult('rescore'),
        ]);

      return {
        enabled,
        toggles,
        lastRuns: {
          import: lastImport,
          scoring: lastScoring,
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

  // POST /api/system/run-promotion — Evaluate promotion for scored properties without active lead_instance
  app.post(
    '/api/system/run-promotion',
    { preHandler: [requireRole('workflow.write')] },
    async (_request, reply) => {
      try {
        const scoredLeadIds = await db
          .selectDistinct({ dominionLeadId: scoringRecords.dominionLeadId })
          .from(scoringRecords);

        const activeInstanceLeadIds = await db
          .selectDistinct({ dominionLeadId: leadInstances.dominionLeadId })
          .from(leadInstances)
          .where(notInArray(leadInstances.status, [LeadStatus.CLOSED, LeadStatus.DEAD]));

        const activeSet = new Set(activeInstanceLeadIds.map((r) => r.dominionLeadId));
        const toEvaluate = scoredLeadIds
          .map((r) => r.dominionLeadId)
          .filter((id) => !activeSet.has(id));

        let promoted = 0;
        let skipped = 0;
        let errors = 0;

        for (const dominionLeadId of toEvaluate) {
          try {
            const record = await getLatestScore(dominionLeadId);
            if (!record) {
              skipped++;
              continue;
            }

            const snapshot = (record.scoreInputsSnapshot as Record<string, unknown>) ?? {};
            const scoringResult = {
              compositeScore: parseFloat(String(record.compositeScore ?? 0)),
              motivationScore: parseFloat(String(record.motivationScore ?? 0)),
              dealScore: parseFloat(String(record.dealScore ?? 0)),
              confidenceScore: parseFloat(String(record.confidenceScore ?? 0)),
              equityMultiplier: (snapshot.equityMultiplier as number) ?? 1.0,
              suppressed: (snapshot.suppressed as boolean) ?? false,
              suppressionReason: (snapshot.suppressionReason as string) ?? null,
              signalContributions: (record.signalContributions ?? []) as Array<{
                eventId: string;
                eventType: string;
                eventLayer: string;
                baseWeight: number;
                severityMultiplier: number;
                reliabilityScore: number;
                timeDecay: number;
                finalContribution: number;
                daysSinceTrigger: number;
              }>,
              timeDecayFactor: parseFloat(String(record.timeDecayFactor ?? 0)),
              scoreDecayRate: parseFloat(String(record.scoreDecayRate ?? 1)),
              daysSinceTrigger: record.daysSinceTrigger ?? 0,
              firstDetectedAt: record.firstDetectedAt,
              modelVersion: record.scoreModelVersion,
            };

            const promo = await evaluateForPromotion(dominionLeadId, scoringResult);
            if (promo) {
              promoted++;
            } else {
              skipped++;
            }
          } catch (err) {
            errors++;
            logger.error({ err, dominionLeadId }, 'Promotion evaluation failed');
          }
        }

        return reply.send({
          status: 'completed',
          promoted,
          skipped,
          errors,
          evaluated: toEvaluate.length,
        });
      } catch (err: unknown) {
        logger.error({ err }, 'Run promotion failed');
        return reply.code(500).send({
          error: 'PROMOTION_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  // ─── Adapter Pipeline Triggers ──────────────────

  app.post(
    '/api/pipeline/run-adapter',
    { preHandler: [requireRole('pipeline.run')] },
    async (request, reply) => {
      const body = z.object({
        adapter: z.enum(['regrid', 'spokane_recorder', 'kootenai_recorder']),
        maxRecords: z.number().optional(),
      }).parse(request.body);

      const { runAdapterPipeline } = await import('../../ingestion/pipeline.js');
      const { initializeAdapters } = await import('../../ingestion/adapters/registry.js');
      initializeAdapters();

      runAdapterPipeline(body.adapter, { maxRecords: body.maxRecords ?? 50000 })
        .then((stats) => logger.info({ stats }, `Manual ${body.adapter} pipeline completed`))
        .catch((err) => logger.error({ err }, `Manual ${body.adapter} pipeline failed`));

      return reply.send({
        status: 'started',
        adapter: body.adapter,
        message: `${body.adapter} pipeline started in background`,
      });
    },
  );

  app.post(
    '/api/pipeline/run-all-recorders',
    { preHandler: [requireRole('pipeline.run')] },
    async (_request, reply) => {
      const { runAdapterPipeline } = await import('../../ingestion/pipeline.js');
      const { initializeAdapters } = await import('../../ingestion/adapters/registry.js');
      initializeAdapters();

      const adapters = ['spokane_recorder', 'kootenai_recorder'];
      for (const name of adapters) {
        runAdapterPipeline(name)
          .then((stats) => logger.info({ stats, adapter: name }, 'Manual recorder run completed'))
          .catch((err) => logger.error({ err, adapter: name }, 'Manual recorder run failed'));
      }

      return reply.send({ status: 'started', adapters, message: 'All county recorders started' });
    },
  );
}
