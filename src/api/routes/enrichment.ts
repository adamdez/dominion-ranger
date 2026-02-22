import type { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/auth.js';
import { logger } from '../../config/logger.js';
import { BUSINESS_RULES } from '../../config/business-rules.js';
import { enrichmentRunBody, dncScrubBody, dncResultsParams } from '../schemas/enrichment.js';
import {
  runTracerFyEnrichment,
  getTracerFyBalance,
  submitDncScrub,
  getDncResults,
} from '../../enrichment/adapters/tracerfy.js';

export async function enrichmentRoutes(app: FastifyInstance): Promise<void> {

  // POST /api/enrichment/run — Trigger automated enrichment pipeline
  app.post<{
    Body: {
      limit?: number;
      county?: string;
      minScore?: number;
      forceAll?: boolean;
    };
  }>(
    '/api/enrichment/run',
    { preHandler: [requireRole('pipeline.run')] },
    async (request, reply) => {
      try {
        const body = enrichmentRunBody.parse(request.body);
        const { limit, county, minScore, forceAll } = body ?? {};

        logger.info({ limit, county, minScore, forceAll }, 'Enrichment pipeline triggered via API');

        // Run enrichment asynchronously — don't block the HTTP response
        // For large batches, this could take 15-30 minutes
        const resultPromise = runTracerFyEnrichment({ limit, county, minScore, forceAll });

        // If batch is small (< 100), wait for it
        if (limit && limit <= BUSINESS_RULES.batch.smallBatchThreshold) {
          const result = await resultPromise;
          return reply.send({
            status: 'completed',
            ...result,
          });
        }

        // For larger batches, return immediately with a job reference
        resultPromise
          .then((result) => {
            logger.info(result, 'Enrichment pipeline completed');
          })
          .catch((err) => {
            logger.error({ err }, 'Enrichment pipeline failed');
          });

        return reply.send({
          status: 'processing',
          message: `Enrichment pipeline started. Processing up to ${limit ?? BUSINESS_RULES.batch.defaultEnrichmentLimit} properties.`,
        });
      } catch (err: unknown) {
        logger.error({ err }, 'Failed to start enrichment');
        return reply.code(500).send({
          error: 'ENRICHMENT_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  // GET /api/enrichment/balance — Check Tracerfy credit balance
  app.get(
    '/api/enrichment/balance',
    { preHandler: [requireRole('pipeline.run')] },
    async (_request, reply) => {
      try {
        const balance = await getTracerFyBalance();
        return reply.send(balance);
      } catch (err: unknown) {
        return reply.code(500).send({
          error: 'BALANCE_CHECK_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  // POST /api/enrichment/dnc-scrub — Submit a completed trace for DNC scrubbing
  app.post<{
    Body: { queueId: number };
  }>(
    '/api/enrichment/dnc-scrub',
    { preHandler: [requireRole('pipeline.run')] },
    async (request, reply) => {
      try {
        const { queueId } = dncScrubBody.parse(request.body);
        const result = await submitDncScrub(queueId);
        return reply.send(result);
      } catch (err: unknown) {
        return reply.code(500).send({
          error: 'DNC_SCRUB_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  // GET /api/enrichment/dnc-results/:queueId — Get DNC scrub results
  app.get<{
    Params: { queueId: string };
  }>(
    '/api/enrichment/dnc-results/:queueId',
    { preHandler: [requireRole('pipeline.run')] },
    async (request, reply) => {
      try {
        const { queueId } = dncResultsParams.parse(request.params);
        const results = await getDncResults(queueId);
        return reply.send(results);
      } catch (err: unknown) {
        return reply.code(500).send({
          error: 'DNC_RESULTS_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );
}
