import type { IngestionAdapter, EnrichmentAdapter } from './interface.js';
import { PropertyRadarAdapter } from './property-radar.js';
import { RegridAdapter } from './regrid.js';
import { ForeclosureRadarAdapter } from './foreclosure-radar.js';
import { REISkipAdapter } from './reiskip.js';
import { CsvAdapter } from './csv-import.js';
import { logger } from '../../config/logger.js';

/**
 * Adapter registry.
 *
 * Centralizes all data source adapters. The pipeline references adapters
 * by name through this registry rather than importing them directly.
 * Adding a new source = create adapter class + register here.
 */

const ingestionAdapters = new Map<string, IngestionAdapter>();
const enrichmentAdapters = new Map<string, EnrichmentAdapter>();

export function registerIngestionAdapter(adapter: IngestionAdapter): void {
  ingestionAdapters.set(adapter.name, adapter);
  logger.info({ adapter: adapter.name }, 'Ingestion adapter registered');
}

export function registerEnrichmentAdapter(adapter: EnrichmentAdapter): void {
  enrichmentAdapters.set(adapter.name, adapter);
  logger.info({ adapter: adapter.name }, 'Enrichment adapter registered');
}

export function getIngestionAdapter(name: string): IngestionAdapter | undefined {
  return ingestionAdapters.get(name);
}

export function getEnrichmentAdapter(name: string): EnrichmentAdapter | undefined {
  return enrichmentAdapters.get(name);
}

export function getAllIngestionAdapters(): IngestionAdapter[] {
  return Array.from(ingestionAdapters.values());
}

export function getAllEnrichmentAdapters(): EnrichmentAdapter[] {
  return Array.from(enrichmentAdapters.values());
}

/**
 * Initialize all known adapters. Called once at startup.
 */
export function initializeAdapters(): void {
  registerIngestionAdapter(new PropertyRadarAdapter());
  registerIngestionAdapter(new RegridAdapter());
  registerIngestionAdapter(new ForeclosureRadarAdapter());
  registerIngestionAdapter(new CsvAdapter());
  registerEnrichmentAdapter(new REISkipAdapter());

  logger.info(
    {
      ingestion: Array.from(ingestionAdapters.keys()),
      enrichment: Array.from(enrichmentAdapters.keys()),
    },
    'All adapters initialized',
  );
}
