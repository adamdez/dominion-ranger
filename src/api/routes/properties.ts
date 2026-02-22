import type { FastifyInstance } from 'fastify';
import { getPropertyById, getPropertyCount } from '../../modules/properties/index.js';
import { getEventsByProperty } from '../../modules/distress-events/index.js';
import { getLatestScore, getScoringHistory } from '../../modules/scoring/index.js';
import { getSignalAccumulation } from '../../modules/signals/index.js';
import { getPromotionHistory } from '../../modules/promotion/index.js';
import { getAuditTrail } from '../../modules/compliance/index.js';
import { requireRole } from '../middleware/auth.js';

export async function propertyRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/properties/:id — Full property intelligence dossier
  app.get<{ Params: { id: string } }>(
    '/api/properties/:id',
    { preHandler: [requireRole('properties.read')] },
    async (request, reply) => {
      const property = await getPropertyById(request.params.id);
      const latestScore = await getLatestScore(request.params.id);
      const signals = await getSignalAccumulation(request.params.id);

      return {
        property,
        latestScore,
        signals,
      };
    },
  );

  // GET /api/properties/:id/events — Distress event history
  app.get<{ Params: { id: string } }>(
    '/api/properties/:id/events',
    { preHandler: [requireRole('events.read')] },
    async (request) => {
      const events = await getEventsByProperty(request.params.id);
      return { events, count: events.length };
    },
  );

  // GET /api/properties/:id/scores — Scoring history (for trend analysis)
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/api/properties/:id/scores',
    { preHandler: [requireRole('scoring.read')] },
    async (request) => {
      const limit = parseInt(request.query.limit ?? '20', 10);
      const scores = await getScoringHistory(request.params.id, limit);
      return { scores, count: scores.length };
    },
  );

  // GET /api/properties/:id/promotions — Promotion history
  app.get<{ Params: { id: string } }>(
    '/api/properties/:id/promotions',
    { preHandler: [requireRole('promotion.read')] },
    async (request) => {
      const promotions = await getPromotionHistory(request.params.id);
      return { promotions, count: promotions.length };
    },
  );

  // GET /api/properties/:id/audit — Audit trail
  app.get<{ Params: { id: string } }>(
    '/api/properties/:id/audit',
    { preHandler: [requireRole('audit.read')] },
    async (request) => {
      const entries = await getAuditTrail(request.params.id);
      return { entries, count: entries.length };
    },
  );

  // GET /api/properties/count — Property count (health check metric)
  app.get(
    '/api/properties/count',
    { preHandler: [requireRole('properties.read')] },
    async () => {
      const count = await getPropertyCount();
      return { count };
    },
  );
}
