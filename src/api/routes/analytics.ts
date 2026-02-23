/**
 * Analytics API routes.
 *
 * All endpoints read from pre-computed rollup tables (never raw activity_log).
 * Revenue truth = deals.assignment_fee_cents.
 * Charter §V: Analytics domain never mutates operational data.
 */
import type { FastifyInstance } from 'fastify';
import { eq, sql, and, gte, lte, desc } from 'drizzle-orm';
import { requireRole } from '../middleware/auth.js';
import { db } from '../../db/connection.js';
import {
  dailyMetrics,
  agentWeeklyMetrics,
  channelPerformanceMetrics,
  scoringPerformanceMetrics,
  weeklyFunnelMetrics,
  deals,
  activityLog,
} from '../../db/schema/index.js';
import { runNightlyRollup } from '../../jobs/nightly-rollup.js';
import { logger } from '../../config/logger.js';
import {
  dailyMetricsQuery,
  agentMetricsQuery,
  channelMetricsQuery,
  scoringPerformanceQuery,
  dealsQuery,
  rollupTriggerBody,
} from '../schemas/analytics.js';

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/analytics/daily — Daily metrics (single date or range)
  app.get(
    '/api/analytics/daily',
    { preHandler: [requireRole('pipeline.run')] },
    async (request, reply) => {
      const query = dailyMetricsQuery.parse(request.query);

      if (query.date) {
        const [row] = await db
          .select()
          .from(dailyMetrics)
          .where(eq(dailyMetrics.date, query.date));
        return reply.send(row ?? null);
      }

      const rows = await db
        .select()
        .from(dailyMetrics)
        .where(and(
          gte(dailyMetrics.date, query.from!),
          lte(dailyMetrics.date, query.to!),
        ))
        .orderBy(dailyMetrics.date);
      return reply.send({ data: rows, count: rows.length });
    },
  );

  // GET /api/analytics/pipeline — Current funnel counts from lead_instances
  app.get(
    '/api/analytics/pipeline',
    { preHandler: [requireRole('pipeline.run')] },
    async (_request, reply) => {
      const result = await db.execute(sql`
        SELECT status, COUNT(*)::int as count
        FROM lead_instances
        GROUP BY status
        ORDER BY
          CASE status
            WHEN 'PROMOTED' THEN 1 WHEN 'ASSIGNED' THEN 2
            WHEN 'COMPLIANCE_PENDING' THEN 3 WHEN 'DIAL_READY' THEN 4
            WHEN 'DIALING' THEN 5 WHEN 'CONTACTED' THEN 6
            WHEN 'OFFER_SENT' THEN 7 WHEN 'CONTRACTED' THEN 8
            WHEN 'CLOSED' THEN 9 WHEN 'DEAD' THEN 10
            ELSE 99
          END
      `);
      const rows = (result as unknown as { rows?: Record<string, unknown>[] }).rows ?? [];
      return reply.send({ stages: rows });
    },
  );

  // GET /api/analytics/agents — Agent weekly metrics
  app.get(
    '/api/analytics/agents',
    { preHandler: [requireRole('pipeline.run')] },
    async (request, reply) => {
      const { week } = agentMetricsQuery.parse(request.query);
      const rows = await db
        .select()
        .from(agentWeeklyMetrics)
        .where(eq(agentWeeklyMetrics.weekStart, week));
      return reply.send({ data: rows, weekStart: week });
    },
  );

  // GET /api/analytics/channels — Channel performance metrics
  app.get(
    '/api/analytics/channels',
    { preHandler: [requireRole('pipeline.run')] },
    async (request, reply) => {
      const { month } = channelMetricsQuery.parse(request.query);
      const periodStart = `${month}-01`;
      const rows = await db
        .select()
        .from(channelPerformanceMetrics)
        .where(eq(channelPerformanceMetrics.periodStart, periodStart));
      return reply.send({ data: rows, periodStart });
    },
  );

  // GET /api/analytics/scoring-performance — Scoring tier conversion rates
  app.get(
    '/api/analytics/scoring-performance',
    { preHandler: [requireRole('pipeline.run')] },
    async (request, reply) => {
      const { month } = scoringPerformanceQuery.parse(request.query);
      const periodStart = `${month}-01`;
      const rows = await db
        .select()
        .from(scoringPerformanceMetrics)
        .where(eq(scoringPerformanceMetrics.periodStart, periodStart));
      return reply.send({ data: rows, periodStart });
    },
  );

  // GET /api/analytics/deals — Deals with pagination
  app.get(
    '/api/analytics/deals',
    { preHandler: [requireRole('pipeline.run')] },
    async (request, reply) => {
      const query = dealsQuery.parse(request.query);
      const conditions = [];
      if (query.from) conditions.push(gte(deals.closeDate, query.from));
      if (query.to) conditions.push(lte(deals.closeDate, query.to));

      const [countResult] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(deals)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const rows = await db
        .select()
        .from(deals)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(deals.closeDate))
        .limit(query.limit)
        .offset(query.offset);

      return reply.send({
        data: rows,
        pagination: {
          total: countResult.total,
          limit: query.limit,
          offset: query.offset,
        },
      });
    },
  );

  // GET /api/analytics/revenue-pace — YTD revenue vs $1M pace
  app.get(
    '/api/analytics/revenue-pace',
    { preHandler: [requireRole('pipeline.run')] },
    async (_request, reply) => {
      const yearStart = `${new Date().getFullYear()}-01-01`;
      const [result] = await db
        .select({
          ytdRevenue: sql<number>`COALESCE(SUM(assignment_fee_cents), 0)::int`,
          dealCount: sql<number>`COUNT(*)::int`,
        })
        .from(deals)
        .where(and(
          gte(deals.closeDate, yearStart),
          eq(deals.status, 'CLOSED'),
        ));

      const ytdRevenue = result.ytdRevenue ?? 0;
      const dayOfYear = Math.floor((Date.now() - new Date(yearStart).getTime()) / 86400000);
      const targetCents = 100_000_000;
      const paceCents = dayOfYear > 0 ? Math.round((ytdRevenue / dayOfYear) * 365) : 0;
      const onPace = paceCents >= targetCents;

      return reply.send({
        ytdRevenueCents: ytdRevenue,
        dealCount: result.dealCount,
        annualizedPaceCents: paceCents,
        targetCents,
        onPace,
        dayOfYear,
      });
    },
  );

  // POST /api/analytics/rebuild-rollups — Manually trigger rollup rebuild
  app.post(
    '/api/analytics/rebuild-rollups',
    { preHandler: [requireRole('pipeline.run')] },
    async (request, reply) => {
      const body = rollupTriggerBody.parse(request.body ?? {});

      try {
        const result = await runNightlyRollup(body.date);
        return reply.send({ status: 'completed', ...result });
      } catch (err: unknown) {
        logger.error({ err }, 'Rollup rebuild failed');
        return reply.code(500).send({
          error: 'ROLLUP_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );
}
