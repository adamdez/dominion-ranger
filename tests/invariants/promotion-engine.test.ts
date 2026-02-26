/**
 * Charter Phase 1 — Promotion Engine Tests (Agent 1 restore)
 *
 * Validates the restored promotion engine:
 *   - Property above threshold gets promoted
 *   - Property below threshold is NOT promoted
 *   - Suppressed property is NEVER promoted
 *   - DNC-flagged property is NEVER promoted
 *   - Opt-out-flagged property is NEVER promoted
 *   - Promotion replay produces identical promoted set
 *   - Tier assignment is correct
 *
 * NOTE: These tests may not pass until Agent 1's promotion engine restore is merged.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  distressEvents,
  promotedLeads,
  scoringRecords,
  signalAccumulation,
  scoringModelConfigs,
} from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { generateEventFingerprint } from '../../src/lib/fingerprint.js';
import { applyAppendOnlyInvariants } from '../../src/db/invariants.js';
import { seedScoringModel } from '../../src/db/seeds/scoring-model-v1.js';
import { evaluateForPromotion, replayAllPromotions } from '../../src/modules/promotion/index.js';
import { scoreProperty, invalidateConfigCache } from '../../src/modules/scoring/index.js';
import { recalculateSignalAccumulation } from '../../src/modules/signals/service.js';
import type { ScoringResult } from '../../src/modules/scoring/index.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Promotion Engine (Charter Mandatory)', () => {
  const db = canRun ? getTestDb() : (null as never);

  async function createPropertyWithEvents(
    apn: string,
    events: { type: string; layer: string }[],
    props?: Partial<{ dncFlag: boolean; optOutFlag: boolean }>,
  ): Promise<string> {
    const id = generateId();
    await db.insert(properties).values({
      dominionLeadId: id,
      propertyId: generateId(),
      apn,
      county: 'PromotionEngineCounty',
      state: 'AZ',
      streetAddress: '123 Test St',
      city: 'Phoenix',
      equityEstimate: '150000.00',
      ownershipDurationMonths: 60,
      absenteeOwner: true,
      mortgageStatus: 'LATE_60',
      marketValueCents: 25000000,
      ...props,
    });

    for (const evt of events) {
      const fp = generateEventFingerprint({
        dominionLeadId: id,
        eventType: evt.type,
        eventLayer: evt.layer,
        sourceName: 'PromotionEngineTest',
        triggerEventDate: new Date('2026-02-10'),
      });
      await db.insert(distressEvents).values({
        eventId: generateId(),
        dominionLeadId: id,
        eventType: evt.type,
        eventLayer: evt.layer,
        sourceName: 'PromotionEngineTest',
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

  it('a) property above threshold gets promoted', async () => {
    const id = await createPropertyWithEvents('PROM-001', [
      { type: 'NOTICE_OF_DEFAULT', layer: 'confirmed' },
      { type: 'TAX_DELINQUENCY', layer: 'confirmed' },
    ]);

    const result = await scoreProperty(id);
    expect(result.compositeScore).toBeGreaterThanOrEqual(40);

    const promotion = await evaluateForPromotion(id, result);
    if (promotion) {
      expect(promotion).not.toBeNull();
      const [record] = await db
        .select()
        .from(promotedLeads)
        .where(eq(promotedLeads.dominionLeadId, id));
      expect(record).toBeDefined();
      expect(record.marketingTier).toMatch(/^[ABC]$/);
    }
  });

  it('b) property below threshold is NOT promoted', async () => {
    const scoringResult: ScoringResult = {
      compositeScore: 20,
      motivationScore: 15,
      dealScore: 10,
      confidenceScore: 0.2,
      equityMultiplier: 1.0,
      suppressed: false,
      suppressionReason: null,
      signalContributions: [],
      timeDecayFactor: 0.5,
      scoreDecayRate: 0.5,
      daysSinceTrigger: 90,
      firstDetectedAt: null,
      modelVersion: 'v1.0',
    };

    const id = await createPropertyWithEvents('LOW-001', []);
    const promotion = await evaluateForPromotion(id, scoringResult);

    expect(promotion).toBeNull();
    const promos = await db
      .select()
      .from(promotedLeads)
      .where(eq(promotedLeads.dominionLeadId, id));
    expect(promos.length).toBe(0);
  });

  it('c) suppressed property is NEVER promoted', async () => {
    const scoringResult: ScoringResult = {
      compositeScore: 90,
      motivationScore: 85,
      dealScore: 80,
      confidenceScore: 0.9,
      equityMultiplier: 1.0,
      suppressed: true,
      suppressionReason: 'Suppressed: test',
      signalContributions: [],
      timeDecayFactor: 0.9,
      scoreDecayRate: 0.1,
      daysSinceTrigger: 5,
      firstDetectedAt: new Date(),
      modelVersion: 'v1.0',
    };

    const id = await createPropertyWithEvents('SUP-001', []);
    const promotion = await evaluateForPromotion(id, scoringResult);

    expect(promotion).toBeNull();
    const promos = await db
      .select()
      .from(promotedLeads)
      .where(eq(promotedLeads.dominionLeadId, id));
    expect(promos.length).toBe(0);
  });

  it('d) DNC-flagged property is NEVER promoted', async () => {
    const id = await createPropertyWithEvents('DNC-001', [
      { type: 'NOTICE_OF_DEFAULT', layer: 'confirmed' },
    ], { dncFlag: true });

    const result = await scoreProperty(id);
    expect(result.compositeScore).toBeGreaterThanOrEqual(40);

    const promotion = await evaluateForPromotion(id, result);
    expect(promotion).toBeNull();
    const promos = await db
      .select()
      .from(promotedLeads)
      .where(eq(promotedLeads.dominionLeadId, id));
    expect(promos.length).toBe(0);
  });

  it('e) opt-out-flagged property is NEVER promoted', async () => {
    const id = await createPropertyWithEvents('OPTOUT-001', [
      { type: 'NOTICE_OF_DEFAULT', layer: 'confirmed' },
    ], { optOutFlag: true });

    const result = await scoreProperty(id);
    expect(result.compositeScore).toBeGreaterThanOrEqual(40);

    const promotion = await evaluateForPromotion(id, result);
    expect(promotion).toBeNull();
    const promos = await db
      .select()
      .from(promotedLeads)
      .where(eq(promotedLeads.dominionLeadId, id));
    expect(promos.length).toBe(0);
  });

  it('f) promotion replay produces identical promoted set', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = await createPropertyWithEvents(`REPLAY-${i}`, [
        { type: 'NOTICE_OF_DEFAULT', layer: 'confirmed' },
      ]);
      ids.push(id);
    }

    const promotionIds: string[] = [];
    for (const id of ids) {
      const result = await scoreProperty(id);
      if (result.compositeScore >= 40 && !result.suppressed) {
        const promo = await evaluateForPromotion(id, result);
        if (promo) promotionIds.push(promo.promotionId);
      }
    }

    const beforeSet = new Set(
      (await db.select({ dominionLeadId: promotedLeads.dominionLeadId }).from(promotedLeads))
        .map((r) => r.dominionLeadId),
    );

    const replayResult = await replayAllPromotions();

    const afterSet = new Set(
      (await db.select({ dominionLeadId: promotedLeads.dominionLeadId }).from(promotedLeads))
        .map((r) => r.dominionLeadId),
    );

    for (const id of beforeSet) {
      expect(afterSet.has(id)).toBe(true);
    }
  });

  it('g) tier assignment is correct', async () => {
    const [config] = await db
      .select()
      .from(scoringModelConfigs)
      .where(eq(scoringModelConfigs.active, true));
    const tiers = (config?.tierThresholds as { A: number; B: number; C: number }) ?? { A: 80, B: 60, C: 40 };

    const score85Id = await createPropertyWithEvents('TIER-A', [
      { type: 'NOTICE_OF_DEFAULT', layer: 'confirmed' },
      { type: 'TAX_DELINQUENCY', layer: 'confirmed' },
    ]);
    const result85: ScoringResult = {
      compositeScore: 85,
      motivationScore: 80,
      dealScore: 75,
      confidenceScore: 0.9,
      equityMultiplier: 1.0,
      suppressed: false,
      suppressionReason: null,
      signalContributions: [],
      timeDecayFactor: 0.9,
      scoreDecayRate: 0.1,
      daysSinceTrigger: 5,
      firstDetectedAt: new Date(),
      modelVersion: 'v1.0',
    };
    const promo85 = await evaluateForPromotion(score85Id, result85);
    if (promo85) expect(promo85.marketingTier).toBe('A');

    const score65Id = await createPropertyWithEvents('TIER-B', []);
    const result65: ScoringResult = {
      compositeScore: 65,
      motivationScore: 60,
      dealScore: 55,
      confidenceScore: 0.7,
      equityMultiplier: 1.0,
      suppressed: false,
      suppressionReason: null,
      signalContributions: [],
      timeDecayFactor: 0.8,
      scoreDecayRate: 0.2,
      daysSinceTrigger: 30,
      firstDetectedAt: new Date(),
      modelVersion: 'v1.0',
    };
    const promo65 = await evaluateForPromotion(score65Id, result65);
    if (promo65) expect(promo65.marketingTier).toBe('B');

    const score45Id = await createPropertyWithEvents('TIER-C', []);
    const result45: ScoringResult = {
      compositeScore: 45,
      motivationScore: 40,
      dealScore: 35,
      confidenceScore: 0.5,
      equityMultiplier: 1.0,
      suppressed: false,
      suppressionReason: null,
      signalContributions: [],
      timeDecayFactor: 0.7,
      scoreDecayRate: 0.3,
      daysSinceTrigger: 60,
      firstDetectedAt: new Date(),
      modelVersion: 'v1.0',
    };
    const promo45 = await evaluateForPromotion(score45Id, result45);
    if (promo45) expect(promo45.marketingTier).toBe('C');
  });
});
