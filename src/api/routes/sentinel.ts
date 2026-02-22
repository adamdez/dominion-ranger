import type { FastifyInstance } from 'fastify';
import { receiveSentinelStatus } from '../../modules/sentinel/index.js';
import type { SentinelStatus } from '../../modules/sentinel/index.js';
import { requireRole } from '../middleware/auth.js';

const VALID_STATUSES: SentinelStatus[] = [
  'CLAIMED', 'DIALED', 'OFFER_SENT', 'CONTRACTED',
  'CLOSED', 'DEAD', 'LISTED', 'SOLD',
];

export async function sentinelRoutes(app: FastifyInstance): Promise<void> {

  // POST /api/sentinel/status-sync — Receive status updates from Sentinel
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
    async (request, reply) => {
      const { dominion_lead_id, status, user_id, metadata } = request.body;

      if (!dominion_lead_id || !status) {
        return reply.code(400).send({ error: 'dominion_lead_id and status are required' });
      }

      if (!VALID_STATUSES.includes(status)) {
        return reply.code(400).send({
          error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}`,
        });
      }

      await receiveSentinelStatus({
        dominionLeadId: dominion_lead_id,
        status,
        userId: user_id,
        metadata,
      });

      return { success: true, dominion_lead_id, status };
    },
  );
}
