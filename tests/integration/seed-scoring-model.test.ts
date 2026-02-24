/**
 * Integration tests for seed-scoring-model script.
 *
 * - Starting from empty scoring_model_configs, running the script creates an active config.
 * - scoreProperty() no longer throws "No active scoring model configuration found" when config exists.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  scoringModelConfigs,
  distressEvents,
  signalAccumulation,
} from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { generateEventFingerprint } from '../../src/lib/fingerprint.js';
import { applyAppendOnlyInvariants } from '../../src/db/invariants.js';
import { seedScoringModelIfMissing } from '../../src/scripts/seed-scoring-model.js';
import { scoreProperty, invalidateConfigCache } from '../../src/modules/scoring/service.js';
import { EventLayer } from '../../src/db/schema/constants.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Seed Scoring Model', () => {
  const db = canRun ? getTestDb() : (null as any);

  beforeAll(async () => {
    await cleanupTables();
    await applyAppendOnlyInvariants();
  });

  afterAll(async () => {
    await cleanupTables();
    await closeTestDb();
  });

  it('creates active config when scoring_model_configs is empty', async () => {
    const result = await seedScoringModelIfMissing();

    expect(result.created).toBe(true);
    expect(result.version).toBe('default-v1');

    const [config] = await db
      .select()
      .from(scoringModelConfigs)
      .where(eq(scoringModelConfigs.active, true))
      .limit(1);

    expect(config).toBeDefined();
    expect(config.version).toBe('default-v1');
    expect(config.confirmedWeights).toBeDefined();
    expect(config.predictiveWeights).toBeDefined();
    expect(config.equityMultiplierConfig).toBeDefined();
    expect(config.dealScoreWeights).toBeDefined();
    expect(config.compositeWeights).toBeDefined();
  });

  it('returns existing version when active config already exists', async () => {
    const result = await seedScoringModelIfMissing();

    expect(result.created).toBe(false);
    expect(result.version).toBe('default-v1');
  });

  it('scoreProperty does not throw when active config exists', async () => {
    invalidateConfigCache();

    const dominionLeadId = generateId();
    await db.insert(properties).values({
      dominionLeadId,
      propertyId: generateId(),
      apn: `SEED-TEST-${dominionLeadId.slice(0, 8)}`,
      county: 'TestCounty',
      state: 'AZ',
    });

    const triggerDate = new Date();
    const eventId = generateId();
    const fp = generateEventFingerprint({
      dominionLeadId,
      eventType: 'TAX_DELINQUENCY',
      eventLayer: EventLayer.CONFIRMED,
      sourceName: 'test',
      triggerEventDate: triggerDate,
    });
    await db.insert(distressEvents).values({
      eventId,
      dominionLeadId,
      eventType: 'TAX_DELINQUENCY',
      eventLayer: EventLayer.CONFIRMED,
      sourceName: 'test',
      fingerprint: fp,
      reliabilityScore: '0.9',
      triggerEventDate: triggerDate,
    });

    await db.insert(signalAccumulation).values({
      dominionLeadId,
      firstSignalDetectedAt: triggerDate,
      signalDensityScore: '0',
      signalAccelerationRate: '0',
    });

    const result = await scoreProperty(dominionLeadId);

    expect(result).toBeDefined();
    expect(result.modelVersion).toBe('default-v1');
    expect(result.compositeScore).toBeGreaterThanOrEqual(0);
  });
});
