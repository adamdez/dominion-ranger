import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  scoringRecords,
  propertyContacts,
  properties,
  leadInstances,
  activityLog,
} from '../../db/schema/index.js';
import { getPropertyById, getPropertyCount } from '../../modules/properties/index.js';
import { getEventsByProperty } from '../../modules/distress-events/index.js';
import { getLatestScore, getScoringHistory } from '../../modules/scoring/index.js';
import { getSignalAccumulation } from '../../modules/signals/index.js';
import { getPromotionHistory } from '../../modules/promotion/index.js';
import { getAuditTrail } from '../../modules/compliance/index.js';
import { requireRole } from '../middleware/auth.js';
import { BUSINESS_RULES } from '../../config/business-rules.js';
import { propertyParamsSchema, propertyScoreHistoryQuery } from '../schemas/properties.js';
import { z } from 'zod';
import { fetchRegridParcel } from '../../modules/enrichment/regrid-service.js';
import { generateCompReport } from '../../modules/comps/index.js';
import { isFeatureEnabled } from '../../modules/feature-flags/index.js';
import { logger } from '../../config/logger.js';

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

      let raw = record.signalContributions;
      if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { raw = []; }
      }
      const contributions = (Array.isArray(raw) ? raw : []) as Array<Record<string, unknown>>;
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
      const tiers = BUSINESS_RULES.tiers;
      const tier = comp >= tiers.A.minScore ? 'A'
        : comp >= tiers.B.minScore ? 'B'
        : comp >= tiers.C.minScore ? 'C' : 'D';

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

  // POST /api/properties/:dominionLeadId/enrich
  // Calls Regrid (parcel data) and BatchData (comps) in parallel when API keys are set
  app.post<{ Params: { dominionLeadId: string } }>(
    '/api/properties/:dominionLeadId/enrich',
    { preHandler: [requireRole('properties.read')] },
    async (request, reply) => {
      const params = z.object({ dominionLeadId: z.string().min(1) }).parse(request.params);
      const user = (request as unknown as Record<string, { userId?: string }>).user;

      const [property] = await db
        .select()
        .from(properties)
        .where(eq(properties.dominionLeadId, params.dominionLeadId))
        .limit(1);

      if (!property) {
        return reply.code(404).send({ success: false, message: 'Property not found' });
      }

      const hasRegrid = !!process.env.REGRID_API_KEY;
      const hasBatchData = !!process.env.BATCHDATA_API_KEY && await isFeatureEnabled('comp_engine');

      if (!hasRegrid && !hasBatchData) {
        return reply.code(503).send({
          success: false,
          message: 'No enrichment providers configured. Set REGRID_API_KEY and/or BATCHDATA_API_KEY.',
        });
      }

      const address = property.streetAddress ?? property.standardizedAddress ?? '';
      const fullAddress = [address, property.city, property.state, property.zip].filter(Boolean).join(', ');

      const promises: Promise<unknown>[] = [];

      if (hasRegrid) {
        promises.push(
          fetchRegridParcel({
            apn: property.apn,
            county: property.county,
            state: property.state,
            address: fullAddress || undefined,
          }),
        );
      }

      if (hasBatchData) {
        promises.push(
          generateCompReport({
            dominionLeadId: params.dominionLeadId,
            address,
            city: property.city ?? undefined,
            state: property.state ?? undefined,
            zip: property.zip ?? undefined,
            generatedBy: user?.userId ?? 'user',
          }),
        );
      }

      const results = await Promise.all(promises);

      let regridResult: Awaited<ReturnType<typeof fetchRegridParcel>> = null;
      let compReport: Awaited<ReturnType<typeof generateCompReport>> | null = null;

      if (hasRegrid) {
        regridResult = results[0] as Awaited<ReturnType<typeof fetchRegridParcel>>;
        if (regridResult) {
          await db
            .update(properties)
            .set({
              zoning: regridResult.zoning ?? undefined,
              landUse: regridResult.landUse ?? undefined,
              legalDescription: regridResult.legalDescription ?? undefined,
              acreage: regridResult.acreage != null ? String(regridResult.acreage) : undefined,
              regridData: regridResult.raw,
              regridEnrichedAt: new Date(),
            })
            .where(eq(properties.dominionLeadId, params.dominionLeadId));
        }
      }

      if (hasBatchData) {
        compReport = results[hasRegrid ? 1 : 0] as Awaited<ReturnType<typeof generateCompReport>>;
      }

      const [latestLeadInstance] = await db
        .select({ leadInstanceId: leadInstances.leadInstanceId })
        .from(leadInstances)
        .where(eq(leadInstances.dominionLeadId, params.dominionLeadId))
        .orderBy(desc(leadInstances.updatedAt))
        .limit(1);

      await db.insert(activityLog).values({
        dominionLeadId: params.dominionLeadId,
        leadInstanceId: latestLeadInstance?.leadInstanceId ?? null,
        userId: user?.userId ?? 'system',
        activityType: 'STATUS_CHANGED',
        channel: 'MANUAL_EMAIL',
        meta: {
          action: 'property_enrichment_completed',
          providers: [
            ...(hasRegrid ? ['regrid'] : []),
            ...(hasBatchData ? ['batchdata'] : []),
          ],
          regrid: regridResult ? { zoning: regridResult.zoning, landUse: regridResult.landUse } : null,
          compReportId: compReport?.id ?? null,
          source: 'property_detail_overview',
        },
      });

      const providers = [
        ...(hasRegrid ? ['regrid'] : []),
        ...(hasBatchData ? ['batchdata'] : []),
      ];

      logger.info(
        { dominionLeadId: params.dominionLeadId, providers, regrid: !!regridResult, comp: !!compReport },
        'Property enrichment completed',
      );

      return {
        success: true,
        message: 'Property data enrichment completed',
        providers,
        regrid: regridResult ? { zoning: regridResult.zoning, landUse: regridResult.landUse, acreage: regridResult.acreage } : null,
        compReport: compReport ? { id: compReport.id } : null,
      };
    },
  );
}
