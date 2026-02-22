import type { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/auth.js';
import { scoreProperty, getLatestScore, getScoringHistory } from '../../modules/scoring/service.js';
import { db } from '../../db/connection.js';
import { properties, scoringRecords } from '../../db/schema/index.js';
import { eq, sql, and } from 'drizzle-orm';
import { logger } from '../../config/logger.js';

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
      const { limit = 50000, county, rescore = false } = request.body ?? {};

      try {
        // Find properties to score
        const conditions: any[] = [];

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

        // Large batches: return immediately, score in background
        if (total > 500) {
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
                if (result.compositeScore >= 40) promoted++;

                if (scored % 500 === 0) {
                  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                  const rate = (scored / parseFloat(elapsed)).toFixed(1);
                  logger.info(
                    { scored, total, promoted, errors, elapsed: `${elapsed}s`, rate: `${rate}/s` },
                    'Batch scoring progress',
                  );
                }
              } catch (err: any) {
                errors++;
                if (errors <= 5) {
                  logger.error({ dominionLeadId: row.dominionLeadId, err: err.message }, 'Scoring error');
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
            if (result.compositeScore >= 40) promoted++;
          } catch (err: any) {
            errs.push(`${row.dominionLeadId}: ${err.message}`);
          }
        }

        return reply.send({
          status: 'completed',
          scored,
          promoted,
          total,
          errors: errs.length > 0 ? errs.slice(0, 10) : undefined,
        });
      } catch (err: any) {
        logger.error({ err }, 'Batch scoring failed');
        return reply.code(500).send({
          error: 'SCORING_FAILED',
          message: err.message,
        });
      }
    },
  );

  // GET /api/scoring/stats — Scoring overview
  app.get(
    '/api/scoring/stats',
    { preHandler: [requireRole('pipeline.run')] },
    async (_request, reply) => {
      const result = await db.execute(sql`
        SELECT
          COUNT(DISTINCT dominion_lead_id)::int as properties_scored,
          COUNT(*)::int as total_records,
          ROUND(AVG(CAST(composite_score AS numeric)), 2) as avg_score,
          ROUND(MAX(CAST(composite_score AS numeric)), 2) as max_score,
          COUNT(CASE WHEN CAST(composite_score AS numeric) >= 80 THEN 1 END)::int as tier_a,
          COUNT(CASE WHEN CAST(composite_score AS numeric) >= 60 AND CAST(composite_score AS numeric) < 80 THEN 1 END)::int as tier_b,
          COUNT(CASE WHEN CAST(composite_score AS numeric) >= 40 AND CAST(composite_score AS numeric) < 60 THEN 1 END)::int as tier_c,
          COUNT(CASE WHEN CAST(composite_score AS numeric) < 40 THEN 1 END)::int as below_threshold,
          (SELECT COUNT(*)::int FROM properties) as total_properties,
          (SELECT COUNT(*)::int FROM promoted_leads) as total_promoted
        FROM (
          SELECT DISTINCT ON (dominion_lead_id) dominion_lead_id, composite_score
          FROM scoring_records
          ORDER BY dominion_lead_id, created_at DESC
        ) latest_scores
      `);

      const stats = Array.isArray(result) ? result[0] : (result as any).rows?.[0] ?? {};
      return reply.send(stats);
    },
  );

  // GET /api/scoring/:dominionLeadId — Latest score
  app.get<{ Params: { dominionLeadId: string } }>(
    '/api/scoring/:dominionLeadId',
    { preHandler: [requireRole('pipeline.run')] },
    async (request, reply) => {
      const score = await getLatestScore(request.params.dominionLeadId);
      if (!score) return reply.code(404).send({ error: 'No scoring record found' });
      return reply.send(score);
    },
  );

  // GET /api/scoring/:dominionLeadId/history — Score history
  app.get<{ Params: { dominionLeadId: string }; Querystring: { limit?: number } }>(
    '/api/scoring/:dominionLeadId/history',
    { preHandler: [requireRole('pipeline.run')] },
    async (request, reply) => {
      const history = await getScoringHistory(request.params.dominionLeadId, request.query.limit ?? 20);
      return reply.send({ history });
    },
  );
}
