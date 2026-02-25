import type { FastifyInstance } from 'fastify';
import { sql, eq, and, or, ilike, desc, asc, inArray } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  properties,
  scoringRecords,
  leadInstances,
  distressEvents,
  LeadStatus,
} from '../../db/schema/index.js';
import { createLeadInstance } from '../../modules/workflow/index.js';
import { logActivity } from '../../modules/analytics/activity-logger.js';
import { requireRole } from '../middleware/auth.js';
import { paginate } from '../types.js';
import { logger } from '../../config/logger.js';
import { z } from 'zod';

const prospectsListQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.enum(['composite_score', 'equity_estimate', 'last_event', 'street_address', 'owner_name', 'county']).default('composite_score'),
  order: z.enum(['asc', 'desc']).default('desc'),
  tier: z.enum(['A', 'B', 'C', 'D', 'all']).optional(),
  county: z.string().optional(),
  search: z.string().optional(),
});

const promoteBody = z.object({
  propertyIds: z.array(z.string().uuid()).min(1).max(100),
});

export async function prospectRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/prospects — Paginated property list with scores + promoted status
  app.get<{ Querystring: Record<string, string> }>(
    '/api/prospects',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const query = prospectsListQuery.parse(request.query);
      const offset = (query.page - 1) * query.limit;

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
        .where(
          sql`${leadInstances.status} NOT IN (${LeadStatus.CLOSED}, ${LeadStatus.DEAD})`,
        )
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

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(properties)
        .leftJoin(latestScores, and(
          eq(latestScores.dominionLeadId, properties.dominionLeadId),
          eq(latestScores.rn, 1),
        ))
        .where(whereClause);

      const rows = await db
        .select({
          dominionLeadId: properties.dominionLeadId,
          propertyId: properties.propertyId,
          streetAddress: properties.streetAddress,
          city: properties.city,
          state: properties.state,
          zip: properties.zip,
          county: properties.county,
          ownerName: properties.ownerName,
          phone: properties.phone,
          equityEstimate: properties.equityEstimate,
          absenteeOwner: properties.absenteeOwner,
          mortgageStatus: properties.mortgageStatus,
          compositeScore: latestScores.compositeScore,
          motivationScore: latestScores.motivationScore,
          dealScore: latestScores.dealScore,
          confidenceScore: latestScores.confidenceScore,
          leadInstanceId: activeLeads.leadInstanceId,
          leadStatus: activeLeads.leadStatus,
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
        .orderBy(orderFn(sortColumn))
        .limit(query.limit)
        .offset(offset);

      return paginate(rows, countResult.count, query.page, query.limit);
    },
  );

  // GET /api/prospects/counties — Distinct county list for filter dropdown
  app.get(
    '/api/prospects/counties',
    { preHandler: [requireRole('properties.read')] },
    async () => {
      const rows = await db
        .selectDistinct({ county: properties.county })
        .from(properties)
        .where(sql`${properties.county} IS NOT NULL`)
        .orderBy(asc(properties.county));

      return rows.map(r => r.county).filter(Boolean);
    },
  );

  // POST /api/prospects/promote — Manual batch promotion
  app.post<{ Body: Record<string, unknown> }>(
    '/api/prospects/promote',
    { preHandler: [requireRole('workflow.write')] },
    async (request) => {
      const { propertyIds } = promoteBody.parse(request.body);
      const user = (request as unknown as Record<string, { userId: string }>).user;

      let promoted = 0;
      let skipped = 0;
      let errors = 0;

      for (const propId of propertyIds) {
        try {
          // propId could be dominionLeadId or propertyId, resolve to dominionLeadId
          const [prop] = await db
            .select({ dominionLeadId: properties.dominionLeadId })
            .from(properties)
            .where(
              or(
                eq(properties.dominionLeadId, propId),
                eq(properties.propertyId, propId),
              ),
            )
            .limit(1);

          if (!prop) {
            errors++;
            continue;
          }

          // Check if already has an active lead instance
          const [existing] = await db
            .select({ id: leadInstances.leadInstanceId })
            .from(leadInstances)
            .where(
              and(
                eq(leadInstances.dominionLeadId, prop.dominionLeadId),
                sql`${leadInstances.status} NOT IN (${LeadStatus.CLOSED}, ${LeadStatus.DEAD})`,
              ),
            )
            .limit(1);

          if (existing) {
            skipped++;
            continue;
          }

          await createLeadInstance({
            dominionLeadId: prop.dominionLeadId,
            promotionId: prop.dominionLeadId, // Use dominionLeadId as pseudo-promotionId for manual promotes
          });

          await logActivity({
            dominionLeadId: prop.dominionLeadId,
            userId: user.userId,
            activityType: 'LEAD_PROMOTED',
            channel: 'MANUAL_EMAIL',
            meta: { action: 'manual_promotion', source: 'prospects_page' },
          }).catch((err) => logger.warn({ err }, 'Failed to log manual promotion'));

          promoted++;
        } catch (err) {
          logger.error({ err, propId }, 'Failed to promote property');
          errors++;
        }
      }

      return { promoted, skipped, errors };
    },
  );
}
