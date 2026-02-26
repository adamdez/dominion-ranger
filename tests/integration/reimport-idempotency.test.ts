/**
 * Charter Phase 1 — Reimport Idempotency Tests (Agent 2)
 *
 * Validates corrected pipeline:
 *   - Same CSV imported 3x → no property growth
 *   - Reimport updates property data
 *   - Reimport deduplicates events
 *   - Reimport with new events triggers rescoring
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, cleanupTables, closeTestDb, isTestDbAvailable } from '../helpers/test-db.js';
import {
  properties,
  distressEvents,
  scoringRecords,
} from '../../src/db/schema/index.js';
import { processRecord } from '../../src/ingestion/pipeline.js';
import type { NormalizedRecord } from '../../src/ingestion/adapters/interface.js';
import { applyAppendOnlyInvariants } from '../../src/db/invariants.js';
import { seedScoringModel } from '../../src/db/seeds/scoring-model-v1.js';
import { invalidateConfigCache } from '../../src/modules/scoring/index.js';

const canRun = isTestDbAvailable();

function createMockRecord(
  apn: string,
  county: string,
  overrides?: Partial<{
    phone: string;
    streetAddress: string;
    city: string;
    events: NormalizedRecord['events'];
  }>,
): NormalizedRecord {
  const base = {
    property: {
      apn,
      county,
      state: 'AZ',
      streetAddress: overrides?.streetAddress ?? '123 Main St',
      city: overrides?.city ?? 'Phoenix',
      zip: '85001',
      ownerName: 'Test Owner',
      phone: overrides?.phone ?? null,
    },
    events: overrides?.events ?? [
      {
        eventType: 'NOTICE_OF_DEFAULT',
        eventLayer: 'confirmed',
        sourceName: 'ReimportTest',
        reliabilityScore: 0.9,
        triggerEventDate: new Date('2026-02-10'),
      },
      {
        eventType: 'TAX_DELINQUENCY',
        eventLayer: 'confirmed',
        sourceName: 'ReimportTest',
        reliabilityScore: 0.85,
        triggerEventDate: new Date('2026-02-10'),
      },
    ],
  };
  return base as NormalizedRecord;
}

describe.skipIf(!canRun)('Reimport Idempotency (Charter Mandatory)', () => {
  const db = canRun ? getTestDb() : (null as never);

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
    await cleanupTables();
    await seedScoringModel();
    invalidateConfigCache();
  });

  it('a) same CSV imported 3x → no property growth', async () => {
    const record = createMockRecord('REIMPORT-001', 'IdempotencyCounty');
    const stats = {
      adapterName: 'test',
      recordsProcessed: 0,
      propertiesCreated: 0,
      propertiesUpdated: 0,
      eventsIngested: 0,
      eventsDeduplicated: 0,
      propertiesScored: 0,
      leadsPromoted: 0,
      sentinelDispatched: 0,
      skippedExisting: 0,
      skippedInvalid: 0,
      errors: 0,
      durationMs: 0,
    };

    await processRecord(record, stats);
    expect(stats.propertiesCreated).toBe(1);
    expect(stats.propertiesUpdated).toBe(0);

    await processRecord(record, stats);
    expect(stats.propertiesUpdated).toBe(1);

    await processRecord(record, stats);
    expect(stats.propertiesUpdated).toBe(2);

    const [count] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(properties)
      .where(eq(properties.apn, 'REIMPORT-001'));

    expect(count.count).toBe(1);
  });

  it('b) reimport updates property data', async () => {
    const record1 = createMockRecord('REIMPORT-UPD-001', 'IdempotencyCounty', {
      phone: '5551234567',
    });
    const record2 = createMockRecord('REIMPORT-UPD-001', 'IdempotencyCounty', {
      phone: '5559999999',
    });

    await processRecord(record1);
    await processRecord(record2);

    const [prop] = await db
      .select({ phone: properties.phone })
      .from(properties)
      .where(
        eq(properties.apn, 'REIMPORT-UPD-001'),
      );

    expect(prop).toBeDefined();
    expect(prop.phone).toBe('5559999999');
  });

  it('c) reimport deduplicates events', async () => {
    const record = createMockRecord('REIMPORT-DEDUP-001', 'IdempotencyCounty');
    const stats: Parameters<typeof processRecord>[1] = {
      adapterName: 'test',
      recordsProcessed: 0,
      propertiesCreated: 0,
      propertiesUpdated: 0,
      eventsIngested: 0,
      eventsDeduplicated: 0,
      propertiesScored: 0,
      leadsPromoted: 0,
      sentinelDispatched: 0,
      skippedExisting: 0,
      skippedInvalid: 0,
      errors: 0,
      durationMs: 0,
    };

    await processRecord(record, stats);
    const firstIngested = stats.eventsIngested;
    const firstDeduped = stats.eventsDeduplicated;

    await processRecord(record, stats);
    expect(stats.eventsDeduplicated).toBe(firstDeduped + 2);

    const [prop] = await db.select().from(properties).where(eq(properties.apn, 'REIMPORT-DEDUP-001'));
    const [evtCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(distressEvents)
      .where(eq(distressEvents.dominionLeadId, prop.dominionLeadId));

    expect(evtCount.count).toBe(2);
  });

  it('d) reimport with new events triggers rescoring', async () => {
    const record1 = createMockRecord('REIMPORT-RESCORE-001', 'IdempotencyCounty', {
      events: [
        {
          eventType: 'NOTICE_OF_DEFAULT',
          eventLayer: 'confirmed',
          sourceName: 'ReimportTest',
          reliabilityScore: 0.9,
          triggerEventDate: new Date('2026-02-10'),
        },
      ],
    });
    const record2 = createMockRecord('REIMPORT-RESCORE-001', 'IdempotencyCounty', {
      events: [
        {
          eventType: 'NOTICE_OF_DEFAULT',
          eventLayer: 'confirmed',
          sourceName: 'ReimportTest',
          reliabilityScore: 0.9,
          triggerEventDate: new Date('2026-02-10'),
        },
        {
          eventType: 'TAX_DELINQUENCY',
          eventLayer: 'confirmed',
          sourceName: 'ReimportTest',
          reliabilityScore: 0.85,
          triggerEventDate: new Date('2026-02-15'),
        },
      ],
    });

    await processRecord(record1);

    const [prop] = await db.select().from(properties).where(eq(properties.apn, 'REIMPORT-RESCORE-001'));
    const dominionLeadId = prop.dominionLeadId;

    const [countBefore] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(scoringRecords)
      .where(eq(scoringRecords.dominionLeadId, dominionLeadId));

    await processRecord(record2);

    const [countAfter] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(scoringRecords)
      .where(eq(scoringRecords.dominionLeadId, dominionLeadId));

    expect(countAfter.count).toBeGreaterThan(countBefore.count);
  });
});
