import { db } from '../../db/connection.js';
import { distressEvents } from '../../db/schema/index.js';
import { scoreProperty, invalidateConfigCache } from './service.js';
import { recalculateSignalAccumulation } from '../signals/index.js';
import { logger } from '../../config/logger.js';
import type { ScoringResult } from './service.js';

/**
 * Replay scoring for a single property.
 *
 * Re-scores from current events using the active model config.
 * Appends a new scoring record — never deletes prior records.
 * Charter: deterministic replay must produce identical scores for identical inputs.
 */
export async function replayPropertyScoring(dominionLeadId: string): Promise<ScoringResult> {
  await recalculateSignalAccumulation(dominionLeadId);
  return scoreProperty(dominionLeadId);
}

/**
 * Replay scoring for all properties that have distress events.
 * Useful after model config changes or to verify determinism at scale.
 */
export async function replayAllScoring(options?: {
  onProgress?: (processed: number, total: number) => void;
}): Promise<{ processed: number; errors: number; total: number }> {
  invalidateConfigCache();

  const propertyIds = await db
    .selectDistinct({ dominionLeadId: distressEvents.dominionLeadId })
    .from(distressEvents);

  const stats = { processed: 0, errors: 0, total: propertyIds.length };

  for (const { dominionLeadId } of propertyIds) {
    try {
      await replayPropertyScoring(dominionLeadId);
      stats.processed++;
      options?.onProgress?.(stats.processed, stats.total);
    } catch (err) {
      stats.errors++;
      logger.error({ err, dominionLeadId }, 'Scoring replay failed for property');
    }
  }

  logger.info(stats, 'Scoring replay completed');
  return stats;
}
