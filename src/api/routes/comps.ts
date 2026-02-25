import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import {
  generateCompReport,
  getCompReport,
  getCompReportsForProperty,
  getLatestCompReport,
  hasRecentCompReport,
  analyzeComps,
} from '../../modules/comps/index.js';
import type { Comp, BatchDataComp } from '../../modules/comps/index.js';
import { isFeatureEnabled } from '../../modules/feature-flags/index.js';
import { db } from '../../db/connection.js';
import { properties } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../config/logger.js';

const generateBody = z.object({
  dominionLeadId: z.string().uuid(),
  rehabEstimateCents: z.number().int().min(0).optional(),
  assignmentFeeCents: z.number().int().min(0).optional(),
  radiusMiles: z.number().min(0.1).max(10).optional(),
  searchMonths: z.number().int().min(1).max(24).optional(),
  forceFresh: z.boolean().optional(),
});

export async function compRoutes(app: FastifyInstance): Promise<void> {

  app.post(
    '/api/comps/generate',
    { preHandler: [requireRole('properties.read')] },
    async (request, reply) => {
      if (!await isFeatureEnabled('comp_engine')) {
        return reply.code(403).send({
          error: 'FEATURE_DISABLED',
          message: 'Comp engine is not enabled. Enable it in Settings → Feature Flags.',
        });
      }

      if (!process.env.BATCHDATA_API_KEY) {
        return reply.code(503).send({
          error: 'NOT_CONFIGURED',
          message: 'BatchData API key not configured. Set BATCHDATA_API_KEY in .env',
        });
      }

      const body = generateBody.parse(request.body);

      const [property] = await db
        .select()
        .from(properties)
        .where(eq(properties.dominionLeadId, body.dominionLeadId))
        .limit(1);

      if (!property) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Property not found' });
      }

      // 24h cache guard — skip if user explicitly wants fresh data
      if (!body.forceFresh && await hasRecentCompReport(body.dominionLeadId)) {
        const reports = await getCompReportsForProperty(body.dominionLeadId);
        return reply.send({ success: true, cached: true, report: reports[0] });
      }

      try {
        const report = await generateCompReport({
          dominionLeadId: body.dominionLeadId,
          address: property.streetAddress ?? property.standardizedAddress ?? '',
          city: property.city ?? undefined,
          state: property.state ?? undefined,
          zip: property.zip ?? undefined,
          rehabEstimateCents: body.rehabEstimateCents,
          assignmentFeeCents: body.assignmentFeeCents,
          radiusMiles: body.radiusMiles,
          searchMonths: body.searchMonths,
          generatedBy: (request as unknown as { user?: { name?: string } }).user?.name ?? 'admin',
        });

        return reply.send({ success: true, cached: false, report });
      } catch (err: unknown) {
        logger.error({ err, dominionLeadId: body.dominionLeadId }, 'Comp generation failed');
        return reply.code(502).send({
          error: 'BATCHDATA_ERROR',
          message: err instanceof Error ? err.message : 'Failed to fetch comp data',
        });
      }
    },
  );

  app.get<{ Params: { reportId: string } }>(
    '/api/comps/:reportId',
    { preHandler: [requireRole('properties.read')] },
    async (request, reply) => {
      const { reportId } = request.params;
      const report = await getCompReport(reportId);
      if (!report) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Report not found' });
      }
      return reply.send({ report });
    },
  );

  app.get<{ Params: { dominionLeadId: string } }>(
    '/api/comps/property/:dominionLeadId',
    { preHandler: [requireRole('properties.read')] },
    async (request, reply) => {
      const { dominionLeadId } = request.params;
      const reports = await getCompReportsForProperty(dominionLeadId);
      return reply.send({ reports });
    },
  );

  // ─── Analyze endpoint: generates/uses cached report + runs comp selector ───

  app.post<{ Params: { dominionLeadId: string }; Body: Record<string, unknown> }>(
    '/api/properties/:dominionLeadId/comps/analyze',
    { preHandler: [requireRole('properties.read')] },
    async (request, reply) => {
      if (!await isFeatureEnabled('comp_engine')) {
        return reply.code(403).send({
          error: 'FEATURE_DISABLED',
          message: 'Comp engine is not enabled. Enable it in Settings → Feature Flags.',
        });
      }

      if (!process.env.BATCHDATA_API_KEY) {
        return reply.code(503).send({
          error: 'NOT_CONFIGURED',
          message: 'BatchData API key not configured. Set BATCHDATA_API_KEY in .env',
        });
      }

      const { dominionLeadId } = request.params;
      const body = z.object({
        forceFresh: z.boolean().optional(),
        radiusMiles: z.number().min(0.1).max(10).optional(),
        searchMonths: z.number().int().min(1).max(24).optional(),
      }).parse(request.body ?? {});

      const [property] = await db
        .select()
        .from(properties)
        .where(eq(properties.dominionLeadId, dominionLeadId))
        .limit(1);

      if (!property) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Property not found' });
      }

      const subjectSqft = property.sqft ?? 0;

      let report;
      let cached = false;

      if (!body.forceFresh && await hasRecentCompReport(dominionLeadId)) {
        report = await getLatestCompReport(dominionLeadId);
        cached = true;
      }

      if (!report) {
        try {
          report = await generateCompReport({
            dominionLeadId,
            address: property.streetAddress ?? property.standardizedAddress ?? '',
            city: property.city ?? undefined,
            state: property.state ?? undefined,
            zip: property.zip ?? undefined,
            beds: property.bedrooms ?? undefined,
            baths: property.bathrooms ? parseFloat(property.bathrooms) : undefined,
            sqft: subjectSqft || undefined,
            lotSqft: property.lotSqft ?? undefined,
            yearBuilt: property.yearBuilt ?? undefined,
            radiusMiles: body.radiusMiles ?? 1.0,
            searchMonths: body.searchMonths ?? 12,
            generatedBy:
              (request as unknown as { user?: { name?: string } }).user?.name ?? 'admin',
          });
        } catch (err: unknown) {
          logger.error({ err, dominionLeadId }, 'Comp analysis failed');
          return reply.code(502).send({
            error: 'BATCHDATA_ERROR',
            message: err instanceof Error ? err.message : 'Failed to fetch comp data',
          });
        }
      }

      const rawComps: Comp[] = ((report!.comps ?? []) as BatchDataComp[]).map((c) => ({
        address: c.address,
        salePrice: c.salePriceCents / 100,
        saleDate: c.saleDate,
        sqft: c.sqft,
        beds: c.beds,
        baths: c.baths,
        yearBuilt: c.yearBuilt,
        distanceMiles: c.distanceMiles,
      }));

      const analysis = analyzeComps(subjectSqft, rawComps);

      return reply.send({
        success: true,
        cached,
        reportId: report!.id,
        subjectSqft,
        ...analysis,
        cachedAt: report!.createdAt,
      });
    },
  );
}
