import type { NormalizedRecord } from './adapters/interface.js';
import { getAllIngestionAdapters } from './adapters/registry.js';
import { findOrCreateProperty } from '../modules/properties/service.js';
import { ingestDistressEvent, isDuplicateEvent } from '../modules/distress-events/service.js';
import { recalculateSignalAccumulation } from '../modules/signals/service.js';
import { scoreProperty } from '../modules/scoring/service.js';
import { evaluateForPromotion } from '../modules/promotion/service.js';
import { dispatchToSentinel } from '../modules/sentinel/service.js';
import { logAudit } from '../modules/compliance/service.js';
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
  errors: number;
  durationMs: number;
}

/**
 * Run the full ingestion pipeline for a single adapter.
 *
 * Flow per record:
 * 1. Find or create property (identity resolution)
 * 2. Ingest distress events (dedup check, append-only)
 * 3. Recalculate signal accumulation
 * 4. Re-score property
 * 5. Evaluate for promotion
 * 6. Dispatch to Sentinel if promoted
 *
 * Charter doctrine: Signal → Score → Rank → Promote
 */
export async function runAdapterPipeline(adapterName: string, options?: Record<string, unknown>): Promise<PipelineStats> {
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
    errors: 0,
    durationMs: 0,
  };

  logger.info({ adapter: adapterName }, 'Pipeline run started');

  try {
    for await (const batch of adapter.fetchRecords(options)) {
      for (const record of batch) {
        try {
          await processRecord(record, stats);
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

  // Audit the pipeline run
  await logAudit({
    actionType: 'pipeline.run_completed',
    metadata: stats,
  });

  logger.info({ stats }, 'Pipeline run completed');
  return stats;
}

/**
 * Process a single normalized record through the full pipeline.
 * Can also be called directly for manual/batch ingestion.
 */
export async function processRecord(record: NormalizedRecord, stats?: PipelineStats): Promise<void> {
  const s = stats ?? createEmptyStats();

  s.recordsProcessed++;

  // Step 1: Identity resolution
  const { property, created } = await findOrCreateProperty(record.property);
  if (created) {
    s.propertiesCreated++;
  } else {
    s.propertiesUpdated++;
  }

  // Step 2: Ingest distress events
  let newEventsIngested = false;
  for (const eventInput of record.events) {
    // Dedup check
    const isDupe = await isDuplicateEvent(
      property.dominionLeadId,
      eventInput.eventType,
      eventInput.sourceName,
      eventInput.triggerEventDate ?? null,
    );

    if (isDupe) {
      s.eventsDeduplicated++;
      continue;
    }

    await ingestDistressEvent({
      ...eventInput,
      dominionLeadId: property.dominionLeadId,
    });
    s.eventsIngested++;
    newEventsIngested = true;
  }

  // Only re-score if new events were ingested (performance optimization)
  if (!newEventsIngested) return;

  // Step 3: Recalculate signal accumulation
  await recalculateSignalAccumulation(property.dominionLeadId);

  // Step 4: Score property
  const scoringResult = await scoreProperty(property.dominionLeadId);
  s.propertiesScored++;

  // Step 5: Evaluate for promotion
  const promotion = await evaluateForPromotion(property.dominionLeadId, scoringResult);
  if (promotion) {
    s.leadsPromoted++;

    // Step 6: Dispatch to Sentinel
    const dispatched = await dispatchToSentinel(promotion, property);
    if (dispatched) {
      s.sentinelDispatched++;
    }
  }
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
    errors: 0,
    durationMs: 0,
  };
}
