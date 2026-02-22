import { db } from '../../db/connection.js';
import { scoringRecords } from '../../db/schema/index.js';
import { eq, desc } from 'drizzle-orm';
import { evaluateForPromotion } from './service.js';
import { logger } from '../../config/logger.js';
import type { ScoringResult } from '../scoring/index.js';

/**
 * Replay promotion evaluation for a single property using its latest score.
 * Appends a new promotion record if the property qualifies.
 */
export async function replayPropertyPromotion(dominionLeadId: string): Promise<boolean> {
  const [latestScore] = await db
    .select()
    .from(scoringRecords)
    .where(eq(scoringRecords.dominionLeadId, dominionLeadId))
    .orderBy(desc(scoringRecords.createdAt))
    .limit(1);

  if (!latestScore) return false;

  const result: ScoringResult = {
    compositeScore: parseFloat(latestScore.compositeScore),
    motivationScore: parseFloat(latestScore.motivationScore ?? '0'),
    dealScore: parseFloat(latestScore.dealScore ?? '0'),
    confidenceScore: parseFloat(latestScore.confidenceScore),
    equityMultiplier: 1.0,
    suppressed: false,
    suppressionReason: null,
    signalContributions: (latestScore.signalContributions as ScoringResult['signalContributions']) ?? [],
    timeDecayFactor: parseFloat(latestScore.timeDecayFactor ?? '0'),
    scoreDecayRate: parseFloat(latestScore.scoreDecayRate ?? '1'),
    daysSinceTrigger: latestScore.daysSinceTrigger ?? 0,
    firstDetectedAt: latestScore.firstDetectedAt,
    modelVersion: latestScore.scoreModelVersion,
  };

  const promotion = await evaluateForPromotion(dominionLeadId, result);
  return promotion !== null;
}

/**
 * Replay promotion for all scored properties.
 * Charter: Promotion replay produces identical promoted set.
 */
export async function replayAllPromotions(): Promise<{ promoted: number; skipped: number; errors: number }> {
  const stats = { promoted: 0, skipped: 0, errors: 0 };

  const latestScores = await db
    .selectDistinct({ dominionLeadId: scoringRecords.dominionLeadId })
    .from(scoringRecords);

  for (const { dominionLeadId } of latestScores) {
    try {
      const promoted = await replayPropertyPromotion(dominionLeadId);
      if (promoted) stats.promoted++;
      else stats.skipped++;
    } catch (err) {
      stats.errors++;
      logger.error({ err, dominionLeadId }, 'Promotion replay failed');
    }
  }

  logger.info(stats, 'Promotion replay completed');
  return stats;
}
