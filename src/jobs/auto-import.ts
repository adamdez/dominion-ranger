import { readdirSync, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { logger } from '../config/logger.js';
import { getImportedFiles, markFileImported, saveJobResult } from './pipeline-settings.js';

const IMPORT_DIR = './data/imports';

const COUNTY_STATE_PATTERNS: Record<string, { county: string; state: string }> = {
  spokane: { county: 'SPOKANE', state: 'WA' },
  kootenai: { county: 'KOOTENAI', state: 'ID' },
};

function detectCountyState(filename: string): { county?: string; state?: string } {
  const lower = filename.toLowerCase();
  for (const [pattern, info] of Object.entries(COUNTY_STATE_PATTERNS)) {
    if (lower.includes(pattern)) return info;
  }
  return {};
}

export async function autoImportNewFiles(): Promise<{ imported: number; skipped: number; errors: number }> {
  const startTime = Date.now();
  const stats = { imported: 0, skipped: 0, errors: 0 };

  if (!existsSync(IMPORT_DIR)) {
    logger.info({ dir: IMPORT_DIR }, 'Import directory does not exist — skipping auto-import');
    await saveJobResult({
      job: 'import',
      success: true,
      message: 'No import directory found',
      count: 0,
      durationMs: Date.now() - startTime,
      completedAt: new Date().toISOString(),
    });
    return stats;
  }

  const files = readdirSync(IMPORT_DIR)
    .filter((f) => extname(f).toLowerCase() === '.csv')
    .sort();

  if (files.length === 0) {
    logger.info('No CSV files found in import directory');
    await saveJobResult({
      job: 'import',
      success: true,
      message: 'No CSV files to import',
      count: 0,
      durationMs: Date.now() - startTime,
      completedAt: new Date().toISOString(),
    });
    return stats;
  }

  const alreadyImported = await getImportedFiles();

  for (const file of files) {
    if (alreadyImported.includes(file)) {
      stats.skipped++;
      continue;
    }

    const filePath = join(IMPORT_DIR, file);
    const { county, state } = detectCountyState(file);

    logger.info({ file, county, state }, 'Auto-importing CSV file');

    try {
      const { runReimportCsv } = await import('../scripts/reimport-csv.js');
      const result = await runReimportCsv(filePath, { county, state });

      await markFileImported(file);
      stats.imported++;

      logger.info(
        { file, created: result.created, updated: result.updated, events: result.eventsCreated },
        'Auto-import completed for file',
      );
    } catch (err) {
      stats.errors++;
      logger.error({ err, file }, 'Auto-import failed for file');
    }
  }

  await saveJobResult({
    job: 'import',
    success: stats.errors === 0,
    message: `Imported ${stats.imported} file(s), skipped ${stats.skipped}, errors ${stats.errors}`,
    count: stats.imported,
    errors: stats.errors,
    durationMs: Date.now() - startTime,
    completedAt: new Date().toISOString(),
  });

  logger.info(stats, 'Auto-import run completed');
  return stats;
}
