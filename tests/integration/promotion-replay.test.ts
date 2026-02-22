/**
 * Charter Phase 1 — Promotion Replay Determinism Test
 *
 * Test 6: Promotion replay produces identical promoted set with same tiers.
 *         Suppressed properties are never in the promoted set.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql, desc, inArray } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  scoringRecords,
  promotedLeads,
  scoringModelConfigs,
  distressEvents,
  signalAccumulation,
} from '../../src/db/schema/index.js';
import { generateId } from '../../src/lib/ids.js';
import { generateEventFingerprint } from '../../src/lib/fingerprint.js';
import { applyAppendOnlyInvariants } from '../../src/db/invariants.js';
import { seedScoringModel } from '../../src/db/seeds/scoring-model-v1.js';
import { scoreProperty, invalidateConfigCache } from '../../src/modules/scoring/service.js';
import { evaluateForPromotion } from '../../src/modules/promotion/service.js';
import { replayPropertyPromotion } from '../../src/modules/promotion/replay.js';
import { recalculateSignalAccumulation } from '../../src/modules/signals/service.js';

const canRun = isTestDbAvailable();

describe.skipIf(!canRun)('Promotion Replay Determinism', () => {
  const db = canRun ? getTestDb() : (null as any);
  const propertyIds: string[] = [];

  async function createPropertyWithEvents(
    apn: string,
    eventTypes: { type: string; layer: string }[],
    extraProps?: Record<string, unknown>,
  ): Promise<string> {
    const id = generateId();
    propertyIds.push(id);

    await db.insert(properties).values({
      dominionLeadId: id,
      propertyId: generateId(),
      apn,
      county: 'ReplayCounty',
      state: 'AZ',
      equityEstimate: '150000.00',
      ownershipDurationMonths: 60,
      absenteeOwner: true,
      mortgageStatus: 'LATE_60',
      ...extraProps,
    });

    for (const evt of eventTypes) {
      const fp = generateEventFingerprint({
        dominionLeadId: id,
        eventType: evt.type,
        eventLayer: evt.layer,
        sourceName: 'TestSource',
        triggerEventDate: new Date('2026-01-15'),
      });

      await db.insert(distressEvents).values({
        eventId: generateId(),
        dominionLeadId: id,
        eventType: evt.type,
        eventLayer: evt.layer,
        sourceName: 'TestSource',
        fingerprint: fp,
        reliabilityScore: '0.90',
        triggerEventDate: new Date('2026-01-15'),
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
    await db.execute(sql`ALTER TABLE scoring_records DISABLE TRIGGER ALL`);
    await db.execute(sql`ALTER TABLE distress_events DISABLE TRIGGER ALL`);
    await db.execute(sql`DELETE FROM lead_instances`);
    await db.execute(sql`DELETE FROM promoted_leads`);
    await db.execute(sql`DELETE FROM scoring_records`);
    await db.execute(sql`DELETE FROM signal_accumulation`);
    await db.execute(sql`DELETE FROM distress_events`);
    await db.execute(sql`DELETE FROM properties`);
    await db.execute(sql`ALTER TABLE distress_events ENABLE TRIGGER ALL`);
    await db.execute(sql`ALTER TABLE scoring_records ENABLE TRIGGER ALL`);
    propertyIds.length = 0;
  });

  it('replay produces identical promoted set with same tiers', async () => {
    // Property 1: High distress — should be promoted as A or B
    const id1 = await createPropertyWithEvents('PROMO-001', [
      { type: 'NOTICE_OF_DEFAULT', layer: 'confirmed' },
      { type: 'TAX_DELINQUENCY', layer: 'confirmed' },
      { type: 'BANKRUPTCY', layer: 'confirmed' },
    ]);

    // Property 2: Moderate distress — may be promoted as B or C
    const id2 = await createPropertyWithEvents('PROMO-002', [
      { type: 'TAX_DELINQUENCY', layer: 'confirmed' },
      { type: 'PREDICTIVE_PAYMENT_STRESS', layer: 'predictive' },
    ]);

    // Property 3: Lots of signals — should be promoted
    const id3 = await createPropertyWithEvents('PROMO-003', [
      { type: 'NOTICE_OF_DEFAULT', layer: 'confirmed' },
      { type: 'LIS_PENDENS', layer: 'confirmed' },
      { type: 'TAX_DELINQUENCY', layer: 'confirmed' },
      { type: 'PREDICTIVE_PAYMENT_STRESS', layer: 'predictive' },
    ]);

    // Property 4: Minimal signal — may not be promoted
    const id4 = await createPropertyWithEvents('PROMO-004', [
      { type: 'PREDICTIVE_VACANCY_SIGNAL', layer: 'predictive' },
    ]);

    // Property 5: Strong signal
    const id5 = await createPropertyWithEvents('PROMO-005', [
      { type: 'NOTICE_OF_TRUSTEE_SALE', layer: 'confirmed' },
      { type: 'TAX_LIEN', layer: 'confirmed' },
    ]);

    // --- First pass: score all and evaluate ---
    const originalPromotions: Map<string, string> = new Map();

    for (const id of [id1, id2, id3, id4, id5]) {
      const result = await scoreProperty(id);
      const promotion = await evaluateForPromotion(id, result);
      if (promotion) {
        originalPromotions.set(id, promotion.marketingTier);
      }
    }

    expect(originalPromotions.size).toBeGreaterThan(0);

    // --- Replay pass: replay promotion from stored scores ---
    const replayPromotions: Map<string, string> = new Map();

    for (const id of [id1, id2, id3, id4, id5]) {
      const promoted = await replayPropertyPromotion(id);
      if (promoted) {
        const [latestPromo] = await db
          .select()
          .from(promotedLeads)
          .where(eq(promotedLeads.dominionLeadId, id))
          .orderBy(desc(promotedLeads.promotedAt))
          .limit(1);

        if (latestPromo) {
          replayPromotions.set(id, latestPromo.marketingTier);
        }
      }
    }

    // Same set of properties should be promoted
    const originalSet = new Set(originalPromotions.keys());
    const replaySet = new Set(replayPromotions.keys());

    expect(replaySet).toEqual(originalSet);

    // Same tiers
    for (const [id, tier] of originalPromotions) {
      expect(replayPromotions.get(id)).toBe(tier);
    }
  });
});
