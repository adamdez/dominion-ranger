import 'dotenv/config';
import { seedScoringModel, seedSystemSettings } from './scoring-model-v1.js';
import { closeDatabase } from '../connection.js';
import { logger } from '../../config/logger.js';

async function runSeeds(): Promise<void> {
  logger.info('Running database seeds...');

  try {
    await seedScoringModel();
  } catch (err: any) {
    if (err.message?.includes('does not exist')) {
      logger.warn('scoring_model_configs table not found, skipping seed');
    } else {
      throw err;
    }
  }

  try {
    await seedSystemSettings();
  } catch (err: any) {
    if (err.message?.includes('does not exist')) {
      logger.warn('system_settings table not found, skipping seed');
    } else {
      throw err;
    }
  }

  logger.info('All seeds completed');
  await closeDatabase();
  process.exit(0);
}

runSeeds().catch((err) => {
  logger.fatal({ err }, 'Seed failed');
  process.exit(1);
});
```
