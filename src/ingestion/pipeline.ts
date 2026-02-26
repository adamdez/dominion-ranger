import { and, eq, sql } from 'drizzle-orm';
import type { NormalizedRecord } from './adapters/interface.js';
import { getAllIngestionAdapters } from './adapters/registry.js';
import { findOrCreateProperty } from '../modules/properties/service.js';
import { db } from '../db/connection.js';
import { properties } from '../db/schema/index.js';
import { ingestDistressEvent } from '../modules/distress-events/service.js';
import { recalculateSignalAccumulation } from '../modules/signals/service.js';
import { scoreProperty } from '../modules/scoring/service.js';
import { logAudit } from '../modules/compliance/service.js';
import { withRunLogging } from './run-logger.js';
import { logger } from '../config/logger.js';

export interface PipelineStats {
  adapterName: string;
  recordsProcessed: number;
  propertiesCreated: number;
  propertiesUpdated: number;
  eventsIngested: number;
  eventsDeduplicated: number;
  propertiesScored: number;
  leadsPromoted: number;
  sentinelDispatched: number;
  skippedExisting: number;
  skippedInvalid?: number;
  errors: number;
  durationMs: number;
}

/**
 * Run the full ingestion pipeline for a single adapter.
 *
 * Flow per record:
 * 1. Find or create property (atomic ON CONFLICT upsert)
 * 2. Ingest distress events (atomic fingerprint dedup)
 * 3. Recalculate signal accumulation
 * 4. Re-score property
 * 5. Evaluate for promotion
 * 6. Dispatch to Sentinel if promoted
 *
 * Charter doctrine: Signal -> Score -> Rank -> Promote
 */
export async function runAdapterPipeline(adapterName: string, options?: Record<string, unknown>): Promise<PipelineStats> {
  return withRunLogging(adapterName, null, () => runAdapterPipelineInternal(adapterName, options));
}

async function runAdapterPipelineInternal(adapterName: string, options?: Record<string, unknown>): Promise<PipelineStats> {
  const adapter = getAllIngestionAdapters().find((a) => a.name === adapterName);
  if (!adapter) {
    throw new Error(`Adapter not found: ${adapterName}`);
  }

  const startTime = Date.now();
  const stats: PipelineStats = {
    adapterName,
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

  // Pre-fetch existing (apn, county) for O(1) skip lookup
  const existingApnCounty = new Set(
    (await db
      .select({ apn: properties.apn, county: properties.county })
      .from(properties)
      .where(and(
        sql`${properties.apn} IS NOT NULL`,
        sql`${properties.county} IS NOT NULL`,
      )))
      .map((r) => `${r.apn}|${r.county}`),
  );

  logger.info({ adapter: adapterName }, 'Pipeline run started');

  try {
    for await (const batch of adapter.fetchRecords(options)) {
      for (const record of batch) {
        try {
          await processRecord(record, stats, existingApnCounty);
        } catch (err) {
          stats.errors++;
          logger.error({ err, adapter: adapterName }, 'Error processing record');
        }
      }
    }
  } catch (err) {
    logger.error({ err, adapter: adapterName }, 'Adapter fetch failed');
    stats.errors++;
  }

  stats.durationMs = Date.now() - startTime;

  logger.info(
    {
      totalRows: stats.recordsProcessed + stats.skippedExisting + (stats.skippedInvalid ?? 0),
      imported: stats.propertiesCreated + stats.propertiesUpdated,
      skippedExisting: stats.skippedExisting,
      skippedInvalid: stats.skippedInvalid ?? 0,
      errors: stats.errors,
    },
    'Import pipeline completed',
  );

  await logAudit({
    actionType: 'pipeline.run_completed',
    metadata: stats as unknown as Record<string, unknown>,
  });

  logger.info({ stats }, 'Pipeline run completed');
  return stats;
}

/**
 * Process a single normalized record through the full pipeline.
 *
 * Early exit: skip entirely if property already exists (apn+county match).
 * Atomic operations throughout:
 *   - Property identity via ON CONFLICT DO UPDATE (no SELECT-then-INSERT)
 *   - Event dedup via fingerprint ON CONFLICT DO NOTHING (no SELECT-then-INSERT)
 */
export async function processRecord(
  record: NormalizedRecord,
  stats?: PipelineStats,
  existingApnCounty?: Set<string>,
): Promise<void> {
  const s = stats ?? createEmptyStats();

  // Skip rows with no real address — these are junk data
  const street = record.property.streetAddress ?? '';
  const city = record.property.city ?? '';
  const isJunkAddress =
    !street ||
    street.toLowerCase() === 'unknown' ||
    street.toLowerCase() === 'n/a' ||
    street.trim() === '' ||
    city.toLowerCase() === 'unknown' ||
    city.trim() === '';

  if (isJunkAddress) {
    logger.debug(
      {
        rawAddress: street,
        rawCity: city,
        ownerName: record.property.ownerName ?? 'unknown',
      },
      'Skipping CSV row with missing/invalid address',
    );
    s.skippedInvalid = (s.skippedInvalid ?? 0) + 1;
    return;
  }

  // Early exit: skip if property already exists (avoids normalization, events, scoring)
  const apn = record.property.apn;
  const county = record.property.county;
  if (apn && county && existingApnCounty?.has(`${apn}|${county}`)) {
    s.skippedExisting++;
    return;
  }

  s.recordsProcessed++;

  const { property, created } = await findOrCreateProperty(record.property);
  if (created) {
    s.propertiesCreated++;
    if (apn && county) existingApnCounty?.add(`${apn}|${county}`);
  } else {
    s.propertiesUpdated++;
  }

  let newEventsIngested = false;
  for (const eventInput of record.events) {
    const event = await ingestDistressEvent({
      ...eventInput,
      dominionLeadId: property.dominionLeadId,
    });

    if (event) {
      s.eventsIngested++;
      newEventsIngested = true;
    } else {
      s.eventsDeduplicated++;
    }
  }

  if (!newEventsIngested) return;

  await recalculateSignalAccumulation(property.dominionLeadId);

  const scoringResult = await scoreProperty(property.dominionLeadId);
  s.propertiesScored++;

  // Promotion removed — funnel management is manual
}

/**
 * Run all configured adapters sequentially.
 */
export async function runFullIngestion(options?: Record<string, unknown>): Promise<PipelineStats[]> {
  const adapters = getAllIngestionAdapters();
  const results: PipelineStats[] = [];

  for (const adapter of adapters) {
    const healthy = await adapter.healthCheck();
    if (!healthy) {
      logger.warn({ adapter: adapter.name }, 'Adapter health check failed, skipping');
      continue;
    }

    const stats = await runAdapterPipeline(adapter.name, options);
    results.push(stats);
  }

  return results;
}

function createEmptyStats(): PipelineStats {
  return {
    adapterName: 'manual',
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
}
