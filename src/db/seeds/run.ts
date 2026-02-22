import 'dotenv/config';
import { seedScoringModel, seedSystemSettings } from './scoring-model-v1.js';
import { closeDatabase } from '../connection.js';
import { logger } from '../../config/logger.js';

async function runSeeds(): Promise<void> {
  logger.info('Running database seeds...');

  await seedScoringModel();
  await seedSystemSettings();

  logger.info('All seeds completed');
  await closeDatabase();
  process.exit(0);
}

runSeeds().catch((err) => {
  logger.fatal({ err }, 'Seed failed');
  process.exit(1);
});
