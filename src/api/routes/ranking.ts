import type { FastifyInstance } from 'fastify';
import { getRankedLeads } from '../../modules/promotion/index.js';
import { requireRole } from '../middleware/auth.js';

export async function rankingRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/leads/ranked — Primary Ranger output: ranked, promoted leads
  app.get<{
    Querystring: {
      tier?: 'A' | 'B' | 'C';
      limit?: string;
      offset?: string;
    };
  }>(
    '/api/leads/ranked',
    { preHandler: [requireRole('promotion.read')] },
    async (request) => {
      const { tier, limit = '50', offset = '0' } = request.query;

      const leads = await getRankedLeads({
        tier,
        limit: Math.min(parseInt(limit, 10), 200),
        offset: parseInt(offset, 10),
      });

      return {
        leads,
        count: leads.length,
        filters: { tier },
      };
    },
  );
}
