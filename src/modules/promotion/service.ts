/**
 * Promotion module has been removed.
 * Properties are not auto-promoted — funnel management is manual.
 */
import { logger } from '../../config/logger.js';
import type { PromotedLead, Property } from '../../db/schema/index.js';
import type { ScoringResult } from '../scoring/index.js';

export type PromotionResult = { promoted: number; skipped: number; errors: number };

export async function evaluateForPromotion(
  _dominionLeadId: string,
  _scoringResult: ScoringResult,
): Promise<PromotedLead | null> {
  logger.debug('Promotion is disabled');
  return null;
}

export async function getRankedLeads(_options: {
  tier?: 'A' | 'B' | 'C';
  limit?: number;
  offset?: number;
}): Promise<(PromotedLead & { property: Property })[]> {
  return [];
}

export async function getPromotionHistory(_dominionLeadId: string): Promise<PromotedLead[]> {
  return [];
}

export async function markExportedToSentinel(_promotionId: string): Promise<void> {
  // No-op
}
