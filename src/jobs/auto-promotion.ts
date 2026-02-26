/**
 * Auto-promotion has been removed from Dominion Ranger.
 * Properties are managed through the funnel manually.
 * This file is kept as a stub to prevent import errors.
 */
import { logger } from '../config/logger.js';

export async function autoPromote(): Promise<{ promoted: number; skipped: number; errors: number }> {
  logger.debug('Auto-promotion is disabled — this function is a no-op');
  return { promoted: 0, skipped: 0, errors: 0 };
}
