/**
 * Charter v2.3 — E2E Pipeline Wiring Audit Test
 *
 * Verifies that each pipeline stage is correctly wired:
 *   Import → Score → Promote → Assign → Compliance → Dial
 *
 * Uses a real test database to verify the full lifecycle.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql, count } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  distressEvents,
  scoringRecords,
  leadInstances,
  scoringModelConfigs,
} from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { scoreProperty } from '../../src/modules/scoring/service.js';
import { evaluateForPromotion } from '../../src/modules/promotion/service.js';
import { claimLead, runComplianceGating } from '../../src/modules/workflow/service.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('E2E Pipeline Wiring', () => {
  const db = canRun ? getTestDb() : (null as any);

  beforeAll(async () => {
    await cleanupTables();
  });

  afterAll(async () => {
    await cleanupTables();
    await closeTestDb();
  });

  it('full pipeline: property → event → score → promote → assign → compliance', async () => {
    // Stage 1: Create a property
    const dominionLeadId = generateId();
    await db.insert(properties).values({
      dominionLeadId,
      propertyId: generateId(),
      apn: 'E2E-001',
      county: 'TestCounty',
      state: 'WA',
      phone: '555-E2E',
      ownerName: 'Pipeline Test Owner',
    });

    const [propCount] = await db.select({ n: count() }).from(properties);
    expect(propCount.n).toBeGreaterThanOrEqual(1);

    // Stage 2: Create distress events
    const events = [
      {
        eventId: generateId(),
        dominionLeadId,
        eventType: 'LIS_PENDENS',
        eventLayer: 'COURT_FILING',
        sourceFile: 'e2e-test',
        fingerprint: `fp-e2e-${Date.now()}-a`,
        recordedDate: new Date('2026-01-15'),
        severity: 8,
      },
      {
        eventId: generateId(),
        dominionLeadId,
        eventType: 'TAX_DELINQUENCY',
        eventLayer: 'TAX_RECORD',
        sourceFile: 'e2e-test',
        fingerprint: `fp-e2e-${Date.now()}-b`,
        recordedDate: new Date('2026-02-01'),
        severity: 7,
      },
    ];

    for (const evt of events) {
      await db.insert(distressEvents).values(evt);
    }

    const [evtCount] = await db
      .select({ n: count() })
      .from(distressEvents)
      .where(eq(distressEvents.dominionLeadId, dominionLeadId));
    expect(evtCount.n).toBe(2);

    // Stage 3: Seed a scoring config and score the property
    const configId = generateId();
    await db.insert(scoringModelConfigs).values({
      configId,
      version: 'e2e-test-v1',
      motivationWeights: {
        LIS_PENDENS: 30,
        TAX_DELINQUENCY: 25,
        NOTICE_OF_DEFAULT: 20,
        MECHANIC_LIEN: 15,
        CODE_VIOLATION: 10,
        UTILITY_SHUTOFF: 5,
      },
      decayConfig: { halfLifeDays: 180 },
      tierThresholds: { A: 80, B: 60, C: 40 },
      confidenceConfig: {
        minEvents: 1,
        recencyBoostDays: 30,
        recencyBoostMultiplier: 1.2,
        diversity_bonus: 0.1,
        confirmed_presence_bonus: 0.15,
        source_count_weight: 0.05,
        min_signals_for_high: 5,
      },
      equityConfig: {
        ranges: [
          { min: 0, max: 20, multiplier: 0.5 },
          { min: 20, max: 40, multiplier: 0.8 },
          { min: 40, max: 60, multiplier: 1.0 },
          { min: 60, max: 80, multiplier: 1.2 },
          { min: 80, max: 100, multiplier: 1.5 },
        ],
        default_multiplier: 1.0,
      },
      dealScoreConfig: {
        equity_weight: 0.3,
        ownership_weight: 0.2,
        absentee_weight: 15,
        mortgage_weight: 0.1,
        equity_thresholds: { low: 20, mid: 50, high: 80 },
        ownership_thresholds: { short_months: 24, long_months: 120 },
        mortgage_severity: {
          CURRENT: 0,
          DELINQUENT: 10,
          DEFAULT: 20,
          FORECLOSURE: 25,
          UNKNOWN: 5,
        },
        equity_factors: { high: 100, mid: 70, low: 40, floor: 10 },
        ownership_factors: { long: 80, short: 40, floor: 10 },
      },
      compositeWeights: { motivation_weight: 0.65, deal_weight: 0.35 },
      suppressionConfig: { mortgage_statuses: [], custom_flags: [] },
      active: true,
    });

    const scoreResult = await scoreProperty(dominionLeadId, {});
    expect(scoreResult).toBeDefined();
    expect(scoreResult.compositeScore).toBeGreaterThan(0);

    const [scoreCount] = await db
      .select({ n: count() })
      .from(scoringRecords)
      .where(eq(scoringRecords.dominionLeadId, dominionLeadId));
    expect(scoreCount.n).toBeGreaterThanOrEqual(1);

    // Stage 4: Evaluate for promotion
    const promotion = await evaluateForPromotion(dominionLeadId, scoreResult);
    expect(promotion).toBeDefined();

    // Stage 5: Check if a lead instance was created
    const [leadCount] = await db
      .select({ n: count() })
      .from(leadInstances)
      .where(eq(leadInstances.dominionLeadId, dominionLeadId));

    if (leadCount.n > 0) {
      // Stage 6: Claim the lead
      const [lead] = await db
        .select()
        .from(leadInstances)
        .where(eq(leadInstances.dominionLeadId, dominionLeadId))
        .limit(1);

      const claimed = await claimLead({
        leadInstanceId: lead.leadInstanceId,
        userId: 'e2e-test-agent',
        expectedVersion: lead.version,
      });
      expect(claimed.status).toBe('ASSIGNED');
      expect(claimed.assignedTo).toBe('e2e-test-agent');

      // Stage 7: Run compliance gating
      const compliant = await runComplianceGating(claimed.leadInstanceId);
      expect(compliant.status).toBe('DIAL_READY');
      expect(compliant.complianceCleared).toBe(true);
    }
  });

  it('scoring without config throws validation error', async () => {
    await db.execute(sql`DELETE FROM scoring_model_configs`);

    const dominionLeadId = generateId();
    await db.insert(properties).values({
      dominionLeadId,
      propertyId: generateId(),
      apn: 'NOCONFIG-001',
      county: 'TestCounty',
      state: 'WA',
    });

    await expect(scoreProperty(dominionLeadId, {})).rejects.toThrow();
  });
});
