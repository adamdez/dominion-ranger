import type { FastifyInstance } from 'fastify';
import { sql, eq, and, or, ilike, desc, asc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  properties,
  scoringRecords,
  leadInstances,
  distressEvents,
} from '../../db/schema/index.js';
import { requireRole } from '../middleware/auth.js';
import { z } from 'zod';

const exportProspectsQuery = z.object({
  tier: z.enum(['A', 'B', 'C', 'D', 'all']).optional(),
  county: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(['composite_score', 'equity_estimate', 'last_event', 'street_address', 'owner_name', 'county']).default('composite_score'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export async function exportRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/export/prospects — All matching prospects (no pagination)
  app.get<{ Querystring: Record<string, string> }>(
    '/api/export/prospects',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const query = exportProspectsQuery.parse(request.query);

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

      const activeLeads = db
        .select({
          dominionLeadId: leadInstances.dominionLeadId,
          leadInstanceId: leadInstances.leadInstanceId,
          leadStatus: leadInstances.status,
        })
        .from(leadInstances)
        .as('al');

      const eventCounts = db
        .select({
          dominionLeadId: distressEvents.dominionLeadId,
          signalCount: sql<number>`count(*)::int`.as('signal_count'),
          lastEventDate: sql<string>`max(${distressEvents.triggerEventDate})`.as('last_event_date'),
        })
        .from(distressEvents)
        .groupBy(distressEvents.dominionLeadId)
        .as('ec');

      const conditions = [];

      if (query.tier && query.tier !== 'all') {
        const tierRanges: Record<string, [number, number]> = {
          A: [65, 100],
          B: [45, 65],
          C: [25, 45],
          D: [0, 25],
        };
        const [min, max] = tierRanges[query.tier];
        conditions.push(sql`${latestScores.compositeScore} >= ${min}`);
        if (max < 100) {
          conditions.push(sql`${latestScores.compositeScore} < ${max}`);
        }
      }

      if (query.county) {
        conditions.push(eq(properties.county, query.county));
      }

      if (query.search) {
        conditions.push(
          or(
            ilike(properties.streetAddress, `%${query.search}%`),
            ilike(properties.ownerName, `%${query.search}%`),
          )!,
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const sortColumn =
        query.sort === 'composite_score' ? latestScores.compositeScore :
        query.sort === 'equity_estimate' ? properties.equityEstimate :
        query.sort === 'last_event' ? eventCounts.lastEventDate :
        query.sort === 'street_address' ? properties.streetAddress :
        query.sort === 'owner_name' ? properties.ownerName :
        query.sort === 'county' ? properties.county :
        latestScores.compositeScore;

      const orderFn = query.order === 'asc' ? asc : desc;

      const rows = await db
        .select({
          dominionLeadId: properties.dominionLeadId,
          streetAddress: properties.streetAddress,
          city: properties.city,
          state: properties.state,
          zip: properties.zip,
          county: properties.county,
          ownerName: properties.ownerName,
          phone: properties.phone,
          equityEstimate: properties.equityEstimate,
          mortgageStatus: properties.mortgageStatus,
          compositeScore: latestScores.compositeScore,
          leadInstanceId: activeLeads.leadInstanceId,
          signalCount: eventCounts.signalCount,
          lastEventDate: eventCounts.lastEventDate,
        })
        .from(properties)
        .leftJoin(latestScores, and(
          eq(latestScores.dominionLeadId, properties.dominionLeadId),
          eq(latestScores.rn, 1),
        ))
        .leftJoin(activeLeads, eq(activeLeads.dominionLeadId, properties.dominionLeadId))
        .leftJoin(eventCounts, eq(eventCounts.dominionLeadId, properties.dominionLeadId))
        .where(whereClause)
        .orderBy(orderFn(sortColumn));

      return rows;
    },
  );

  // GET /api/export/funnel/:stage — All matching leads in a funnel stage (no pagination)
  app.get<{ Params: { stage: string }; Querystring: Record<string, string> }>(
    '/api/export/funnel/:stage',
    { preHandler: [requireRole('properties.read')] },
    async (request, reply) => {
      const { stage } = request.params;
      const validStages = ['lead', 'paid_lead', 'negotiation', 'disposition'] as const;
      if (!validStages.includes(stage as typeof validStages[number])) {
        return reply.code(400).send({ error: 'INVALID_STAGE', message: `Invalid funnel stage: ${stage}` });
      }

      const query = z.object({
        search: z.string().optional(),
        sort: z.enum(['composite_score', 'updated_at', 'created_at']).default('composite_score'),
        order: z.enum(['asc', 'desc']).default('desc'),
        assignedToMe: z.enum(['true', 'false']).optional(),
      }).parse(request.query);

      const user = (request as unknown as Record<string, { userId: string; role: string }>).user;
      const isAdminOrManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';

      const conditions = [eq(leadInstances.funnelStage, stage)];
      if (query.assignedToMe === 'true') {
        conditions.push(eq(leadInstances.assignedTo, user.userId));
      } else if (!isAdminOrManager) {
        conditions.push(eq(leadInstances.assignedTo, user.userId));
      }
      if (query.search) {
        conditions.push(
          or(
            ilike(properties.streetAddress, `%${query.search}%`),
            ilike(properties.ownerName, `%${query.search}%`),
          )!,
        );
      }

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

      const rows = await db
        .select({
          leadInstanceId: leadInstances.leadInstanceId,
          dominionLeadId: leadInstances.dominionLeadId,
          funnelStage: leadInstances.funnelStage,
          assignedTo: leadInstances.assignedTo,
          createdAt: leadInstances.createdAt,
          updatedAt: leadInstances.updatedAt,
          streetAddress: properties.streetAddress,
          city: properties.city,
          county: properties.county,
          ownerName: properties.ownerName,
          phone: properties.phone,
          equityEstimate: properties.equityEstimate,
          compositeScore: latestScores.compositeScore,
        })
        .from(leadInstances)
        .innerJoin(properties, eq(leadInstances.dominionLeadId, properties.dominionLeadId))
        .leftJoin(latestScores, and(
          eq(latestScores.dominionLeadId, leadInstances.dominionLeadId),
          eq(latestScores.rn, 1),
        ))
        .where(whereClause)
        .orderBy(
          query.sort === 'composite_score'
            ? (query.order === 'asc' ? asc(latestScores.compositeScore) : desc(latestScores.compositeScore))
            : query.sort === 'created_at'
              ? (query.order === 'asc' ? asc(leadInstances.createdAt) : desc(leadInstances.createdAt))
              : (query.order === 'asc' ? asc(leadInstances.updatedAt) : desc(leadInstances.updatedAt))
        );

      return rows;
    },
  );
}
