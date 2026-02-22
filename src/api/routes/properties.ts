import type { FastifyInstance } from 'fastify';
import { getPropertyById, getPropertyCount } from '../../modules/properties/index.js';
import { getEventsByProperty } from '../../modules/distress-events/index.js';
import { getLatestScore, getScoringHistory } from '../../modules/scoring/index.js';
import { getSignalAccumulation } from '../../modules/signals/index.js';
import { getPromotionHistory } from '../../modules/promotion/index.js';
import { getAuditTrail } from '../../modules/compliance/index.js';
import { requireRole } from '../middleware/auth.js';
import { BUSINESS_RULES } from '../../config/business-rules.js';
import { propertyParamsSchema, propertyScoreHistoryQuery } from '../schemas/properties.js';

export async function propertyRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/properties/:id — Full property intelligence dossier
  app.get<{ Params: { id: string } }>(
    '/api/properties/:id',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const { id } = propertyParamsSchema.parse(request.params);
      const property = await getPropertyById(id);
      const latestScore = await getLatestScore(id);
      const signals = await getSignalAccumulation(id);

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
      const { id } = propertyParamsSchema.parse(request.params);
      const events = await getEventsByProperty(id);
      return { events, count: events.length };
    },
  );

  // GET /api/properties/:id/scores — Scoring history (for trend analysis)
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/api/properties/:id/scores',
    { preHandler: [requireRole('scoring.read')] },
    async (request) => {
      const { id } = propertyParamsSchema.parse(request.params);
      const query = propertyScoreHistoryQuery.parse(request.query);
      const limit = query.limit ?? BUSINESS_RULES.pagination.defaultHistoryLimit;
      const scores = await getScoringHistory(id, limit);
      return { scores, count: scores.length };
    },
  );

  // GET /api/properties/:id/promotions — Promotion history
  app.get<{ Params: { id: string } }>(
    '/api/properties/:id/promotions',
    { preHandler: [requireRole('promotion.read')] },
    async (request) => {
      const { id } = propertyParamsSchema.parse(request.params);
      const promotions = await getPromotionHistory(id);
      return { promotions, count: promotions.length };
    },
  );

  // GET /api/properties/:id/audit — Audit trail
  app.get<{ Params: { id: string } }>(
    '/api/properties/:id/audit',
    { preHandler: [requireRole('audit.read')] },
    async (request) => {
      const { id } = propertyParamsSchema.parse(request.params);
      const entries = await getAuditTrail(id);
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
