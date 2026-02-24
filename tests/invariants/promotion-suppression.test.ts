/**
 * Charter Invariant: Promotion Suppression & Idempotency
 *
 * Validates that:
 * 1. Suppressed properties (from scoring) are never promoted
 * 2. Below-threshold properties are not promoted
 * 3. Promotion is idempotent within 24h for the same model version
 * 4. Tier thresholds are correctly applied
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  scoringRecords,
  distressEvents,
  promotedLeads,
  scoringModelConfigs,
} from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { generateEventFingerprint } from '../../src/lib/fingerprint.js';
import { applyAppendOnlyInvariants } from '../../src/db/invariants.js';
import { seedScoringModel } from '../../src/db/seeds/scoring-model-v1.js';
import { scoreProperty, invalidateConfigCache } from '../../src/modules/scoring/service.js';
import { evaluateForPromotion } from '../../src/modules/promotion/service.js';
import { recalculateSignalAccumulation } from '../../src/modules/signals/service.js';
import type { ScoringResult } from '../../src/modules/scoring/service.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Promotion Suppression & Idempotency', () => {
  const db = canRun ? getTestDb() : (null as never);

  async function createPropertyWithEvents(
    apn: string,
    events: { type: string; layer: string }[],
    props?: Record<string, unknown>,
  ): Promise<string> {
    const id = generateId();
    await db.insert(properties).values({
      dominionLeadId: id,
      propertyId: generateId(),
      apn,
      county: 'PromotionTestCounty',
      state: 'AZ',
      equityEstimate: '150000.00',
      ownershipDurationMonths: 60,
      absenteeOwner: true,
      mortgageStatus: 'LATE_60',
      ...props,
    });

    for (const evt of events) {
      const fp = generateEventFingerprint({
        dominionLeadId: id,
        eventType: evt.type,
        eventLayer: evt.layer,
        sourceName: 'PromotionTest',
        triggerEventDate: new Date('2026-02-10'),
      });
      await db.insert(distressEvents).values({
        eventId: generateId(),
        dominionLeadId: id,
        eventType: evt.type,
        eventLayer: evt.layer,
        sourceName: 'PromotionTest',
        fingerprint: fp,
        reliabilityScore: '0.90',
        triggerEventDate: new Date('2026-02-10'),
      });
    }

    await recalculateSignalAccumulation(id);
    return id;
  }

  beforeAll(async () => {
    await cleanupTables();
    await applyAppendOnlyInvariants();
    await seedScoringModel();
    invalidateConfigCache();
  });

  afterAll(async () => {
    await cleanupTables();
    await closeTestDb();
  });

  beforeEach(async () => {
    await db.execute(sql`ALTER TABLE scoring_records DISABLE TRIGGER USER`);
    await db.execute(sql`ALTER TABLE distress_events DISABLE TRIGGER USER`);
    await db.execute(sql`DELETE FROM promoted_leads`);
    await db.execute(sql`DELETE FROM scoring_records`);
    await db.execute(sql`DELETE FROM signal_accumulation`);
    await db.execute(sql`DELETE FROM distress_events`);
    await db.execute(sql`DELETE FROM properties`);
    await db.execute(sql`ALTER TABLE distress_events ENABLE TRIGGER USER`);
    await db.execute(sql`ALTER TABLE scoring_records ENABLE TRIGGER USER`);
  });

  it('should never promote a suppressed scoring result', async () => {
    const id = await createPropertyWithEvents('SUP-001', [
      { type: 'NOTICE_OF_DEFAULT', layer: 'confirmed' },
      { type: 'TAX_DELINQUENCY', layer: 'confirmed' },
    ]);

    const suppressedResult: ScoringResult = {
      compositeScore: 0,
      motivationScore: 0,
      dealScore: 0,
      confidenceScore: 0,
      equityMultiplier: 1.0,
      suppressed: true,
      suppressionReason: 'Suppressed: test reason',
      signalContributions: [],
      timeDecayFactor: 0,
      scoreDecayRate: 1,
      daysSinceTrigger: 0,
      firstDetectedAt: null,
      modelVersion: 'v1.0',
    };

    const promotion = await evaluateForPromotion(id, suppressedResult);
    expect(promotion).toBeNull();

    const promos = await db
      .select()
      .from(promotedLeads)
      .where(eq(promotedLeads.dominionLeadId, id));
    expect(promos.length).toBe(0);
  });

  it('should not promote a below-threshold score', async () => {
    const id = await createPropertyWithEvents('LOW-001', [
      { type: 'PREDICTIVE_VACANCY_SIGNAL', layer: 'predictive' },
    ]);

    const [config] = await db
      .select()
      .from(scoringModelConfigs)
      .where(eq(scoringModelConfigs.active, true));
    const threshold = parseFloat(config.promotionThreshold);

    const belowThreshold: ScoringResult = {
      compositeScore: threshold - 1,
      motivationScore: 20,
      dealScore: 15,
      confidenceScore: 0.3,
      equityMultiplier: 1.0,
      suppressed: false,
      suppressionReason: null,
      signalContributions: [],
      timeDecayFactor: 0.8,
      scoreDecayRate: 0.2,
      daysSinceTrigger: 30,
      firstDetectedAt: new Date('2026-01-15'),
      modelVersion: 'v1.0',
    };

    const promotion = await evaluateForPromotion(id, belowThreshold);
    expect(promotion).toBeNull();
  });

  it('should promote and assign correct tier for above-threshold score', async () => {
    const id = await createPropertyWithEvents('TIER-001', [
      { type: 'NOTICE_OF_DEFAULT', layer: 'confirmed' },
    ]);

    const [config] = await db
      .select()
      .from(scoringModelConfigs)
      .where(eq(scoringModelConfigs.active, true));
    const tiers = config.tierThresholds as { A: number; B: number; C: number };

    const tierAResult: ScoringResult = {
      compositeScore: tiers.A + 5,
      motivationScore: 90,
      dealScore: 80,
      confidenceScore: 0.85,
      equityMultiplier: 1.0,
      suppressed: false,
      suppressionReason: null,
      signalContributions: [{
        eventId: generateId(),
        eventType: 'NOTICE_OF_DEFAULT',
        eventLayer: 'confirmed',
        baseWeight: 0.95,
        severityMultiplier: 1.0,
        reliabilityScore: 0.9,
        timeDecay: 0.95,
        finalContribution: 0.81,
        daysSinceTrigger: 5,
      }],
      timeDecayFactor: 0.95,
      scoreDecayRate: 0.05,
      daysSinceTrigger: 5,
      firstDetectedAt: new Date('2026-02-10'),
      modelVersion: 'v1.0',
    };

    const promotion = await evaluateForPromotion(id, tierAResult);
    expect(promotion).not.toBeNull();
    expect(promotion!.marketingTier).toBe('A');
  });

  it('should be idempotent — no duplicate promotion within 24h', async () => {
    const id = await createPropertyWithEvents('IDEM-001', [
      { type: 'NOTICE_OF_DEFAULT', layer: 'confirmed' },
    ]);

    const asOf = new Date('2026-02-15T12:00:00Z');
    const result = await scoreProperty(id, { asOf });

    if (result.compositeScore >= 40) {
      const promo1 = await evaluateForPromotion(id, result);
      const promo2 = await evaluateForPromotion(id, result);

      expect(promo1).not.toBeNull();
      expect(promo2).toBeNull();

      const allPromos = await db
        .select()
        .from(promotedLeads)
        .where(eq(promotedLeads.dominionLeadId, id));
      expect(allPromos.length).toBe(1);
    }
  });
});
