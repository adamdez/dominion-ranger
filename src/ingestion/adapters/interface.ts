import type { PropertyData } from '../modules/properties/service.js';
import type { DistressEventInput } from '../modules/distress-events/service.js';

/**
 * Normalized record from any data source adapter.
 *
 * Every adapter must normalize its raw provider data into this format.
 * The pipeline doesn't know or care about source-specific formats.
 */
export interface NormalizedRecord {
  property: PropertyData;
  events: Omit<DistressEventInput, 'dominionLeadId'>[];
}

/**
 * Interface every data source adapter must implement.
 *
 * Adapters are responsible for:
 * 1. Connecting to their source (API, file, etc.)
 * 2. Fetching raw records
 * 3. Normalizing into NormalizedRecord format
 * 4. Handling pagination, rate limiting, auth
 */
export interface IngestionAdapter {
  /** Unique identifier for this adapter */
  readonly name: string;

  /** Human-readable description */
  readonly description: string;

  /** Source type for audit trail */
  readonly sourceType: 'api' | 'file' | 'manual';

  /**
   * Fetch and normalize records from the source.
   *
   * @param options - Adapter-specific options (date range, filters, etc.)
   * @returns Array of normalized records ready for pipeline ingestion
   */
  fetchRecords(options?: Record<string, unknown>): AsyncGenerator<NormalizedRecord[], void, unknown>;

  /**
   * Check if the adapter is healthy and can connect to its source.
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Enrichment adapter interface — augments existing properties.
 * Different from ingestion adapters (which create events).
 * REISkip is the primary example.
 */
export interface EnrichmentAdapter {
  readonly name: string;
  readonly description: string;

  /**
   * Enrich a property with additional data (phone, email, etc.)
   */
  enrichProperty(property: {
    ownerFirst?: string | null;
    ownerLast?: string | null;
    streetAddress?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  }): Promise<{
    phone?: string;
    email?: string;
    mailingAddress?: string;
    additionalPhones?: string[];
    additionalEmails?: string[];
  } | null>;

  healthCheck(): Promise<boolean>;
}
