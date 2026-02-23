import type { FastifyInstance } from 'fastify';
import type { SQL } from 'drizzle-orm';
import { requireRole } from '../middleware/auth.js';
import { scoreProperty, getLatestScore, getScoringHistory } from '../../modules/scoring/index.js';
import { replayAllPromotions } from '../../modules/promotion/index.js';
import { db } from '../../db/connection.js';
import { properties, scoringRecords } from '../../db/schema/index.js';
import { eq, sql, and, countDistinct } from 'drizzle-orm';
import { logger } from '../../config/logger.js';
import { BUSINESS_RULES } from '../../config/business-rules.js';
import { batchScoreBody, scoringParamsSchema, scoringHistoryQuery } from '../schemas/scoring.js';

export async function scoringRoutes(app: FastifyInstance): Promise<void> {

  // POST /api/scoring/run — Batch score properties directly (no Redis)
  app.post<{
    Body: {
      limit?: number;
      county?: string;
      rescore?: boolean;
    };
  }>(
    '/api/scoring/run',
    {
      preHandler: [requireRole('pipeline.run')],
    },
    async (request, reply) => {
      const body = batchScoreBody.parse(request.body);
      const { limit = BUSINESS_RULES.batch.defaultScoringLimit, county, rescore = false } = body ?? {};

      try {
        const conditions: SQL[] = [];

        if (!rescore) {
          conditions.push(
            sql`${properties.dominionLeadId} NOT IN (SELECT DISTINCT dominion_lead_id FROM scoring_records)`,
          );
        }
        if (county) {
          conditions.push(eq(properties.county, county.toUpperCase()));
        }

        const toScore = await db
          .select({ dominionLeadId: properties.dominionLeadId })
          .from(properties)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .limit(limit);

        if (toScore.length === 0) {
          return reply.send({ status: 'complete', message: 'No properties need scoring', scored: 0, promoted: 0 });
        }

        const total = toScore.length;

        if (total > BUSINESS_RULES.batch.largeBatchThreshold) {
          reply.send({
            status: 'started',
            message: `Scoring ${total} properties directly. Check /api/scoring/stats for progress.`,
            total,
          });

          setImmediate(async () => {
            let scored = 0;
            let promoted = 0;
            let errors = 0;
            const startTime = Date.now();

            for (const row of toScore) {
              try {
                const result = await scoreProperty(row.dominionLeadId);
                scored++;
                if (result.compositeScore >= BUSINESS_RULES.tiers.C.minScore) promoted++;

                if (scored % BUSINESS_RULES.batch.progressLogInterval === 0) {
                  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                  const rate = (scored / parseFloat(elapsed)).toFixed(1);
                  logger.info(
                    { scored, total, promoted, errors, elapsed: `${elapsed}s`, rate: `${rate}/s` },
                    'Batch scoring progress',
                  );
                }
              } catch (err: unknown) {
                errors++;
                if (errors <= BUSINESS_RULES.batch.maxLoggedErrors) {
                  logger.error({ dominionLeadId: row.dominionLeadId, err: err instanceof Error ? err.message : String(err) }, 'Scoring error');
                }
              }
            }

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            logger.info(
              { scored, total, promoted, errors, elapsed: `${elapsed}s` },
              'Batch scoring COMPLETE',
            );
          });

          return;
        }

        // Small batches: score synchronously
        let scored = 0;
        let promoted = 0;
        const errs: string[] = [];

        for (const row of toScore) {
          try {
            const result = await scoreProperty(row.dominionLeadId);
            scored++;
            if (result.compositeScore >= BUSINESS_RULES.tiers.C.minScore) promoted++;
          } catch (err: unknown) {
            errs.push(`${row.dominionLeadId}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        return reply.send({
          status: 'completed',
          scored,
          promoted,
          total,
          errors: errs.length > 0 ? errs.slice(0, BUSINESS_RULES.batch.maxReturnedErrors) : undefined,
        });
      } catch (err: unknown) {
        logger.error({ err }, 'Batch scoring failed');
        return reply.code(500).send({
          error: 'SCORING_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  // POST /api/scoring/promote — Replay promotion evaluation for all scored properties
  // Runs synchronously: promotion reads cached scores (not computing new ones) so it's fast
  app.post(
    '/api/scoring/promote',
    { preHandler: [requireRole('pipeline.run')] },
    async (_request, reply) => {
      try {
        const [{ count }] = await db
          .select({ count: countDistinct(scoringRecords.dominionLeadId) })
          .from(scoringRecords);

        const total = Number(count);

        if (total === 0) {
          return reply.send({ status: 'complete', message: 'No scored properties to promote', promoted: 0, skipped: 0, errors: 0 });
        }

        const result = await replayAllPromotions();
        return reply.send({ status: 'completed', total, ...result });
      } catch (err: unknown) {
        logger.error({ err }, 'Promotion failed');
        return reply.code(500).send({
          error: 'PROMOTION_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  // GET /api/scoring/stats — Scoring overview
  app.get(
    '/api/scoring/stats',
    { preHandler: [requireRole('pipeline.run')] },
    async (_request, reply) => {
      const tierA = BUSINESS_RULES.tiers.A.minScore;
      const tierB = BUSINESS_RULES.tiers.B.minScore;
      const tierC = BUSINESS_RULES.tiers.C.minScore;

      const result = await db.execute(sql`
        SELECT
          COUNT(DISTINCT dominion_lead_id)::int as properties_scored,
          COUNT(*)::int as total_records,
          ROUND(AVG(CAST(composite_score AS numeric)), 2) as avg_score,
          ROUND(MAX(CAST(composite_score AS numeric)), 2) as max_score,
          COUNT(CASE WHEN CAST(composite_score AS numeric) >= ${tierA} THEN 1 END)::int as tier_a,
          COUNT(CASE WHEN CAST(composite_score AS numeric) >= ${tierB} AND CAST(composite_score AS numeric) < ${tierA} THEN 1 END)::int as tier_b,
          COUNT(CASE WHEN CAST(composite_score AS numeric) >= ${tierC} AND CAST(composite_score AS numeric) < ${tierB} THEN 1 END)::int as tier_c,
          COUNT(CASE WHEN CAST(composite_score AS numeric) < ${tierC} THEN 1 END)::int as below_threshold,
          (SELECT COUNT(*)::int FROM properties) as total_properties,
          (SELECT COUNT(*)::int FROM promoted_leads) as total_promoted
        FROM (
          SELECT DISTINCT ON (dominion_lead_id) dominion_lead_id, composite_score
          FROM scoring_records
          ORDER BY dominion_lead_id, created_at DESC
        ) latest_scores
      `);

      const rows = (result as unknown as { rows?: Record<string, unknown>[] }).rows ?? [];
      const stats = rows[0] ?? {};
      return reply.send(stats);
    },
  );

  // GET /api/scoring/:dominionLeadId — Latest score
  app.get<{ Params: { dominionLeadId: string } }>(
    '/api/scoring/:dominionLeadId',
    { preHandler: [requireRole('pipeline.run')] },
    async (request, reply) => {
      const { dominionLeadId } = scoringParamsSchema.parse(request.params);
      const score = await getLatestScore(dominionLeadId);
      if (!score) return reply.code(404).send({ error: 'No scoring record found' });
      return reply.send(score);
    },
  );

  // GET /api/scoring/:dominionLeadId/history — Score history
  app.get<{ Params: { dominionLeadId: string }; Querystring: { limit?: number } }>(
    '/api/scoring/:dominionLeadId/history',
    { preHandler: [requireRole('pipeline.run')] },
    async (request, reply) => {
      const { dominionLeadId } = scoringParamsSchema.parse(request.params);
      const query = scoringHistoryQuery.parse(request.query);
      const history = await getScoringHistory(dominionLeadId, query.limit ?? BUSINESS_RULES.pagination.defaultHistoryLimit);
      return reply.send({ history });
    },
  );
}
