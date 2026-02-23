/**
 * Skip trace API routes — on-demand per-lead skip tracing.
 *
 * POST /api/leads/:dominionLeadId/skip-trace
 *   - Tier 1 (STANDARD): Tracerfy — ~$0.10-0.15/record
 *   - Tier 2 (ADVANCED): REISkip — ~$0.40-0.75/record
 *
 * Every trace costs money. These are triggered per-lead only.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import { skipTraceProperty } from '../../modules/skip-trace/index.js';
import { logger } from '../../config/logger.js';

const skipTraceBody = z.object({
  tier: z.enum(['STANDARD', 'ADVANCED']),
});

export async function skipTraceRoutes(app: FastifyInstance): Promise<void> {

  app.post<{ Params: { dominionLeadId: string } }>(
    '/api/leads/:dominionLeadId/skip-trace',
    { preHandler: [requireRole('pipeline.run')] },
    async (request, reply) => {
      const { dominionLeadId } = request.params;
      const { tier } = skipTraceBody.parse(request.body);

      try {
        const result = await skipTraceProperty(dominionLeadId, tier);

        return reply.send({
          success: result.success,
          tier: result.tier,
          source: result.source,
          phone: result.phone ?? null,
          additionalPhones: [result.phone2, result.phone3].filter(Boolean),
          email: result.email ?? null,
          costCents: result.costCents,
          error: result.error,
        });
      } catch (err: unknown) {
        logger.error({ err, dominionLeadId, tier }, 'Skip trace failed');
        return reply.code(500).send({
          error: 'SKIP_TRACE_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );
}
