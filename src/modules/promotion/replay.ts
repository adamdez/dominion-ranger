/**
 * Promotion replay has been removed.
 */
import { logger } from '../../config/logger.js';

export async function replayPropertyPromotion(_dominionLeadId: string): Promise<boolean> {
  logger.debug('Promotion replay disabled');
  return false;
}

export async function replayAllPromotions(): Promise<{ promoted: number; skipped: number; errors: number }> {
  logger.debug('Promotion replay disabled');
  return { promoted: 0, skipped: 0, errors: 0 };
}
