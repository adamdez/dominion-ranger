/**
 * Charter Phase 1 — Suppression → Promotion Integration Test
 *
 * Charter §V, §X: "Suppressed leads never promoted"
 *
 * Validates end-to-end:
 *   1. Property with negative-stack suppression scores as suppressed
 *   2. Suppressed property is NEVER promoted, even with high distress signals
 *   3. Non-suppressed property with same signals IS promoted (control)
 *   4. Scoring record captures suppression metadata in scoreInputsSnapshot
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  distressEvents,
  scoringRecords,
  promotedLeads,
  scoringModelConfigs,
} from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { generateEventFingerprint } from '../../src/lib/fingerprint.js';
import { scoreProperty, invalidateConfigCache } from '../../src/modules/scoring/service.js';
import { evaluateForPromotion } from '../../src/modules/promotion/service.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Suppression → Promotion Pipeline', () => {
  const db = canRun ? getTestDb() : (null as any);

  const TEST_CONFIG_VERSION = 'v_test_suppression';
  const FIXED_AS_OF = new Date('2026-02-20T12:00:00Z');

  beforeAll(async () => {
    await cleanupTables();
  });

  afterAll(async () => {
    await cleanupTables();
    await closeTestDb();
  });

  beforeEach(async () => {
    await cleanupTables();

    // Seed test scoring config with suppression on FREE_AND_CLEAR mortgage
    await db.insert(scoringModelConfigs).values({
      version: TEST_CONFIG_VERSION,
      confirmedWeights: {
        NOTICE_OF_DEFAULT: { base_weight: 0.95, half_life_days: 90 },
        TAX_DELINQUENCY: { base_weight: 0.80, half_life_days: 120 },
      },
      predictiveWeights: {
        PREDICTIVE_PAYMENT_STRESS: { base_weight: 0.40, half_life_days: 45 },
      },
      decayConfig: { function: 'exponential', floor: 0.05 },
      promotionThreshold: '30.0000',
      tierThresholds: { A: 80, B: 60, C: 40 },
      confidenceConfig: {
        min_signals_for_high: 5,
        diversity_bonus: 0.05,
        confirmed_presence_bonus: 0.25,
        source_count_weight: 0.05,
      },
      equityMultiplierConfig: {
        ranges: [
          { min: 0, max: 25000, multiplier: 0.7 },
          { min: 25000, max: 75000, multiplier: 0.85 },
          { min: 75000, max: 200000, multiplier: 1.0 },
          { min: 200000, multiplier: 1.15 },
        ],
        default_multiplier: 1.0,
      },
      dealScoreWeights: {
        equity_weight: 0.35,
        ownership_weight: 0.25,
        absentee_weight: 0.15,
        mortgage_weight: 0.25,
        equity_thresholds: { low: 25000, mid: 75000, high: 200000 },
        ownership_thresholds: { short_months: 24, long_months: 120 },
        mortgage_severity: {
          FREE_AND_CLEAR: 0.3, CURRENT: 0.2, LATE_30: 0.5, LATE_60: 0.7,
          LATE_90: 0.85, DEFAULT: 0.95, FORECLOSURE: 1.0, UNKNOWN: 0.1,
        },
        equity_factors: { high: 1.0, mid: 0.7, low: 0.4, floor: 0.15 },
        ownership_factors: { long: 1.0, short: 0.5, floor: 0.2 },
      },
      compositeWeights: { motivation_weight: 0.65, deal_weight: 0.35 },
      suppressionConfig: {
        mortgage_statuses: ['FREE_AND_CLEAR'],
        custom_flags: [],
      },
      active: true,
    });

    invalidateConfigCache();
  });

  /** Create a property with strong distress events */
  async function createHighDistressProperty(apn: string, mortgageStatus: string) {
    const dominionLeadId = generateId();
    await db.insert(properties).values({
      dominionLeadId,
      propertyId: generateId(),
      apn,
      county: 'MARICOPA',
      state: 'AZ',
      ownerName: 'Test Owner',
      ownerFirst: 'Test',
      ownerLast: 'Owner',
      equityEstimate: '150000',
      ownershipDurationMonths: 180,
      mortgageStatus: mortgageStatus as any,
    });

    const recentDate = new Date('2026-02-18T10:00:00Z');

    for (const eventType of ['NOTICE_OF_DEFAULT', 'TAX_DELINQUENCY'] as const) {
      const eventId = generateId();
      const fp = generateEventFingerprint({
        dominionLeadId,
        eventType,
        eventLayer: 'confirmed',
        sourceName: `test-${eventType}`,
        triggerEventDate: recentDate,
      });

      await db.insert(distressEvents).values({
        eventId,
        dominionLeadId,
        eventType,
        eventLayer: 'confirmed',
        triggerEventDate: recentDate,
        sourceName: `test-${eventType}`,
        fingerprint: fp,
        reliabilityScore: '0.90',
        freshnessCategory: '1_3_days',
      });
    }

    return dominionLeadId;
  }

  it('suppressed property (FREE_AND_CLEAR) is scored as suppressed and never promoted', async () => {
    const id = await createHighDistressProperty('SUPP-001', 'FREE_AND_CLEAR');

    const result = await scoreProperty(id, { asOf: FIXED_AS_OF });

    expect(result.suppressed).toBe(true);
    expect(result.suppressionReason).toContain('FREE_AND_CLEAR');
    expect(result.compositeScore).toBe(0);

    const promotion = await evaluateForPromotion(id, result);
    expect(promotion).toBeNull();

    const promotions = await db
      .select()
      .from(promotedLeads)
      .where(eq(promotedLeads.dominionLeadId, id));
    expect(promotions).toHaveLength(0);
  });

  it('non-suppressed property with same signals IS promoted (control)', async () => {
    const id = await createHighDistressProperty('NORM-001', 'DEFAULT');

    const result = await scoreProperty(id, { asOf: FIXED_AS_OF });

    expect(result.suppressed).toBe(false);
    expect(result.compositeScore).toBeGreaterThan(0);

    const promotion = await evaluateForPromotion(id, result);
    expect(promotion).not.toBeNull();
    expect(promotion!.dominionLeadId).toBe(id);
  });

  it('scoring record captures suppression metadata in scoreInputsSnapshot', async () => {
    const id = await createHighDistressProperty('SUPP-002', 'FREE_AND_CLEAR');
    await scoreProperty(id, { asOf: FIXED_AS_OF });

    const [record] = await db
      .select()
      .from(scoringRecords)
      .where(eq(scoringRecords.dominionLeadId, id));

    expect(record).toBeTruthy();
    const snapshot = record.scoreInputsSnapshot as Record<string, unknown>;
    expect(snapshot.suppressed).toBe(true);
    expect(snapshot.suppressionReason).toBeTruthy();
    expect(snapshot.equityMultiplier).toBeDefined();
  });
});
