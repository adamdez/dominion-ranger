import type { FastifyInstance } from 'fastify';
import { sql, eq, and } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { leadInstances, properties } from '../../db/schema/index.js';
import { logActivity } from '../../modules/analytics/activity-logger.js';
import { requireRole } from '../middleware/auth.js';
import { logger } from '../../config/logger.js';
import { z } from 'zod';

type FunnelStage = 'prospect' | 'lead' | 'paid_lead' | 'negotiation' | 'disposition' | 'declined';

const VALID_TRANSITIONS: Record<string, string[]> = {
  prospect: ['lead', 'paid_lead'],
  lead: ['negotiation'],
  paid_lead: ['negotiation'],
  negotiation: ['disposition'],
  declined: ['lead'],
};

const STAGE_LABELS: Record<string, string> = {
  prospect: 'Prospects',
  lead: 'Leads',
  paid_lead: 'Paid Leads',
  negotiation: 'Negotiation',
  disposition: 'Disposition',
  declined: 'Declined',
};

const advanceBody = z.object({
  leadInstanceId: z.string().uuid(),
  targetStage: z.enum(['lead', 'paid_lead', 'negotiation', 'disposition']),
  offerAmountCents: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

const declineBody = z.object({
  leadInstanceId: z.string().uuid(),
  notes: z.string().optional(),
});

const funnelLeadsQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
});

const funnelStatsSchema = z.object({}).optional();
void funnelStatsSchema;

export async function funnelRoutes(app: FastifyInstance): Promise<void> {

  // POST /api/funnel/advance
  app.post<{ Body: Record<string, unknown> }>(
    '/api/funnel/advance',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      const { leadInstanceId, targetStage, offerAmountCents, notes } = advanceBody.parse(request.body);
      const user = (request as unknown as Record<string, { userId: string }>).user;

      const [lead] = await db
        .select({
          leadInstanceId: leadInstances.leadInstanceId,
          dominionLeadId: leadInstances.dominionLeadId,
          funnelStage: leadInstances.funnelStage,
        })
        .from(leadInstances)
        .where(eq(leadInstances.leadInstanceId, leadInstanceId))
        .limit(1);

      if (!lead) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Lead instance not found' });
      }

      const currentStage = lead.funnelStage as FunnelStage;
      const allowed = VALID_TRANSITIONS[currentStage] ?? [];
      if (!allowed.includes(targetStage)) {
        return reply.code(400).send({
          error: 'INVALID_TRANSITION',
          message: `Cannot move from ${STAGE_LABELS[currentStage]} to ${STAGE_LABELS[targetStage]}`,
        });
      }

      if (targetStage === 'negotiation' && !offerAmountCents) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: 'offerAmountCents is required when moving to negotiation',
        });
      }

      await db
        .update(leadInstances)
        .set({
          funnelStage: targetStage,
          previousFunnelStage: currentStage,
          updatedAt: new Date(),
        })
        .where(eq(leadInstances.leadInstanceId, leadInstanceId));

      logActivity({
        dominionLeadId: lead.dominionLeadId,
        leadInstanceId,
        userId: user.userId,
        activityType: 'STATUS_CHANGED',
        channel: 'OUTBOUND_COLD',
        meta: {
          action: 'funnel_advance',
          fromStage: currentStage,
          toStage: targetStage,
          offerAmountCents,
          notes,
        },
      }).catch((err) => logger.warn({ err }, 'Failed to log funnel advance'));

      const [updated] = await db
        .select()
        .from(leadInstances)
        .where(eq(leadInstances.leadInstanceId, leadInstanceId))
        .limit(1);

      return updated;
    },
  );

  // POST /api/funnel/decline
  app.post<{ Body: Record<string, unknown> }>(
    '/api/funnel/decline',
    { preHandler: [requireRole('workflow.write')] },
    async (request, reply) => {
      const { leadInstanceId, notes } = declineBody.parse(request.body);
      const user = (request as unknown as Record<string, { userId: string }>).user;

      const [lead] = await db
        .select({
          leadInstanceId: leadInstances.leadInstanceId,
          dominionLeadId: leadInstances.dominionLeadId,
          funnelStage: leadInstances.funnelStage,
          declinedCount: leadInstances.declinedCount,
        })
        .from(leadInstances)
        .where(eq(leadInstances.leadInstanceId, leadInstanceId))
        .limit(1);

      if (!lead) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Lead instance not found' });
      }

      const currentStage = lead.funnelStage;
      if (currentStage === 'prospect' || currentStage === 'disposition') {
        return reply.code(400).send({
          error: 'INVALID_TRANSITION',
          message: `Cannot decline from ${STAGE_LABELS[currentStage]}`,
        });
      }

      await db
        .update(leadInstances)
        .set({
          funnelStage: 'declined',
          previousFunnelStage: currentStage,
          declinedAt: new Date(),
          declinedCount: (lead.declinedCount ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(leadInstances.leadInstanceId, leadInstanceId));

      logActivity({
        dominionLeadId: lead.dominionLeadId,
        leadInstanceId,
        userId: user.userId,
        activityType: 'STATUS_CHANGED',
        channel: 'OUTBOUND_COLD',
        meta: {
          action: 'funnel_decline',
          fromStage: currentStage,
          notes,
        },
      }).catch((err) => logger.warn({ err }, 'Failed to log funnel decline'));

      const [updated] = await db
        .select()
        .from(leadInstances)
        .where(eq(leadInstances.leadInstanceId, leadInstanceId))
        .limit(1);

      return updated;
    },
  );

  // GET /api/funnel/stats — counts per funnel stage
  app.get(
    '/api/funnel/stats',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const user = (request as unknown as Record<string, { userId: string; role: string }>).user;
      const isAdminOrManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';

      const conditions = isAdminOrManager
        ? sql`1=1`
        : eq(leadInstances.assignedTo, user.userId);

      const rows = await db
        .select({
          funnelStage: leadInstances.funnelStage,
          count: sql<number>`count(*)::int`,
        })
        .from(leadInstances)
        .where(conditions)
        .groupBy(leadInstances.funnelStage);

      const totalProperties = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(properties);

      const stageMap: Record<string, number> = {};
      for (const row of rows) {
        stageMap[row.funnelStage] = row.count;
      }

      return {
        prospects: totalProperties[0]?.count ?? 0,
        leads: stageMap['lead'] ?? 0,
        paidLeads: stageMap['paid_lead'] ?? 0,
        negotiation: stageMap['negotiation'] ?? 0,
        disposition: stageMap['disposition'] ?? 0,
        declined: stageMap['declined'] ?? 0,
      };
    },
  );

  // GET /api/funnel/leads/:stage — leads in a specific funnel stage
  app.get<{ Params: { stage: string }; Querystring: Record<string, string> }>(
    '/api/funnel/leads/:stage',
    { preHandler: [requireRole('properties.read')] },
    async (request, reply) => {
      const { stage } = request.params;
      const validStages = ['prospect', 'lead', 'paid_lead', 'negotiation', 'disposition', 'declined'];
      if (!validStages.includes(stage)) {
        return reply.code(400).send({ error: 'INVALID_STAGE', message: `Invalid funnel stage: ${stage}` });
      }

      const query = funnelLeadsQuery.parse(request.query);
      const offset = (query.page - 1) * query.pageSize;

      const user = (request as unknown as Record<string, { userId: string; role: string }>).user;
      const isAdminOrManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';

      const conditions = [eq(leadInstances.funnelStage, stage)];
      if (!isAdminOrManager) {
        conditions.push(eq(leadInstances.assignedTo, user.userId));
      }
      if (query.search) {
        const { ilike, or } = await import('drizzle-orm');
        conditions.push(
          or(
            ilike(properties.streetAddress, `%${query.search}%`),
            ilike(properties.ownerName, `%${query.search}%`),
          )!,
        );
      }

      const { scoringRecords } = await import('../../db/schema/index.js');

      const latestScores = db
        .select({
          dominionLeadId: scoringRecords.dominionLeadId,
          compositeScore: scoringRecords.compositeScore,
          motivationScore: scoringRecords.motivationScore,
          dealScore: scoringRecords.dealScore,
          confidenceScore: scoringRecords.confidenceScore,
          rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${scoringRecords.dominionLeadId} ORDER BY ${scoringRecords.createdAt} DESC)`.as('rn'),
        })
        .from(scoringRecords)
        .as('ls');

      const whereClause = and(...conditions);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leadInstances)
        .innerJoin(properties, eq(leadInstances.dominionLeadId, properties.dominionLeadId))
        .where(whereClause);

      const rows = await db
        .select({
          leadInstanceId: leadInstances.leadInstanceId,
          dominionLeadId: leadInstances.dominionLeadId,
          status: leadInstances.status,
          funnelStage: leadInstances.funnelStage,
          assignedTo: leadInstances.assignedTo,
          complianceCleared: leadInstances.complianceCleared,
          version: leadInstances.version,
          declinedCount: leadInstances.declinedCount,
          declinedAt: leadInstances.declinedAt,
          previousFunnelStage: leadInstances.previousFunnelStage,
          notes: leadInstances.notes,
          createdAt: leadInstances.createdAt,
          updatedAt: leadInstances.updatedAt,
          streetAddress: properties.streetAddress,
          city: properties.city,
          county: properties.county,
          ownerName: properties.ownerName,
          phone: properties.phone,
          phone2: properties.phone2,
          phone3: properties.phone3,
          phoneType: properties.phoneType,
          email: properties.email,
          equityEstimate: properties.equityEstimate,
          compositeScore: latestScores.compositeScore,
          motivationScore: latestScores.motivationScore,
          dealScore: latestScores.dealScore,
          confidenceScore: latestScores.confidenceScore,
        })
        .from(leadInstances)
        .innerJoin(properties, eq(leadInstances.dominionLeadId, properties.dominionLeadId))
        .leftJoin(latestScores, and(
          eq(latestScores.dominionLeadId, leadInstances.dominionLeadId),
          eq(latestScores.rn, 1),
        ))
        .where(whereClause)
        .orderBy(sql`${leadInstances.updatedAt} DESC`)
        .limit(query.pageSize)
        .offset(offset);

      const { paginate } = await import('../types.js');
      return paginate(rows, countResult.count, query.page, query.pageSize);
    },
  );
}
