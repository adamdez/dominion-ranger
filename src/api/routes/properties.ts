import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { scoringRecords, propertyContacts, properties } from '../../db/schema/index.js';
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

  // GET /api/properties/:id/score-breakdown — Scoring breakdown with top signal contributions
  app.get<{ Params: { id: string } }>(
    '/api/properties/:id/score-breakdown',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const { id } = propertyParamsSchema.parse(request.params);

      const [record] = await db
        .select({
          compositeScore: scoringRecords.compositeScore,
          motivationScore: scoringRecords.motivationScore,
          dealScore: scoringRecords.dealScore,
          confidenceScore: scoringRecords.confidenceScore,
          signalContributions: scoringRecords.signalContributions,
          modelVersion: scoringRecords.scoreModelVersion,
          scoredAt: scoringRecords.createdAt,
        })
        .from(scoringRecords)
        .where(eq(scoringRecords.dominionLeadId, id))
        .orderBy(desc(scoringRecords.createdAt))
        .limit(1);

      if (!record) return { topSignals: [], scores: null, tier: 'D' };

      const contributions = (record.signalContributions as Array<Record<string, unknown>>) ?? [];
      const topSignals = contributions
        .sort((a, b) => (Number(b.finalContribution) || 0) - (Number(a.finalContribution) || 0))
        .slice(0, 8)
        .map(c => ({
          eventType: c.eventType,
          eventLayer: c.eventLayer,
          contribution: Number(c.finalContribution) || 0,
          daysSinceTrigger: c.daysSinceTrigger,
          triggerDate: c.triggerDate ?? c.filingDate ?? null,
          rawAmount: c.rawAmount ?? null,
        }));

      const comp = Number(record.compositeScore) || 0;
      const tier = comp >= BUSINESS_RULES.scoring.tiers.A.minScore ? 'A'
        : comp >= BUSINESS_RULES.scoring.tiers.B.minScore ? 'B'
        : comp >= BUSINESS_RULES.scoring.tiers.C.minScore ? 'C' : 'D';

      return {
        topSignals,
        tier,
        scores: {
          composite: comp,
          motivation: Number(record.motivationScore),
          deal: Number(record.dealScore),
          confidence: Number(record.confidenceScore),
          modelVersion: record.modelVersion,
          scoredAt: record.scoredAt,
        },
      };
    },
  );

  // GET /api/properties/:id/contacts — Property contacts from skip trace + property record
  app.get<{ Params: { id: string } }>(
    '/api/properties/:id/contacts',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const { id } = propertyParamsSchema.parse(request.params);

      const [contacts, [prop]] = await Promise.all([
        db
          .select()
          .from(propertyContacts)
          .where(eq(propertyContacts.dominionLeadId, id))
          .orderBy(desc(propertyContacts.isPrimary)),
        db
          .select({
            phone: properties.phone,
            phone2: properties.phone2,
            phone3: properties.phone3,
            email: properties.email,
            email2: properties.email2,
            ownerName: properties.ownerName,
          })
          .from(properties)
          .where(eq(properties.dominionLeadId, id))
          .limit(1),
      ]);

      const result = [
        ...contacts.map(c => ({
          contactId: c.id,
          fullName: c.contactName,
          contactType: c.contactType,
          phone: c.phone,
          phoneType: c.phoneType,
          phoneStatus: c.phoneStatus,
          email: c.email,
          isPrimary: c.isPrimary,
          dndCalls: c.dndCalls,
          dndSms: c.dndSms,
          source: c.source,
        })),
      ];

      if (prop?.phone && !result.some(c => c.phone === prop.phone)) {
        result.unshift({
          contactId: 'property-primary',
          fullName: prop.ownerName,
          contactType: 'OWNER',
          phone: prop.phone,
          phoneType: null,
          phoneStatus: null,
          email: prop.email,
          isPrimary: true,
          dndCalls: false,
          dndSms: false,
          source: 'property_record',
        });
      }

      return result;
    },
  );
}
