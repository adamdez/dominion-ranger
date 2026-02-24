import type { FastifyInstance } from 'fastify';
import { sql, eq, and, or, ilike, desc, asc, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  leadInstances,
  properties,
  scoringRecords,
  distressEvents,
  tags,
  leadInstanceTags,
  activityLog,
  dispositions,
  callLogs,
  smsLogs,
  LeadStatus,
} from '../../db/schema/index.js';
import {
  claimLead,
  runComplianceGating,
  transitionLead,
} from '../../modules/workflow/index.js';
import { logDisposition, getDispositions } from '../../modules/dispositions/index.js';
import { createFollowUpFromDisposition } from '../../modules/cadence/index.js';
import { transitionDealStage } from '../../modules/deal-stage/index.js';
import { requireRole } from '../middleware/auth.js';
import { leadsListQuery, claimLeadBody, transitionLeadBody, dialQueueQuery } from '../schemas/leads.js';
import { transitionDealStageBody } from '../schemas/deal-stage.js';
import { paginate } from '../types.js';
import type { LeadStatusValue, DealStageValue } from '../../db/schema/constants.js';
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

  // GET /api/leads — Paginated leads with property + score join + tags + deal stage
  app.get<{ Querystring: Record<string, string> }>(
    '/api/leads',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const query = leadsListQuery.parse(request.query);
      const offset = (query.page - 1) * query.pageSize;

      const conditions = [];
      const user = (request as unknown as Record<string, { userId: string; role: string }>).user;
      const userId = user?.userId ?? 'admin-bootstrap';
      const isAdminOrManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';
      if (!isAdminOrManager) {
        conditions.push(eq(leadInstances.assignedTo, userId));
      } else if (query.view === 'mine') {
        conditions.push(eq(leadInstances.assignedTo, userId));
      } else if (query.view === 'unassigned') {
        conditions.push(isNull(leadInstances.assignedTo));
      }
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
      if (query.dealStage) {
        const stages = query.dealStage.split(',');
        if (stages.length === 1) {
          conditions.push(eq(leadInstances.dealStage, stages[0]));
        } else {
          conditions.push(inArray(leadInstances.dealStage, stages));
        }
      }
      if (query.hasPhone === 'true') {
        conditions.push(sql`${properties.phone} IS NOT NULL AND ${properties.phone} != ''`);
      } else if (query.hasPhone === 'false') {
        conditions.push(sql`(${properties.phone} IS NULL OR ${properties.phone} = '')`);
      }
      if (query.tags) {
        const tagNames = query.tags.split(',');
        conditions.push(
          sql`${leadInstances.leadInstanceId} IN (
            SELECT lit.lead_instance_id FROM lead_instance_tags lit
            INNER JOIN tags t ON t.id = lit.tag_id
            WHERE t.name = ANY(${tagNames})
          )`,
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
        : query.sortBy === 'dealStage' ? leadInstances.dealStage
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
          dealStage: leadInstances.dealStage,
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
          phone2: properties.phone2,
          phone3: properties.phone3,
          phoneType: properties.phoneType,
          phone2Type: properties.phone2Type,
          phone3Type: properties.phone3Type,
          email: properties.email,
          email2: properties.email2,
          skipTraceTier: properties.skipTraceTier,
          skipTracedAt: properties.skipTracedAt,
          skipTraceSource: properties.skipTraceSource,
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

      if (rows.length === 0) {
        return paginate(rows, countResult.count, query.page, query.pageSize);
      }

      const leadIds = rows.map(r => r.leadInstanceId);
      const dominionIds = rows.map(r => r.dominionLeadId);

      const [tagRows, activityRows, signalRows] = await Promise.all([
        db
          .select({
            leadInstanceId: leadInstanceTags.leadInstanceId,
            tagName: tags.name,
            tagColor: tags.color,
          })
          .from(leadInstanceTags)
          .innerJoin(tags, eq(leadInstanceTags.tagId, tags.id))
          .where(inArray(leadInstanceTags.leadInstanceId, leadIds)),

        db.execute(sql`
          SELECT DISTINCT ON (lead_instance_id)
            lead_instance_id, activity_type, channel, occurred_at
          FROM activity_log
          WHERE lead_instance_id = ANY(${leadIds})
          ORDER BY lead_instance_id, occurred_at DESC
        `),

        db.execute(sql`
          SELECT dominion_lead_id, array_agg(DISTINCT event_type ORDER BY event_type) as top_signals
          FROM (
            SELECT dominion_lead_id, event_type
            FROM distress_events
            WHERE dominion_lead_id = ANY(${dominionIds})
          ) sub
          GROUP BY dominion_lead_id
        `),
      ]);

      const tagsByLead = new Map<string, Array<{ name: string; color: string | null }>>();
      for (const row of tagRows) {
        const list = tagsByLead.get(row.leadInstanceId) ?? [];
        list.push({ name: row.tagName, color: row.tagColor });
        tagsByLead.set(row.leadInstanceId, list);
      }

      const activityByLead = new Map<string, { type: string; channel: string; occurredAt: unknown }>();
      const activityResults = activityRows.rows as Array<Record<string, unknown>>;
      for (const row of activityResults) {
        activityByLead.set(row.lead_instance_id as string, {
          type: row.activity_type as string,
          channel: row.channel as string,
          occurredAt: row.occurred_at,
        });
      }

      const signalsByProperty = new Map<string, string[]>();
      const signalResults = signalRows.rows as Array<Record<string, unknown>>;
      for (const row of signalResults) {
        signalsByProperty.set(
          row.dominion_lead_id as string,
          (row.top_signals as string[]) ?? [],
        );
      }

      const enrichedRows = rows.map(r => ({
        ...r,
        tags: tagsByLead.get(r.leadInstanceId) ?? [],
        lastActivity: activityByLead.get(r.leadInstanceId) ?? null,
        topSignals: signalsByProperty.get(r.dominionLeadId) ?? [],
      }));

      return paginate(enrichedRows, countResult.count, query.page, query.pageSize);
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
          phone2: properties.phone2,
          phone3: properties.phone3,
          phoneType: properties.phoneType,
          phone2Type: properties.phone2Type,
          phone3Type: properties.phone3Type,
          email: properties.email,
          email2: properties.email2,
          skipTraceTier: properties.skipTraceTier,
          skipTracedAt: properties.skipTracedAt,
          skipTraceSource: properties.skipTraceSource,
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
    async (request) => {
      const user = (request as unknown as Record<string, { userId: string; role: string }>).user;
      const isAdminOrManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';

      const statsConditions = [];
      if (!isAdminOrManager) {
        statsConditions.push(eq(leadInstances.assignedTo, user.userId));
      }
      const statsWhere = statsConditions.length > 0 ? and(...statsConditions) : undefined;

      const statuses = await db
        .select({
          status: leadInstances.status,
          count: sql<number>`count(*)::int`,
        })
        .from(leadInstances)
        .where(statsWhere)
        .groupBy(leadInstances.status);

      const total = statuses.reduce((sum, s) => sum + s.count, 0);
      const active = statuses
        .filter(s => s.status !== LeadStatus.CLOSED && s.status !== LeadStatus.DEAD)
        .reduce((sum, s) => sum + s.count, 0);
      const dialReady = statuses.find(s => s.status === LeadStatus.DIAL_READY)?.count ?? 0;
      const promoted = statuses.find(s => s.status === LeadStatus.PROMOTED)?.count ?? 0;

      const closedConditions = [
        eq(leadInstances.status, LeadStatus.CLOSED),
        sql`${leadInstances.closedAt} >= date_trunc('month', now())`,
      ];
      if (!isAdminOrManager) {
        closedConditions.push(eq(leadInstances.assignedTo, user.userId));
      }
      const [closedThisMonth] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leadInstances)
        .where(and(...closedConditions));

      return {
        total,
        active,
        dialReady,
        promoted,
        closedThisMonth: closedThisMonth.count,
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
      const dqUser = (request as unknown as Record<string, { userId: string; role: string }>).user;
      const dqIsAdminOrManager = dqUser?.role === 'ADMIN' || dqUser?.role === 'MANAGER';

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

      const dqConditions = [eq(leadInstances.status, LeadStatus.DIAL_READY)];
      if (!dqIsAdminOrManager) {
        dqConditions.push(eq(leadInstances.assignedTo, dqUser.userId));
      }
      const dqWhere = and(...dqConditions);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leadInstances)
        .where(dqWhere);

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
          phone2: properties.phone2,
          phone3: properties.phone3,
          phoneType: properties.phoneType,
          email: properties.email,
          skipTraceTier: properties.skipTraceTier,
          skipTracedAt: properties.skipTracedAt,
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
        .where(dqWhere)
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

      // Auto-create follow-up task via cadence engine
      const [lead] = await db
        .select({
          dominionLeadId: leadInstances.dominionLeadId,
          assignedTo: leadInstances.assignedTo,
        })
        .from(leadInstances)
        .where(eq(leadInstances.leadInstanceId, leadInstanceId))
        .limit(1);

      if (lead) {
        const [dispoCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(dispositions)
          .where(eq(dispositions.leadInstanceId, leadInstanceId));

        await createFollowUpFromDisposition({
          leadInstanceId,
          dominionLeadId: lead.dominionLeadId,
          disposition: body.disposition,
          assignedTo: lead.assignedTo ?? user.userId,
          currentAttempt: dispoCount.count,
        });
      }

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

  // PATCH /api/leads/:leadInstanceId/deal-stage — Kanban drag-and-drop
  app.patch<{ Params: { leadInstanceId: string }; Body: { stage: string } }>(
    '/api/leads/:leadInstanceId/deal-stage',
    { preHandler: [requireRole('workflow.write')] },
    async (request) => {
      const { leadInstanceId } = request.params;
      const { stage } = transitionDealStageBody.parse(request.body);
      const user = (request as unknown as Record<string, { userId: string }>).user;
      return transitionDealStage(leadInstanceId, stage as DealStageValue, user.userId);
    },
  );

  // PATCH /api/leads/bulk-assign
  app.patch(
    '/api/leads/bulk-assign',
    { preHandler: [requireRole('workflow.write')] },
    async (request) => {
      const body = z.object({
        leadInstanceIds: z.array(z.string().uuid()).min(1).max(500),
        assignedTo: z.string().min(1),
      }).parse(request.body);

      let updated = 0;
      for (const id of body.leadInstanceIds) {
        try {
          await db.update(leadInstances)
            .set({ assignedTo: body.assignedTo, updatedAt: new Date() })
            .where(eq(leadInstances.leadInstanceId, id));
          updated++;
        } catch {
          // Individual failures don't block others
        }
      }
      return { updated };
    },
  );

  // GET /api/leads/:leadInstanceId/notes
  app.get<{ Params: { leadInstanceId: string } }>(
    '/api/leads/:leadInstanceId/notes',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const { leadInstanceId } = request.params;
      const rows = await db
        .select({
          activityId: activityLog.activityId,
          meta: activityLog.meta,
          userId: activityLog.userId,
          occurredAt: activityLog.occurredAt,
        })
        .from(activityLog)
        .where(and(
          eq(activityLog.leadInstanceId, leadInstanceId),
          eq(activityLog.activityType, 'NOTE_ADDED'),
        ))
        .orderBy(desc(activityLog.occurredAt))
        .limit(100);

      return rows.map((r) => ({
        activityId: r.activityId,
        text: (r.meta as Record<string, unknown>)?.text ?? '',
        createdBy: r.userId,
        createdAt: r.occurredAt,
      }));
    },
  );

  // POST /api/leads/:leadInstanceId/notes
  app.post<{ Params: { leadInstanceId: string } }>(
    '/api/leads/:leadInstanceId/notes',
    { preHandler: [requireRole('workflow.write')] },
    async (request) => {
      const { leadInstanceId } = request.params;
      const body = z.object({ text: z.string().min(1).max(5000) }).parse(request.body);
      const user = (request as unknown as Record<string, { userId: string }>).user;

      const [lead] = await db
        .select({ dominionLeadId: leadInstances.dominionLeadId })
        .from(leadInstances)
        .where(eq(leadInstances.leadInstanceId, leadInstanceId))
        .limit(1);

      if (!lead) {
        return { error: 'NOT_FOUND', message: 'Lead instance not found' };
      }

      const [row] = await db.insert(activityLog).values({
        dominionLeadId: lead.dominionLeadId,
        leadInstanceId,
        userId: user?.userId ?? 'system',
        activityType: 'NOTE_ADDED',
        channel: 'MANUAL_SMS',
        meta: { text: body.text },
      }).returning();

      return {
        activityId: row.activityId,
        text: body.text,
        createdBy: row.userId,
        createdAt: row.occurredAt,
      };
    },
  );

  // GET /api/leads/:leadInstanceId/history — Unified timeline of calls, SMS, dispositions, activity
  app.get<{ Params: { leadInstanceId: string } }>(
    '/api/leads/:leadInstanceId/history',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const { leadInstanceId } = request.params;

      const [lead] = await db
        .select({ dominionLeadId: leadInstances.dominionLeadId })
        .from(leadInstances)
        .where(eq(leadInstances.leadInstanceId, leadInstanceId))
        .limit(1);

      if (!lead) return [];
      const dlid = lead.dominionLeadId;

      const [calls, messages, dispos, activities] = await Promise.all([
        db
          .select({
            id: callLogs.id,
            direction: callLogs.direction,
            toPhone: callLogs.toPhone,
            status: callLogs.status,
            durationSeconds: callLogs.durationSeconds,
            startedAt: callLogs.startedAt,
            userId: callLogs.userId,
          })
          .from(callLogs)
          .where(eq(callLogs.dominionLeadId, dlid))
          .orderBy(desc(callLogs.startedAt))
          .limit(50),
        db
          .select({
            id: smsLogs.id,
            direction: smsLogs.direction,
            toPhone: smsLogs.toPhone,
            body: smsLogs.body,
            status: smsLogs.status,
            createdAt: smsLogs.createdAt,
            userId: smsLogs.userId,
          })
          .from(smsLogs)
          .where(eq(smsLogs.dominionLeadId, dlid))
          .orderBy(desc(smsLogs.createdAt))
          .limit(50),
        db
          .select({
            id: dispositions.id,
            disposition: dispositions.disposition,
            notes: dispositions.notes,
            createdBy: dispositions.createdBy,
            createdAt: dispositions.createdAt,
          })
          .from(dispositions)
          .where(eq(dispositions.leadInstanceId, leadInstanceId))
          .orderBy(desc(dispositions.createdAt))
          .limit(50),
        db
          .select({
            activityId: activityLog.activityId,
            activityType: activityLog.activityType,
            channel: activityLog.channel,
            outcome: activityLog.outcome,
            occurredAt: activityLog.occurredAt,
            userId: activityLog.userId,
            meta: activityLog.meta,
          })
          .from(activityLog)
          .where(eq(activityLog.dominionLeadId, dlid))
          .orderBy(desc(activityLog.occurredAt))
          .limit(50),
      ]);

      type TimelineItem = {
        type: 'call' | 'sms' | 'disposition' | 'status_change';
        summary: string;
        notes: string | null;
        timestamp: string;
        userId: string | null;
      };

      const timeline: TimelineItem[] = [];

      for (const c of calls) {
        timeline.push({
          type: 'call',
          summary: `${c.direction === 'OUTBOUND' ? 'Outbound' : 'Inbound'} call to ${c.toPhone ?? 'unknown'} — ${c.status}${c.durationSeconds ? ` (${c.durationSeconds}s)` : ''}`,
          notes: null,
          timestamp: c.startedAt?.toISOString() ?? new Date().toISOString(),
          userId: c.userId,
        });
      }

      for (const m of messages) {
        timeline.push({
          type: 'sms',
          summary: `${m.direction === 'OUTBOUND' ? 'Sent' : 'Received'} SMS to ${m.toPhone ?? 'unknown'} — ${m.status}`,
          notes: m.body,
          timestamp: m.createdAt?.toISOString() ?? new Date().toISOString(),
          userId: m.userId,
        });
      }

      for (const d of dispos) {
        timeline.push({
          type: 'disposition',
          summary: `Disposition: ${d.disposition}`,
          notes: d.notes,
          timestamp: d.createdAt?.toISOString() ?? new Date().toISOString(),
          userId: d.createdBy,
        });
      }

      for (const a of activities) {
        timeline.push({
          type: 'status_change',
          summary: `${a.activityType} via ${a.channel}${a.outcome ? ` → ${a.outcome}` : ''}`,
          notes: (a.meta as Record<string, unknown>)?.text as string ?? null,
          timestamp: a.occurredAt?.toISOString() ?? new Date().toISOString(),
          userId: a.userId,
        });
      }

      timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return timeline.slice(0, 100);
    },
  );
}
