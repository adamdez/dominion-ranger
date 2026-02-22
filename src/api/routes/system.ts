import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { checkDatabaseConnection } from '../../db/connection.js';
import {
  properties,
  distressEvents,
  scoringRecords,
  promotedLeads,
  EventLayer,
} from '../../db/schema/index.js';
import { getPropertyCount } from '../../modules/properties/index.js';
import { requireRole } from '../middleware/auth.js';
import { BUSINESS_RULES } from '../../config/business-rules.js';
import { topLeadsQuery } from '../schemas/system.js';

export async function systemRoutes(app: FastifyInstance): Promise<void> {

  // GET /health — Health check (no auth required)
  app.get('/health', async () => {
    const dbHealthy = await checkDatabaseConnection();

    return {
      status: dbHealthy ? 'ok' : 'degraded',
      service: 'dominion-ranger',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbHealthy ? 'ok' : 'error',
      },
    };
  });

  // GET /api/system/stats — Full intelligence dashboard metrics
  app.get('/api/system/stats', async () => {
    const propertyCount = await getPropertyCount();

    // Event counts by layer
    const eventStats = await db
      .select({
        eventLayer: distressEvents.eventLayer,
        count: sql<number>`count(*)::int`,
      })
      .from(distressEvents)
      .groupBy(distressEvents.eventLayer);

    const confirmedEvents = eventStats.find((e) => e.eventLayer === EventLayer.CONFIRMED)?.count ?? 0;
    const predictiveEvents = eventStats.find((e) => e.eventLayer === EventLayer.PREDICTIVE)?.count ?? 0;

    // Event counts by type (top 10)
    const eventsByType = await db
      .select({
        eventType: distressEvents.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(distressEvents)
      .groupBy(distressEvents.eventType)
      .orderBy(sql`count(*) DESC`)
      .limit(BUSINESS_RULES.system.topEventTypesLimit);

    // Scoring distribution
    const scoringStats = await db
      .select({
        totalScored: sql<number>`count(distinct dominion_lead_id)::int`,
        avgScore: sql<number>`round(avg(composite_score)::numeric, 2)::float`,
        maxScore: sql<number>`max(composite_score)::float`,
        minScore: sql<number>`min(composite_score)::float`,
      })
      .from(scoringRecords);

    // Promoted leads count
    const [promotedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(promotedLeads);

    // Absentee owner count
    const [absenteeCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(properties)
      .where(sql`absentee_owner = true`);

    // Properties with contact info
    const [withPhone] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(properties)
      .where(sql`phone IS NOT NULL AND phone != ''`);

    const [withEmail] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(properties)
      .where(sql`email IS NOT NULL AND email != ''`);

    return {
      overview: {
        totalProperties: propertyCount,
        totalEvents: confirmedEvents + predictiveEvents,
        confirmedEvents,
        predictiveEvents,
        promotedLeads: promotedCount.count,
        absenteeOwners: absenteeCount.count,
        withPhone: withPhone.count,
        withEmail: withEmail.count,
      },
      eventsByType,
      scoring: scoringStats[0],
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  // GET /api/leads/top — Top scored properties ready for outreach
  app.get<{
    Querystring: {
      limit?: string;
      minScore?: string;
      absenteeOnly?: string;
    };
  }>(
    '/api/leads/top',
    { preHandler: [requireRole('properties.read')] },
    async (request) => {
      const query = topLeadsQuery.parse(request.query);
      const limit = query.limit;
      const minScore = query.minScore;
      const absenteeOnly = query.absenteeOnly === 'true';

      const absenteeClause = absenteeOnly ? sql`AND p.absentee_owner = true` : sql``;

      const results = await db.execute(sql`
        SELECT
          p.dominion_lead_id,
          p.apn,
          p.county,
          p.street_address,
          p.city,
          p.state,
          p.zip,
          p.owner_name,
          p.owner_first,
          p.owner_last,
          p.phone,
          p.email,
          p.mailing_address,
          p.absentee_owner,
          p.equity_estimate,
          ls.composite_score,
          ls.confidence_score,
          ls.score_model_version,
          ls.signal_contributions,
          ls.created_at as last_scored_at,
          (
            SELECT count(*)::int
            FROM distress_events de
            WHERE de.dominion_lead_id = p.dominion_lead_id
          ) as event_count
        FROM properties p
        INNER JOIN (
          SELECT DISTINCT ON (dominion_lead_id)
            dominion_lead_id, composite_score, confidence_score,
            score_model_version, signal_contributions, created_at
          FROM scoring_records
          ORDER BY dominion_lead_id, created_at DESC
        ) ls ON ls.dominion_lead_id = p.dominion_lead_id
        WHERE ls.composite_score >= ${minScore}
        ${absenteeClause}
        ORDER BY ls.composite_score DESC
        LIMIT ${limit}
      `);

      const leads = ((results as { rows?: unknown[] }).rows ?? results) as Record<string, unknown>[];

      return {
        leads,
        count: leads.length,
        filters: { minScore, absenteeOnly, limit },
      };
    },
  );
}
