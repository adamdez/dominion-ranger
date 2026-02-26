/**
 * Call-Ready Auto Queue admin endpoints.
 *
 * POST /api/admin/call-ready-sync — Run call-ready rule on leads from last N days.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import { runCallReadyForLastNDays } from '../../modules/call-ready/service.js';

const syncQuerySchema = z.object({
  days: z.coerce.number().min(1).max(90).default(7),
});

export async function callReadyRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Querystring: { days?: string };
  }>(
    '/api/admin/call-ready-sync',
    { preHandler: [requireRole('properties.read')] },
    async (request, reply) => {
      const user = (request as unknown as Record<string, { role?: string }>).user;
      if (user?.role !== 'ADMIN' && user?.role !== 'MANAGER') {
        return reply.code(403).send({ error: 'Admin or Manager access required' });
      }

      const query = syncQuerySchema.parse({
        days: request.query.days != null ? Number(request.query.days) : 7,
      });

      const result = await runCallReadyForLastNDays(query.days);

      return {
        ok: true,
        days: query.days,
        evaluated: result.evaluated,
        eligible: result.eligible,
        enqueued: result.enqueued,
        errors: result.errors,
        results: result.results.slice(0, 100), // Limit response size
      };
    },
  );
}
