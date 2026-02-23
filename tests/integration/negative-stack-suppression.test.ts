/**
 * Charter Phase 1 — Negative-Stack Suppression End-to-End Test
 *
 * Charter §V, §X: "Negative-stack suppression"
 *
 * Tests the FULL pipeline with multiple suppression conditions:
 *   1. Mortgage status suppression (property in active pipeline elsewhere)
 *   2. Ownership duration suppression (likely flipper, not distressed seller)
 *   3. Config change → rescore lifts suppression
 *   4. Full pipeline: suppressed → scored(0) → not promoted → no lead instance
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  distressEvents,
  scoringRecords,
  promotedLeads,
  leadInstances,
  scoringModelConfigs,
} from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { generateEventFingerprint } from '../../src/lib/fingerprint.js';
import { scoreProperty, invalidateConfigCache } from '../../src/modules/scoring/service.js';
import { evaluateForPromotion } from '../../src/modules/promotion/service.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Negative-Stack Suppression End-to-End', () => {
  const db = canRun ? getTestDb() : (null as any);

  const TEST_CONFIG_VERSION = 'v_test_negstack';
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

    // Seed config with ownership-based AND mortgage-based suppression
    await db.insert(scoringModelConfigs).values({
      version: TEST_CONFIG_VERSION,
      confirmedWeights: {
        NOTICE_OF_DEFAULT: { base_weight: 0.95, half_life_days: 90 },
        TAX_DELINQUENCY: { base_weight: 0.80, half_life_days: 120 },
        BANKRUPTCY: { base_weight: 0.85, half_life_days: 120 },
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
        mortgage_statuses: ['FORECLOSURE'],
        max_ownership_months: 6,
        custom_flags: [],
      },
      active: true,
    });

    invalidateConfigCache();
  });

  /** Seed a property with strong confirmed distress events */
  async function seedProperty(apn: string, mortgageStatus: string, ownershipMonths: number) {
    const dominionLeadId = generateId();
    await db.insert(properties).values({
      dominionLeadId,
      propertyId: generateId(),
      apn,
      county: 'MARICOPA',
      state: 'AZ',
      ownerName: 'Test Owner',
      equityEstimate: '100000',
      ownershipDurationMonths: ownershipMonths,
      mortgageStatus: mortgageStatus as any,
    });

    const recentDate = new Date('2026-02-18T10:00:00Z');
    for (const eventType of ['NOTICE_OF_DEFAULT', 'TAX_DELINQUENCY'] as const) {
      const fp = generateEventFingerprint({
        dominionLeadId,
        eventType,
        eventLayer: 'confirmed',
        sourceName: `test-${eventType}`,
        triggerEventDate: recentDate,
      });
      await db.insert(distressEvents).values({
        eventId: generateId(),
        dominionLeadId,
        eventType,
        eventLayer: 'confirmed',
        triggerEventDate: recentDate,
        sourceName: `test-${eventType}`,
        fingerprint: fp,
        reliabilityScore: '0.90',
        freshnessCategory: 'same_day',
      });
    }

    return dominionLeadId;
  }

  describe('Mortgage status suppression', () => {
    it('FORECLOSURE status suppresses scoring and blocks promotion', async () => {
      const id = await seedProperty('NEG-MORT-001', 'FORECLOSURE', 180);
      const result = await scoreProperty(id, { asOf: FIXED_AS_OF });

      expect(result.suppressed).toBe(true);
      expect(result.suppressionReason).toContain('FORECLOSURE');
      expect(result.compositeScore).toBe(0);

      const promotion = await evaluateForPromotion(id, result);
      expect(promotion).toBeNull();
    });
  });

  describe('Ownership duration suppression', () => {
    it('property with < 6 months ownership is suppressed (likely flipper)', async () => {
      const id = await seedProperty('NEG-OWN-001', 'LATE_90', 3);
      const result = await scoreProperty(id, { asOf: FIXED_AS_OF });

      expect(result.suppressed).toBe(true);
      expect(result.suppressionReason).toContain('ownership duration');
      expect(result.compositeScore).toBe(0);

      const promotion = await evaluateForPromotion(id, result);
      expect(promotion).toBeNull();
    });

    it('property with >= 6 months ownership is NOT suppressed', async () => {
      const id = await seedProperty('NEG-OWN-002', 'LATE_90', 12);
      const result = await scoreProperty(id, { asOf: FIXED_AS_OF });

      expect(result.suppressed).toBe(false);
      expect(result.compositeScore).toBeGreaterThan(0);
    });
  });

  describe('Full pipeline: suppression blocks entire flow', () => {
    it('suppressed → scored(0) → not promoted → no lead instance', async () => {
      const id = await seedProperty('NEG-FULL-001', 'FORECLOSURE', 180);

      const result = await scoreProperty(id, { asOf: FIXED_AS_OF });
      expect(result.suppressed).toBe(true);

      const promotion = await evaluateForPromotion(id, result);
      expect(promotion).toBeNull();

      // No downstream artifacts should exist
      const promotions = await db.select().from(promotedLeads)
        .where(eq(promotedLeads.dominionLeadId, id));
      expect(promotions).toHaveLength(0);

      const instances = await db.select().from(leadInstances)
        .where(eq(leadInstances.dominionLeadId, id));
      expect(instances).toHaveLength(0);
    });
  });

  describe('Suppression config changes take effect on rescore', () => {
    it('removing FORECLOSURE from suppression list allows promotion on rescore', async () => {
      const id = await seedProperty('NEG-RECONFIG-001', 'FORECLOSURE', 180);

      // Score 1: suppressed
      const result1 = await scoreProperty(id, { asOf: FIXED_AS_OF });
      expect(result1.suppressed).toBe(true);

      // Update config: clear mortgage suppression list
      await db.update(scoringModelConfigs)
        .set({
          suppressionConfig: {
            mortgage_statuses: [],
            max_ownership_months: 6,
            custom_flags: [],
          },
        })
        .where(eq(scoringModelConfigs.version, TEST_CONFIG_VERSION));
      invalidateConfigCache();

      // Score 2: no longer suppressed
      const result2 = await scoreProperty(id, { asOf: FIXED_AS_OF });
      expect(result2.suppressed).toBe(false);
      expect(result2.compositeScore).toBeGreaterThan(0);

      // Now promotable
      const promotion = await evaluateForPromotion(id, result2);
      expect(promotion).not.toBeNull();
    });
  });

  describe('Scoring record captures suppression metadata', () => {
    it('scoreInputsSnapshot includes suppressed flag, reason, and equityMultiplier', async () => {
      const id = await seedProperty('NEG-SNAP-001', 'FORECLOSURE', 120);
      await scoreProperty(id, { asOf: FIXED_AS_OF });

      const [record] = await db.select().from(scoringRecords)
        .where(eq(scoringRecords.dominionLeadId, id));

      expect(record).toBeTruthy();
      const snapshot = record.scoreInputsSnapshot as Record<string, unknown>;
      expect(snapshot.suppressed).toBe(true);
      expect(snapshot.suppressionReason).toBeTruthy();
      expect(snapshot.equityMultiplier).toBeDefined();
    });
  });
});
