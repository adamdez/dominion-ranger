import type { IngestionAdapter, NormalizedRecord } from './interface.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';

/**
 * Regrid API v2 adapter — LIVE implementation.
 *
 * Queries parcels by county FIPS code, paginates through results,
 * normalizes into Ranger canonical format.
 *
 * API: https://app.regrid.com/api/v2/parcels/query
 * Auth: Token passed as query parameter
 */

const BASE_URL = 'https://app.regrid.com/api/v2';

// Target counties for Phase 1
const TARGET_COUNTIES: Record<string, { geoid: string; name: string; state: string }> = {
  'spokane_wa':  { geoid: '53063', name: 'Spokane',  state: 'WA' },
  'kootenai_id': { geoid: '16055', name: 'Kootenai', state: 'ID' },
};

interface RegridFeature {
  type: 'Feature';
  properties: {
    fields: {
      parcelnumb?: string;
      county?: string;
      state2?: string;
      owner?: string;
      mail_addno?: string;
      mail_addstrt?: string;
      mail_addpref?: string;
      mail_city?: string;
      mail_state2?: string;
      mail_zip?: string;
      saddr?: string;
      scity?: string;
      szip?: string;
      ll_uuid?: string;
      geoid?: string;
      usps_vacancy?: string;
      owner2?: string;
      mail_address?: string;
      yearbuilt?: number;
      improvval?: number;
      landval?: number;
      parval?: number;
      ll_gisacre?: number;
      [key: string]: unknown;
    };
    context?: {
      path?: string;
      name?: string;
    };
    ll_uuid?: string;
  };
  geometry?: unknown;
}

interface RegridResponse {
  type: 'FeatureCollection';
  features: RegridFeature[];
  pagination?: {
    next_offset_id?: number;
    count?: number;
  };
}

export class RegridAdapter implements IngestionAdapter {
  readonly name = 'regrid';
  readonly description = 'Regrid — parcel data, ownership records, property characteristics';
  readonly sourceType = 'api' as const;

  private apiKey: string;

  constructor() {
    this.apiKey = env.REGRID_API_KEY ?? '';
  }

  async *fetchRecords(options?: Record<string, unknown>): AsyncGenerator<NormalizedRecord[], void, unknown> {
    if (!this.apiKey) {
      logger.warn('Regrid API key not configured, skipping');
      return;
    }

    const countyKeys = (options?.counties as string[]) ?? Object.keys(TARGET_COUNTIES);
    const batchSize = (options?.limit as number) ?? 1000;

    for (const countyKey of countyKeys) {
      const county = TARGET_COUNTIES[countyKey];
      if (!county) {
        logger.warn({ countyKey }, 'Unknown county key, skipping');
        continue;
      }

      logger.info({ county: county.name, state: county.state, geoid: county.geoid }, 'Regrid ingestion started for county');

      let offsetId: number | null = 0;
      let totalFetched = 0;
      const maxRecords = (options?.maxRecords as number) ?? 50000;

      while (offsetId !== null && totalFetched < maxRecords) {
        try {
          const url = this.buildQueryUrl(county.geoid, batchSize, offsetId);
          logger.debug({ url: url.replace(this.apiKey, '[REDACTED]') }, 'Fetching Regrid page');

          const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(30_000),
          });

          if (!response.ok) {
            const errorText = await response.text();
            logger.error({ status: response.status, body: errorText }, 'Regrid API error');

            if (response.status === 429) {
              logger.warn('Regrid rate limited, waiting 30s');
              await sleep(30_000);
              continue;
            }
            break;
          }

          const data = (await response.json()) as RegridResponse;
          const features = data.features ?? [];

          if (features.length === 0) {
            logger.info({ county: county.name, totalFetched }, 'No more parcels, county complete');
            break;
          }

          const records = features
            .map((f) => this.normalizeFeature(f, county))
            .filter((r): r is NormalizedRecord => r !== null);

          totalFetched += features.length;
          logger.info({
            county: county.name,
            batchSize: features.length,
            normalized: records.length,
            totalFetched,
          }, 'Regrid batch fetched');

          yield records;

          if (data.pagination?.next_offset_id) {
            offsetId = data.pagination.next_offset_id;
          } else if (features.length < batchSize) {
            offsetId = null;
          } else {
            logger.warn('No pagination info from Regrid, stopping');
            offsetId = null;
          }

          await sleep(500);

        } catch (err) {
          logger.error({ err, county: county.name }, 'Regrid fetch error');
          break;
        }
      }

      logger.info({ county: county.name, totalFetched }, 'Regrid county ingestion complete');
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      const url = `${BASE_URL}/parcels/query?token=${this.apiKey}&fields[geoid][eq]=53063&limit=1`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private buildQueryUrl(geoid: string, limit: number, offsetId: number): string {
    const params = new URLSearchParams({
      token: this.apiKey,
      'fields[geoid][eq]': geoid,
      limit: String(limit),
      offset_id: String(offsetId),
      return_custom: 'false',
    });

    return `${BASE_URL}/parcels/query?${params.toString()}`;
  }

  private normalizeFeature(
    feature: RegridFeature,
    county: { name: string; state: string; geoid: string },
  ): NormalizedRecord | null {
    const fields = feature.properties?.fields;
    if (!fields) return null;

    const apn = fields.parcelnumb;
    const address = fields.saddr;

    if (!apn && !address) return null;

    const mailingParts = [
      fields.mail_addno,
      fields.mail_addpref,
      fields.mail_addstrt,
      fields.mail_city,
      fields.mail_state2,
      fields.mail_zip,
    ].filter(Boolean).join(' ').trim();

    const mailingAddress = fields.mail_address ?? (mailingParts || null);

    const isAbsentee = detectAbsenteeOwner(address, mailingAddress, fields);

    const { firstName, lastName, fullName } = parseOwnerName(fields.owner);

    const events: NormalizedRecord['events'] = [];

    if (isAbsentee) {
      events.push({
        eventType: 'PREDICTIVE_ABSENTEE_DISTRESS' as any,
        eventLayer: 'predictive',
        triggerEventDate: new Date(),
        sourceName: 'regrid',
        reliabilityScore: 0.30,
        rawEventPayload: { reason: 'absentee_owner_detected', ll_uuid: fields.ll_uuid },
      });
    }

    if (fields.usps_vacancy === 'Y') {
      events.push({
        eventType: 'PREDICTIVE_VACANCY_SIGNAL' as any,
        eventLayer: 'predictive',
        triggerEventDate: new Date(),
        sourceName: 'regrid',
        reliabilityScore: 0.40,
        rawEventPayload: { reason: 'usps_vacancy_flag', ll_uuid: fields.ll_uuid },
      });
    }

    const equityEstimate = fields.parval ? String(fields.parval) : null;

    return {
      property: {
        apn: apn ?? null,
        county: county.name,
        state: county.state,
        streetAddress: address ?? null,
        city: fields.scity ?? null,
        zip: fields.szip ?? null,
        ownerName: fullName,
        ownerFirst: firstName,
        ownerLast: lastName,
        mailingAddress: mailingAddress,
        absenteeOwner: isAbsentee,
        equityEstimate: equityEstimate,
      },
      events,
    };
  }
}

function parseOwnerName(raw?: string): { firstName: string | null; lastName: string | null; fullName: string | null } {
  if (!raw) return { firstName: null, lastName: null, fullName: null };

  const cleaned = raw.trim();
  if (!cleaned) return { firstName: null, lastName: null, fullName: null };

  if (cleaned.includes(',')) {
    const parts = cleaned.split(',').map((p) => p.trim());
    return { lastName: parts[0] || null, firstName: parts[1] || null, fullName: cleaned };
  }

  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) {
    return { firstName: parts[0] || null, lastName: parts[parts.length - 1] || null, fullName: cleaned };
  }

  return { firstName: null, lastName: cleaned, fullName: cleaned };
}

function detectAbsenteeOwner(
  siteAddress?: string | null,
  mailingAddress?: string | null,
  fields?: Record<string, unknown>,
): boolean {
  if (!siteAddress || !mailingAddress) return false;

  const site = siteAddress.toLowerCase().replace(/[^a-z0-9]/g, '');
  const mail = mailingAddress.toLowerCase().replace(/[^a-z0-9]/g, '');

  const sitePrefix = site.substring(0, 15);
  const mailPrefix = mail.substring(0, 15);

  const mailState = fields?.mail_state2 as string | undefined;
  const siteState = fields?.state2 as string | undefined;
  if (mailState && siteState && mailState !== siteState) return true;

  return sitePrefix !== mailPrefix;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
