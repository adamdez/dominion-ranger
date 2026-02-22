import type { FastifyInstance } from 'fastify';
import { getRankedLeads } from '../../modules/promotion/index.js';
import { requireRole } from '../middleware/auth.js';
import { rankedLeadsQuery } from '../schemas/ranking.js';

export async function rankingRoutes(app: FastifyInstance): Promise<void> {

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
      const query = rankedLeadsQuery.parse(request.query);

      const leads = await getRankedLeads({
        tier: query.tier,
        limit: query.limit,
        offset: query.offset,
      });

      return {
        leads,
        count: leads.length,
        filters: { tier: query.tier },
      };
    },
  );
}
