import type { IngestionAdapter, NormalizedRecord } from './interface.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';

/**
 * ForeclosureRadar adapter.
 *
 * ForeclosureRadar provides:
 * - Notice of Default (NOD)
 * - Notice of Trustee Sale (NTS)
 * - Lis Pendens
 * - Auction schedules and results
 *
 * All confirmed Layer B events with very high reliability.
 * ForeclosureRadar scrapes directly from county recorder offices.
 */

const EVENT_TYPE_MAP: Record<string, { type: string; layer: 'confirmed'; reliability: number }> = {
  'nod': { type: 'NOTICE_OF_DEFAULT', layer: 'confirmed', reliability: 0.98 },
  'notice_of_default': { type: 'NOTICE_OF_DEFAULT', layer: 'confirmed', reliability: 0.98 },
  'nts': { type: 'NOTICE_OF_TRUSTEE_SALE', layer: 'confirmed', reliability: 0.98 },
  'notice_of_trustee_sale': { type: 'NOTICE_OF_TRUSTEE_SALE', layer: 'confirmed', reliability: 0.98 },
  'lis_pendens': { type: 'LIS_PENDENS', layer: 'confirmed', reliability: 0.95 },
  'lp': { type: 'LIS_PENDENS', layer: 'confirmed', reliability: 0.95 },
};

interface ForeclosureRadarRecord {
  apn?: string;
  county?: string;
  state?: string;
  property_address?: string;
  property_city?: string;
  property_zip?: string;
  borrower_name?: string;
  recording_date?: string;
  filing_date?: string;
  document_type?: string;
  trustee?: string;
  loan_amount?: number;
  auction_date?: string;
  [key: string]: unknown;
}

export class ForeclosureRadarAdapter implements IngestionAdapter {
  readonly name = 'foreclosure_radar';
  readonly description = 'ForeclosureRadar — NOD, NTS, Lis Pendens, auction data';
  readonly sourceType = 'api' as const;

  private apiKey: string;

  constructor() {
    this.apiKey = env.FORECLOSURE_RADAR_API_KEY ?? '';
  }

  async *fetchRecords(options?: Record<string, unknown>): AsyncGenerator<NormalizedRecord[], void, unknown> {
    if (!this.apiKey) {
      logger.warn('ForeclosureRadar API key not configured, skipping');
      return;
    }

    logger.info({ adapter: this.name }, 'ForeclosureRadar fetch initiated');

    // Placeholder for API pagination — will be wired when live API access is available.
    // Each yield returns a batch of normalized records.
    yield [];
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    return true;
  }

  normalizeRecords(records: ForeclosureRadarRecord[]): NormalizedRecord[] {
    return records
      .map((raw) => this.normalizeRecord(raw))
      .filter((r): r is NormalizedRecord => r !== null);
  }

  private normalizeRecord(raw: ForeclosureRadarRecord): NormalizedRecord | null {
    if (!raw.apn && !raw.property_address) {
      logger.debug({ raw }, 'ForeclosureRadar record missing identity fields, skipping');
      return null;
    }

    const docType = (raw.document_type ?? '').toLowerCase();
    const eventMapping = EVENT_TYPE_MAP[docType];

    const events: NormalizedRecord['events'] = [];
    if (eventMapping) {
      events.push({
        eventType: eventMapping.type as any,
        eventLayer: eventMapping.layer,
        filingDate: raw.filing_date ? new Date(raw.filing_date) : null,
        recordedDate: raw.recording_date ? new Date(raw.recording_date) : null,
        triggerEventDate: raw.filing_date ? new Date(raw.filing_date) : (raw.recording_date ? new Date(raw.recording_date) : null),
        sourceName: this.name,
        reliabilityScore: eventMapping.reliability,
        rawEventPayload: raw,
      });
    }

    // Parse borrower name (typically "LAST, FIRST" format)
    const nameParts = raw.borrower_name?.split(/[,]/) ?? [];
    const ownerLast = nameParts[0]?.trim() ?? null;
    const ownerFirst = nameParts[1]?.trim() ?? null;

    return {
      property: {
        apn: raw.apn ?? null,
        county: raw.county ?? null,
        state: raw.state ?? null,
        streetAddress: raw.property_address ?? null,
        city: raw.property_city ?? null,
        zip: raw.property_zip ?? null,
        ownerName: raw.borrower_name ?? null,
        ownerFirst,
        ownerLast,
      },
      events,
    };
  }
}
