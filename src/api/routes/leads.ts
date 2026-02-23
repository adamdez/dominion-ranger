import type { FastifyInstance } from 'fastify';
import { sql, eq, and, or, ilike, desc, asc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  leadInstances,
  properties,
  scoringRecords,
  distressEvents,
  LeadStatus,
} from '../../db/schema/index.js';
import {
  claimLead,
  runComplianceGating,
  transitionLead,
} from '../../modules/workflow/index.js';
import { logDisposition, getDispositions } from '../../modules/dispositions/index.js';
import { requireRole } from '../middleware/auth.js';
import { leadsListQuery, claimLeadBody, transitionLeadBody, dialQueueQuery } from '../schemas/leads.js';
import { paginate } from '../types.js';
import type { LeadStatusValue } from '../../db/schema/constants.js';
import { z } from 'zod';

const dispositionBody = z.object({
  disposition: z.enum([
    'NO_ANSWER', 'LEFT_VOICEMAIL', 'CALLBACK_REQUESTED',
    'NOT_INTERESTED', 'WRONG_NUMBER', 'DO_NOT_CALL',
    'INTERESTED', 'APPOINTMENT_SET',
  ]),
  notes: z.string().optional(),
});

export async function leadRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/leads — Paginated leads with property + score join
  app.get<{ Querystring: Record<string, string> }>(
    '/api/leads',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const query = leadsListQuery.parse(request.query);
      const offset = (query.page - 1) * query.pageSize;

      const conditions = [];
      if (query.status) {
        const statuses = query.status.split(',') as LeadStatusValue[];
        if (statuses.length === 1) {
          conditions.push(eq(leadInstances.status, statuses[0]));
        } else {
          conditions.push(or(...statuses.map(s => eq(leadInstances.status, s)))!);
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

      if (query.minScore !== undefined) {
        conditions.push(sql`${latestScores.compositeScore} >= ${query.minScore}`);
      }
      if (query.maxScore !== undefined) {
        conditions.push(sql`${latestScores.compositeScore} <= ${query.maxScore}`);
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const sortColumn = query.sortBy === 'compositeScore' ? latestScores.compositeScore
        : query.sortBy === 'ownerName' ? properties.ownerName
        : query.sortBy === 'streetAddress' ? properties.streetAddress
        : query.sortBy === 'status' ? leadInstances.status
        : query.sortBy === 'updatedAt' ? leadInstances.updatedAt
        : leadInstances.createdAt;

      const orderFn = query.sortOrder === 'asc' ? asc : desc;

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leadInstances)
        .innerJoin(properties, eq(leadInstances.dominionLeadId, properties.dominionLeadId))
        .leftJoin(latestScores, and(
          eq(latestScores.dominionLeadId, leadInstances.dominionLeadId),
          eq(latestScores.rn, 1),
        ))
        .where(whereClause);

      const rows = await db
        .select({
          leadInstanceId: leadInstances.leadInstanceId,
          dominionLeadId: leadInstances.dominionLeadId,
          status: leadInstances.status,
          assignedTo: leadInstances.assignedTo,
          complianceCleared: leadInstances.complianceCleared,
          version: leadInstances.version,
          createdAt: leadInstances.createdAt,
          updatedAt: leadInstances.updatedAt,
          notes: leadInstances.notes,
          streetAddress: properties.streetAddress,
          city: properties.city,
          county: properties.county,
          ownerName: properties.ownerName,
          phone: properties.phone,
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
        .orderBy(orderFn(sortColumn))
        .limit(query.pageSize)
        .offset(offset);

      return paginate(rows, countResult.count, query.page, query.pageSize);
    },
  );

  // GET /api/leads/:leadInstanceId — Single lead with property data
  app.get<{ Params: { leadInstanceId: string } }>(
    '/api/leads/:leadInstanceId',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const { leadInstanceId } = request.params;

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

      const [row] = await db
        .select({
          leadInstanceId: leadInstances.leadInstanceId,
          dominionLeadId: leadInstances.dominionLeadId,
          status: leadInstances.status,
          assignedTo: leadInstances.assignedTo,
          complianceCleared: leadInstances.complianceCleared,
          version: leadInstances.version,
          createdAt: leadInstances.createdAt,
          updatedAt: leadInstances.updatedAt,
          notes: leadInstances.notes,
          streetAddress: properties.streetAddress,
          city: properties.city,
          county: properties.county,
          ownerName: properties.ownerName,
          phone: properties.phone,
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
        .where(eq(leadInstances.leadInstanceId, leadInstanceId));

      if (!row) {
        return { error: 'NOT_FOUND', message: `Lead instance not found: ${leadInstanceId}` };
      }

      const [eventCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(distressEvents)
        .where(eq(distressEvents.dominionLeadId, row.dominionLeadId));

      return { ...row, eventCount: eventCount.count };
    },
  );

  // POST /api/leads/:leadInstanceId/claim — Claim a promoted lead
  app.post<{ Params: { leadInstanceId: string }; Body: { expectedVersion: number } }>(
    '/api/leads/:leadInstanceId/claim',
    { preHandler: [requireRole('workflow.write')] },
    async (request) => {
      const { leadInstanceId } = request.params;
      const { expectedVersion } = claimLeadBody.parse(request.body);
      const user = (request as unknown as Record<string, { userId: string }>).user;

      const instance = await claimLead({
        leadInstanceId,
        userId: user.userId,
        expectedVersion,
      });

      return instance;
    },
  );

  // POST /api/leads/:leadInstanceId/compliance — Run compliance gating
  app.post<{ Params: { leadInstanceId: string } }>(
    '/api/leads/:leadInstanceId/compliance',
    { preHandler: [requireRole('workflow.write')] },
    async (request) => {
      const { leadInstanceId } = request.params;
      const instance = await runComplianceGating(leadInstanceId);
      return instance;
    },
  );

  // POST /api/leads/:leadInstanceId/transition — Transition lead status
  app.post<{ Params: { leadInstanceId: string }; Body: { toStatus: string; expectedVersion: number; notes?: string } }>(
    '/api/leads/:leadInstanceId/transition',
    { preHandler: [requireRole('workflow.write')] },
    async (request) => {
      const { leadInstanceId } = request.params;
      const body = transitionLeadBody.parse(request.body);
      const user = (request as unknown as Record<string, { userId: string }>).user;

      const instance = await transitionLead({
        leadInstanceId,
        toStatus: body.toStatus as LeadStatusValue,
        expectedVersion: body.expectedVersion,
        userId: user.userId,
        notes: body.notes,
      });

      return instance;
    },
  );

  // GET /api/leads/stats — Lead status counts for dashboard
  app.get(
    '/api/leads/stats',
    { preHandler: [requireRole('properties.read')] },
    async () => {
      const statuses = await db
        .select({
          status: leadInstances.status,
          count: sql<number>`count(*)::int`,
        })
        .from(leadInstances)
        .groupBy(leadInstances.status);

      const total = statuses.reduce((sum, s) => sum + s.count, 0);
      const active = statuses
        .filter(s => s.status !== LeadStatus.CLOSED && s.status !== LeadStatus.DEAD)
        .reduce((sum, s) => sum + s.count, 0);
      const dialReady = statuses.find(s => s.status === LeadStatus.DIAL_READY)?.count ?? 0;
      const promoted = statuses.find(s => s.status === LeadStatus.PROMOTED)?.count ?? 0;

      const [closedThisMonth] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leadInstances)
        .where(
          and(
            eq(leadInstances.status, LeadStatus.CLOSED),
            sql`${leadInstances.closedAt} >= date_trunc('month', now())`,
          ),
        );

      const [staleResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leadInstances)
        .where(
          and(
            sql`${leadInstances.status} NOT IN ('CLOSED', 'DEAD')`,
            sql`${leadInstances.updatedAt} < now() - interval '5 days'`,
          ),
        );

      const recentActivity = await db
        .select({
          leadInstanceId: leadInstances.leadInstanceId,
          status: leadInstances.status,
          updatedAt: leadInstances.updatedAt,
        })
        .from(leadInstances)
        .orderBy(desc(leadInstances.updatedAt))
        .limit(10);

      return {
        total,
        active,
        dialReady,
        promoted,
        closedThisMonth: closedThisMonth.count,
        staleCount: staleResult.count,
        recentActivity,
        byStatus: statuses,
      };
    },
  );

  // GET /api/dial-queue — Dial-ready leads ordered by score
  app.get<{ Querystring: Record<string, string> }>(
    '/api/dial-queue',
    { preHandler: [requireRole('workflow.write')] },
    async (request) => {
      const query = dialQueueQuery.parse(request.query);
      const offset = (query.page - 1) * query.pageSize;

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

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leadInstances)
        .where(eq(leadInstances.status, LeadStatus.DIAL_READY));

      const rows = await db
        .select({
          leadInstanceId: leadInstances.leadInstanceId,
          dominionLeadId: leadInstances.dominionLeadId,
          status: leadInstances.status,
          assignedTo: leadInstances.assignedTo,
          complianceCleared: leadInstances.complianceCleared,
          version: leadInstances.version,
          createdAt: leadInstances.createdAt,
          updatedAt: leadInstances.updatedAt,
          notes: leadInstances.notes,
          streetAddress: properties.streetAddress,
          city: properties.city,
          county: properties.county,
          ownerName: properties.ownerName,
          phone: properties.phone,
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
        .where(eq(leadInstances.status, LeadStatus.DIAL_READY))
        .orderBy(desc(latestScores.compositeScore))
        .limit(query.pageSize)
        .offset(offset);

      return paginate(rows, countResult.count, query.page, query.pageSize);
    },
  );

  // POST /api/leads/:leadInstanceId/dispositions — Log a disposition
  app.post<{ Params: { leadInstanceId: string }; Body: { disposition: string; notes?: string } }>(
    '/api/leads/:leadInstanceId/dispositions',
    { preHandler: [requireRole('workflow.write')] },
    async (request) => {
      const { leadInstanceId } = request.params;
      const body = dispositionBody.parse(request.body);
      const user = (request as unknown as Record<string, { userId: string }>).user;

      const record = await logDisposition({
        leadInstanceId,
        disposition: body.disposition,
        notes: body.notes,
        userId: user.userId,
      });

      return record;
    },
  );

  // GET /api/leads/:leadInstanceId/dispositions — Get disposition history
  app.get<{ Params: { leadInstanceId: string } }>(
    '/api/leads/:leadInstanceId/dispositions',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const { leadInstanceId } = request.params;
      const records = await getDispositions(leadInstanceId);
      return records;
    },
  );
}
