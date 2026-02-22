import type { IngestionAdapter, NormalizedRecord } from './interface.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';

/**
 * PropertyRadar API adapter.
 *
 * PropertyRadar provides:
 * - Foreclosure filings (NOD, NTS, Lis Pendens)
 * - Tax delinquency
 * - Probate
 * - Bankruptcy
 * - HOA liens
 * - Code enforcement
 *
 * API docs: https://www.propertyradar.com/api (requires account)
 */

// Map PropertyRadar event types to Ranger canonical types
const EVENT_TYPE_MAP: Record<string, { type: string; layer: 'confirmed' | 'predictive'; reliability: number }> = {
  'notice_of_default': { type: 'NOTICE_OF_DEFAULT', layer: 'confirmed', reliability: 0.95 },
  'lis_pendens': { type: 'LIS_PENDENS', layer: 'confirmed', reliability: 0.95 },
  'notice_of_trustee_sale': { type: 'NOTICE_OF_TRUSTEE_SALE', layer: 'confirmed', reliability: 0.95 },
  'tax_default': { type: 'TAX_DELINQUENCY', layer: 'confirmed', reliability: 0.90 },
  'tax_lien': { type: 'TAX_LIEN', layer: 'confirmed', reliability: 0.90 },
  'probate': { type: 'PROBATE', layer: 'confirmed', reliability: 0.90 },
  'bankruptcy': { type: 'BANKRUPTCY', layer: 'confirmed', reliability: 0.95 },
  'hoa_lien': { type: 'HOA_LIEN', layer: 'confirmed', reliability: 0.85 },
  'code_violation': { type: 'CODE_ENFORCEMENT', layer: 'confirmed', reliability: 0.80 },
  'mechanic_lien': { type: 'MECHANIC_LIEN', layer: 'confirmed', reliability: 0.85 },
  'judgment': { type: 'JUDGMENT_LIEN', layer: 'confirmed', reliability: 0.85 },
};

interface PropertyRadarRecord {
  apn?: string;
  county?: string;
  state?: string;
  site_address?: string;
  site_city?: string;
  site_zip?: string;
  owner_first?: string;
  owner_last?: string;
  owner_name?: string;
  mail_address?: string;
  event_type?: string;
  filing_date?: string;
  recorded_date?: string;
  [key: string]: unknown;
}

export class PropertyRadarAdapter implements IngestionAdapter {
  readonly name = 'property_radar';
  readonly description = 'PropertyRadar — foreclosure, tax, lien, and distress event data';
  readonly sourceType = 'api' as const;

  private apiKey: string;
  private baseUrl = 'https://api.propertyradar.com/v1';

  constructor() {
    this.apiKey = env.PROPERTY_RADAR_API_KEY ?? '';
  }

  async *fetchRecords(options?: Record<string, unknown>): AsyncGenerator<NormalizedRecord[], void, unknown> {
    if (!this.apiKey) {
      logger.warn('PropertyRadar API key not configured, skipping');
      return;
    }

    // In production, this would paginate through the PropertyRadar API.
    // For now, this is the adapter skeleton with the normalization logic in place.
    // The actual API integration will be wired when we have live API access.

    logger.info({ adapter: this.name }, 'PropertyRadar fetch initiated');

    // Placeholder for API pagination
    // Each yield returns a batch of normalized records
    // yield normalizeRecords(rawRecords);

    yield [];
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      // Placeholder health check — would hit API status endpoint
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Normalize a batch of PropertyRadar records into Ranger format.
   * This is the critical normalization function.
   */
  normalizeRecords(records: PropertyRadarRecord[]): NormalizedRecord[] {
    return records
      .map((raw) => this.normalizeRecord(raw))
      .filter((r): r is NormalizedRecord => r !== null);
  }

  private normalizeRecord(raw: PropertyRadarRecord): NormalizedRecord | null {
    // Must have at least APN or address for identity
    if (!raw.apn && !raw.site_address) {
      logger.debug({ raw }, 'PropertyRadar record missing identity fields, skipping');
      return null;
    }

    const eventMapping = raw.event_type ? EVENT_TYPE_MAP[raw.event_type.toLowerCase()] : null;

    const events: NormalizedRecord['events'] = [];
    if (eventMapping) {
      events.push({
        eventType: eventMapping.type as any,
        eventLayer: eventMapping.layer,
        filingDate: raw.filing_date ? new Date(raw.filing_date) : null,
        recordedDate: raw.recorded_date ? new Date(raw.recorded_date) : null,
        triggerEventDate: raw.filing_date ? new Date(raw.filing_date) : null,
        sourceName: this.name,
        reliabilityScore: eventMapping.reliability,
        rawEventPayload: raw,
      });
    }

    return {
      property: {
        apn: raw.apn ?? null,
        county: raw.county ?? null,
        state: raw.state ?? null,
        streetAddress: raw.site_address ?? null,
        city: raw.site_city ?? null,
        zip: raw.site_zip ?? null,
        ownerFirst: raw.owner_first ?? null,
        ownerLast: raw.owner_last ?? null,
        ownerName: raw.owner_name ?? null,
        mailingAddress: raw.mail_address ?? null,
      },
      events,
    };
  }
}
