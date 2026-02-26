/**
 * Promotion replay — deterministic re-evaluation from scoring_records.
 *
 * Charter: Replay produces identical promoted set.
 */
import { db } from '../../db/connection.js';
import { scoringRecords } from '../../db/schema/index.js';
import type { ScoringResult } from '../scoring/index.js';
import { getLatestScore } from '../scoring/service.js';
import { evaluateForPromotion } from './service.js';
import { logger } from '../../config/logger.js';

/**
 * Replay promotion for a single property from its latest scoring record.
 * Returns true if promoted, false if not.
 */
export async function replayPropertyPromotion(dominionLeadId: string): Promise<boolean> {
  const record = await getLatestScore(dominionLeadId);
  if (!record) {
    return false;
  }

  const snapshot = (record.scoreInputsSnapshot as Record<string, unknown>) ?? {};
  const scoringResult: ScoringResult = {
    compositeScore: parseFloat(String(record.compositeScore ?? 0)),
    motivationScore: parseFloat(String(record.motivationScore ?? 0)),
    dealScore: parseFloat(String(record.dealScore ?? 0)),
    confidenceScore: parseFloat(String(record.confidenceScore ?? 0)),
    equityMultiplier: (snapshot.equityMultiplier as number) ?? 1.0,
    suppressed: (snapshot.suppressed as boolean) ?? false,
    suppressionReason: (snapshot.suppressionReason as string) ?? null,
    signalContributions: (record.signalContributions as ScoringResult['signalContributions']) ?? [],
    timeDecayFactor: parseFloat(String(record.timeDecayFactor ?? 0)),
    scoreDecayRate: parseFloat(String(record.scoreDecayRate ?? 1)),
    daysSinceTrigger: record.daysSinceTrigger ?? 0,
    firstDetectedAt: record.firstDetectedAt,
    modelVersion: record.scoreModelVersion,
  };

  const promoted = await evaluateForPromotion(dominionLeadId, scoringResult);
  return promoted !== null;
}

/**
 * Replay promotion for all properties with scoring records.
 * Returns counts: promoted, skipped, errors.
 */
export async function replayAllPromotions(): Promise<{
  promoted: number;
  skipped: number;
  errors: number;
}> {
  const stats = { promoted: 0, skipped: 0, errors: 0 };

  const distinctLeads = await db
    .selectDistinct({ dominionLeadId: scoringRecords.dominionLeadId })
    .from(scoringRecords);

  const total = distinctLeads.length;
  logger.info({ total }, 'Promotion replay: starting');

  for (let i = 0; i < distinctLeads.length; i++) {
    const { dominionLeadId } = distinctLeads[i];

    try {
      const wasPromoted = await replayPropertyPromotion(dominionLeadId);
      if (wasPromoted) {
        stats.promoted++;
      } else {
        stats.skipped++;
      }
    } catch (err) {
      stats.errors++;
      logger.error({ err, dominionLeadId }, 'Promotion replay: error');
    }

    if ((i + 1) % 100 === 0) {
      logger.info(
        { processed: i + 1, total, promoted: stats.promoted, skipped: stats.skipped, errors: stats.errors },
        'Promotion replay: progress',
      );
    }
  }

  logger.info(
    { promoted: stats.promoted, skipped: stats.skipped, errors: stats.errors, total },
    'Promotion replay: complete',
  );

  return stats;
}
