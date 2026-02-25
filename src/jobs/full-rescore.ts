import { replayAllScoring, invalidateConfigCache } from '../modules/scoring/index.js';
import { logger } from '../config/logger.js';
import { saveJobResult } from './pipeline-settings.js';

/**
 * Full rescore of all properties with distress events.
 * Uses the existing replayAllScoring function which:
 *   1. Invalidates config cache
 *   2. Gets all properties with distress events
 *   3. Rescores each one sequentially
 *   4. Appends new scoring records (Charter: append-only)
 */
export async function fullRescore(): Promise<{ processed: number; errors: number; total: number }> {
  const startTime = Date.now();

  logger.info('Full rescore: starting nightly rescore of all properties');
  invalidateConfigCache();

  let lastLoggedProgress = 0;
  const result = await replayAllScoring({
    onProgress: (processed, total) => {
      if (processed - lastLoggedProgress >= 100 || processed === total) {
        logger.info({ processed, total }, 'Full rescore progress');
        lastLoggedProgress = processed;
      }
    },
  });

  await saveJobResult({
    job: 'rescore',
    success: result.errors === 0,
    message: `Rescored ${result.processed}/${result.total} properties (${result.errors} errors)`,
    count: result.processed,
    errors: result.errors,
    durationMs: Date.now() - startTime,
    completedAt: new Date().toISOString(),
  });

  logger.info(result, 'Full rescore completed');
  return result;
}
