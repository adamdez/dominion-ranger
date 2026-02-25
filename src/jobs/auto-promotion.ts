import { db } from '../db/connection.js';
import { sql } from 'drizzle-orm';
import { replayPropertyPromotion } from '../modules/promotion/index.js';
import { logger } from '../config/logger.js';
import { saveJobResult } from './pipeline-settings.js';

/**
 * Evaluate scored properties for promotion.
 * Finds properties that:
 *   a) Have scoring_records with composite_score >= promotion threshold
 *   b) Don't already have a recent promotion (24h idempotency in evaluateForPromotion)
 *   c) Are not suppressed (checked by evaluateForPromotion)
 */
export async function autoPromote(): Promise<{ promoted: number; skipped: number; errors: number }> {
  const startTime = Date.now();
  const stats = { promoted: 0, skipped: 0, errors: 0 };

  const rows = await db.execute(sql`
    SELECT DISTINCT ON (sr.dominion_lead_id)
      sr.dominion_lead_id
    FROM scoring_records sr
    LEFT JOIN promoted_leads pl
      ON pl.dominion_lead_id = sr.dominion_lead_id
      AND pl.promoted_at > NOW() - INTERVAL '24 hours'
    WHERE pl.promotion_id IS NULL
      AND CAST(sr.composite_score AS numeric) >= (
        SELECT CAST(promotion_threshold AS numeric)
        FROM scoring_model_configs
        WHERE active = true
        LIMIT 1
      )
    ORDER BY sr.dominion_lead_id, sr.created_at DESC
    LIMIT 500
  `);

  const propertyIds = ((rows as unknown as { rows: Array<{ dominion_lead_id: string }> }).rows ?? [])
    .map((r) => r.dominion_lead_id);

  if (propertyIds.length === 0) {
    logger.info('Auto-promotion: no properties to promote');
    await saveJobResult({
      job: 'promotion',
      success: true,
      message: 'No properties qualify for promotion',
      count: 0,
      durationMs: Date.now() - startTime,
      completedAt: new Date().toISOString(),
    });
    return stats;
  }

  logger.info({ count: propertyIds.length }, 'Auto-promotion: evaluating candidates');

  for (const dominionLeadId of propertyIds) {
    try {
      const promoted = await replayPropertyPromotion(dominionLeadId);
      if (promoted) stats.promoted++;
      else stats.skipped++;
    } catch (err) {
      stats.errors++;
      if (stats.errors <= 10) {
        logger.error({ err, dominionLeadId }, 'Auto-promotion failed for property');
      }
    }
  }

  await saveJobResult({
    job: 'promotion',
    success: stats.errors === 0,
    message: `Promoted ${stats.promoted}, skipped ${stats.skipped} (${stats.errors} errors)`,
    count: stats.promoted,
    errors: stats.errors,
    durationMs: Date.now() - startTime,
    completedAt: new Date().toISOString(),
  });

  logger.info(stats, 'Auto-promotion completed');
  return stats;
}
