import type { FastifyInstance } from 'fastify';
import { receiveSentinelStatus } from '../../modules/sentinel/index.js';
import type { SentinelStatus } from '../../modules/sentinel/index.js';
import { requireRole } from '../middleware/auth.js';
import { sentinelStatusBody } from '../schemas/sentinel.js';

export async function sentinelRoutes(app: FastifyInstance): Promise<void> {

  app.post<{
    Body: {
      dominion_lead_id: string;
      status: SentinelStatus;
      user_id?: string;
      metadata?: Record<string, unknown>;
    };
  }>(
    '/api/sentinel/status-sync',
    { preHandler: [requireRole('sentinel.write')] },
    async (request) => {
      const body = sentinelStatusBody.parse(request.body);

      await receiveSentinelStatus({
        dominionLeadId: body.dominion_lead_id,
        status: body.status as SentinelStatus,
        userId: body.user_id,
        metadata: body.metadata,
      });

      return { success: true, dominion_lead_id: body.dominion_lead_id, status: body.status };
    },
  );
}
