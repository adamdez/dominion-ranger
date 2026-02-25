import { db } from '../db/connection.js';
import { sql } from 'drizzle-orm';
import { scoreProperty } from '../modules/scoring/index.js';
import { logger } from '../config/logger.js';
import { saveJobResult } from './pipeline-settings.js';

const BATCH_LIMIT = 500;

/**
 * Score properties that have distress events but either:
 *   a) No scoring_records at all, OR
 *   b) distress_events newer than their latest scoring_record
 *
 * This is the incremental optimization — only score what's changed.
 */
export async function incrementalScore(): Promise<{ scored: number; errors: number }> {
  const startTime = Date.now();
  const stats = { scored: 0, errors: 0 };

  const rows = await db.execute(sql`
    SELECT DISTINCT p.dominion_lead_id
    FROM properties p
    JOIN distress_events de ON de.dominion_lead_id = p.dominion_lead_id
    LEFT JOIN LATERAL (
      SELECT created_at FROM scoring_records sr
      WHERE sr.dominion_lead_id = p.dominion_lead_id
      ORDER BY sr.created_at DESC
      LIMIT 1
    ) latest_sr ON true
    WHERE latest_sr.created_at IS NULL
       OR de.created_at > latest_sr.created_at
    LIMIT ${BATCH_LIMIT}
  `);

  const propertyIds = ((rows as unknown as { rows: Array<{ dominion_lead_id: string }> }).rows ?? [])
    .map((r) => r.dominion_lead_id);

  if (propertyIds.length === 0) {
    logger.info('Incremental scoring: no properties need scoring');
    await saveJobResult({
      job: 'scoring',
      success: true,
      message: 'No properties need scoring',
      count: 0,
      durationMs: Date.now() - startTime,
      completedAt: new Date().toISOString(),
    });
    return stats;
  }

  logger.info({ count: propertyIds.length }, 'Incremental scoring: starting batch');

  for (const dominionLeadId of propertyIds) {
    try {
      await scoreProperty(dominionLeadId);
      stats.scored++;
    } catch (err) {
      stats.errors++;
      if (stats.errors <= 10) {
        logger.error({ err, dominionLeadId }, 'Incremental scoring failed for property');
      }
    }
  }

  await saveJobResult({
    job: 'scoring',
    success: stats.errors === 0,
    message: `Scored ${stats.scored} properties (${stats.errors} errors)`,
    count: stats.scored,
    errors: stats.errors,
    durationMs: Date.now() - startTime,
    completedAt: new Date().toISOString(),
  });

  logger.info(stats, 'Incremental scoring completed');
  return stats;
}
