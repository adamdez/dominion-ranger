import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import type { IngestionAdapter, NormalizedRecord } from './interface.js';
import type { DistressEvent } from '../../db/schema/index.js';
import { logger } from '../../config/logger.js';

type EventType = DistressEvent['eventType'];

/**
 * CSV Ingestion Adapter
 *
 * Ingests property and distress data from CSV files.
 * Works with exports from:
 * - PropertyRadar
 * - County recorder exports
 * - BatchLeads
 * - Any system that exports property data as CSV
 *
 * Drop CSV files into the configured import directory.
 * The adapter auto-detects column mappings from headers.
 *
 * Usage:
 *   POST /api/ingestion/run
 *   { "adapter": "csv", "options": { "file": "spokane_distress_2026.csv" } }
 */

const DEFAULT_IMPORT_DIR = './data/imports';

// Column name aliases — maps various CSV header names to our canonical fields
const COLUMN_MAP: Record<string, string[]> = {
  apn:            ['apn', 'parcel_number', 'parcelnumb', 'parcel_id', 'parcel #', 'parcel number', 'assessor parcel number', 'tax id'],
  radarId:        ['radar id', 'radarid', 'radar_id'],
  county:         ['county', 'county_name', 'county name'],
  state:          ['state', 'state_code', 'st', 'state name'],
  streetAddress:  ['address', 'street_address', 'property_address', 'property address', 'site_address', 'site address', 'situs address', 'situs'],
  city:           ['city', 'property_city', 'property city', 'site_city', 'site city', 'situs city'],
  zip:            ['zip', 'zip_code', 'zipcode', 'postal_code', 'property_zip', 'property zip', 'site_zip', 'situs zip'],
  ownerName:      ['owner', 'owner_name', 'owner name', 'property owner', 'owner1', 'owner 1'],
  ownerFirst:     ['owner_first', 'owner first', 'first_name', 'first name', 'owner first name', 'primary first', 'primary_first'],
  ownerLast:      ['owner_last', 'owner last', 'last_name', 'last name', 'owner last name', 'primary last', 'primary_last'],
  phone:          ['phone', 'phone_number', 'phone number', 'primary_phone', 'phone1', 'primary phone1', 'primary phone'],
  email:          ['email', 'email_address', 'owner_email', 'primary_email', 'primary email1', 'primary email'],
  mailingAddress: ['mailing_address', 'mailing address', 'mail_address', 'mail address', 'owner_address', 'mail address'],
  mailingCity:    ['mailing_city', 'mailing city', 'mail_city', 'mail city'],
  mailingState:   ['mailing_state', 'mailing state', 'mail_state', 'mail state'],
  mailingZip:     ['mailing_zip', 'mailing zip', 'mail_zip', 'mail zip'],
  equityEstimate: ['equity', 'equity_estimate', 'equity estimate', 'estimated_equity', 'est_equity', 'equity_percent', 'est equity $', 'est equity', 'est. equity $'],
  propertyValue:  ['value', 'property_value', 'property value', 'assessed_value', 'market_value', 'avm', 'estimated_value', 'est value', 'est. value'],
  absenteeOwner:  ['absentee', 'absentee_owner', 'absentee owner', 'is_absentee', 'owner_occupied', 'owner occ?', 'owner occ'],
  sqft:           ['sq ft', 'sqft', 'square_feet', 'square feet', 'living_area'],
  beds:           ['beds', 'bedrooms', 'bed'],
  baths:          ['baths', 'bathrooms', 'bath'],
  propertyType:   ['type', 'property_type', 'property type', 'use_code'],

  // Distress fields
  distressType:   ['distress_type', 'distress type', 'event_type', 'event type', 'status', 'record_type', 'record type', 'category', 'list_type', 'list type', 'criteria'],
  filingDate:     ['filing_date', 'filing date', 'file_date', 'recorded_date', 'recorded date', 'record_date', 'date_filed', 'date filed', 'date'],
  recordingDate:  ['recording_date', 'recording date', 'doc_date'],
  loanAmount:     ['loan_amount', 'loan amount', 'mortgage_amount', 'mortgage amount', 'loan_balance'],
  lienAmount:     ['lien_amount', 'lien amount', 'amount_due', 'amount due', 'delinquent_amount', 'delinquent tax amount'],

  // PropertyRadar specific
  prForeclosure:  ['foreclosure?', 'foreclosure', 'in foreclosure'],
  prTaxDelinquent:['tax delinquent?', 'tax delinquent'],
  prListed:       ['listed for sale?', 'listed for sale', 'listed'],
  prStatus:       ['pr_status', 'foreclosure_status', 'foreclosure status', 'auction_status'],
  prListName:     ['list_name', 'list name', 'list'],
};

// Maps distress type strings from CSV to Ranger event types
const DISTRESS_TYPE_MAP: Record<string, { eventType: string; eventLayer: 'confirmed' | 'predictive'; reliability: number }> = {
  // Confirmed distress signals
  'notice of default':        { eventType: 'NOTICE_OF_DEFAULT', eventLayer: 'confirmed', reliability: 0.95 },
  'nod':                      { eventType: 'NOTICE_OF_DEFAULT', eventLayer: 'confirmed', reliability: 0.95 },
  'pre-foreclosure':          { eventType: 'NOTICE_OF_DEFAULT', eventLayer: 'confirmed', reliability: 0.90 },
  'preforeclosure':           { eventType: 'NOTICE_OF_DEFAULT', eventLayer: 'confirmed', reliability: 0.90 },
  'notice of trustee sale':   { eventType: 'NOTICE_OF_TRUSTEE_SALE', eventLayer: 'confirmed', reliability: 0.95 },
  'nts':                      { eventType: 'NOTICE_OF_TRUSTEE_SALE', eventLayer: 'confirmed', reliability: 0.95 },
  'auction':                  { eventType: 'NOTICE_OF_TRUSTEE_SALE', eventLayer: 'confirmed', reliability: 0.90 },
  'lis pendens':              { eventType: 'LIS_PENDENS', eventLayer: 'confirmed', reliability: 0.90 },
  'tax delinquent':           { eventType: 'TAX_DELINQUENCY', eventLayer: 'confirmed', reliability: 0.85 },
  'tax delinquency':          { eventType: 'TAX_DELINQUENCY', eventLayer: 'confirmed', reliability: 0.85 },
  'tax lien':                 { eventType: 'TAX_LIEN', eventLayer: 'confirmed', reliability: 0.85 },
  'bankruptcy':               { eventType: 'BANKRUPTCY', eventLayer: 'confirmed', reliability: 0.90 },
  'probate':                  { eventType: 'PROBATE', eventLayer: 'confirmed', reliability: 0.85 },
  'hoa lien':                 { eventType: 'HOA_LIEN', eventLayer: 'confirmed', reliability: 0.80 },
  'mechanic lien':            { eventType: 'MECHANIC_LIEN', eventLayer: 'confirmed', reliability: 0.75 },
  'judgment lien':            { eventType: 'JUDGMENT_LIEN', eventLayer: 'confirmed', reliability: 0.80 },
  'code violation':           { eventType: 'CODE_ENFORCEMENT', eventLayer: 'confirmed', reliability: 0.75 },
  'code enforcement':         { eventType: 'CODE_ENFORCEMENT', eventLayer: 'confirmed', reliability: 0.75 },

  // Predictive signals
  'absentee':                 { eventType: 'PREDICTIVE_ABSENTEE_DISTRESS', eventLayer: 'predictive', reliability: 0.30 },
  'absentee owner':           { eventType: 'PREDICTIVE_ABSENTEE_DISTRESS', eventLayer: 'predictive', reliability: 0.30 },
  'vacant':                   { eventType: 'PREDICTIVE_VACANCY_SIGNAL', eventLayer: 'predictive', reliability: 0.40 },
  'vacancy':                  { eventType: 'PREDICTIVE_VACANCY_SIGNAL', eventLayer: 'predictive', reliability: 0.40 },
  'divorce':                  { eventType: 'PREDICTIVE_DIVORCE_FILING', eventLayer: 'predictive', reliability: 0.40 },
  'high equity':              { eventType: 'PREDICTIVE_OWNERSHIP_FATIGUE', eventLayer: 'predictive', reliability: 0.20 },
  'tired landlord':           { eventType: 'PREDICTIVE_OWNERSHIP_FATIGUE', eventLayer: 'predictive', reliability: 0.30 },
  'expired listing':          { eventType: 'PREDICTIVE_LISTING_WITHDRAWAL', eventLayer: 'predictive', reliability: 0.35 },
  'withdrawn listing':        { eventType: 'PREDICTIVE_LISTING_WITHDRAWAL', eventLayer: 'predictive', reliability: 0.35 },
};

/**
 * Optional reliability score overrides per distress type.
 * Pass via constructor to override hardcoded defaults.
 * Phase 2: load from system_settings for per-source calibration.
 */
export type ReliabilityOverrides = Record<string, number>;

export class CsvAdapter implements IngestionAdapter {
  readonly name = 'csv';
  readonly description = 'CSV file import — PropertyRadar exports, county recorder files, manual lists';
  readonly sourceType = 'file' as const;

  private importDir: string;
  private reliabilityOverrides: ReliabilityOverrides;

  constructor(options?: { importDir?: string; reliabilityOverrides?: ReliabilityOverrides }) {
    this.importDir = options?.importDir ?? DEFAULT_IMPORT_DIR;
    this.reliabilityOverrides = options?.reliabilityOverrides ?? {};
  }

  async *fetchRecords(options?: Record<string, unknown>): AsyncGenerator<NormalizedRecord[], void, unknown> {
    const specificFile = options?.file as string | undefined;
    const batchSize = (options?.batchSize as number) ?? 500;

    let files: string[];

    if (specificFile) {
      // Single file specified
      const filePath = specificFile.includes('/') || specificFile.includes('\\')
        ? specificFile
        : join(this.importDir, specificFile);
      files = [filePath];
    } else {
      // Process all CSVs in import directory
      try {
        const dirContents = await readdir(this.importDir);
        files = dirContents
          .filter((f) => f.toLowerCase().endsWith('.csv'))
          .map((f) => join(this.importDir, f));
      } catch {
        logger.warn({ dir: this.importDir }, 'Import directory not found');
        return;
      }
    }

    for (const filePath of files) {
      logger.info({ file: filePath }, 'CSV ingestion started');

      try {
        const fileInfo = await stat(filePath);
        if (!fileInfo.isFile()) continue;
      } catch {
        logger.error({ file: filePath }, 'CSV file not found');
        continue;
      }

      let headers: string[] = [];
      let columnMapping: Record<string, number> = {};
      let batch: NormalizedRecord[] = [];
      let lineNum = 0;
      let totalProcessed = 0;

      const rl = createInterface({
        input: createReadStream(filePath, 'utf-8'),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        lineNum++;

        if (lineNum === 1) {
          // Parse headers
          headers = parseCsvLine(line).map((h) => h.toLowerCase().trim());
          columnMapping = buildColumnMapping(headers);
          logger.info({ file: filePath, headers: headers.length, mappedFields: Object.keys(columnMapping).length }, 'CSV headers parsed');
          continue;
        }

        const values = parseCsvLine(line);
        if (values.length === 0 || values.every((v) => !v.trim())) continue;

        const record = normalizeRow(values, columnMapping, filePath, this.reliabilityOverrides);
        if (record) {
          batch.push(record);
          totalProcessed++;
        }

        if (batch.length >= batchSize) {
          yield batch;
          batch = [];
        }
      }

      // Yield remaining
      if (batch.length > 0) {
        yield batch;
      }

      logger.info({ file: filePath, totalProcessed }, 'CSV ingestion complete');
    }
  }

  async healthCheck(): Promise<boolean> {
    return true; // CSV adapter is always available
  }
}

// ─── CSV Parsing ───────────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current.trim());
  return result;
}

function buildColumnMapping(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};

  for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
    for (let i = 0; i < headers.length; i++) {
      if (aliases.includes(headers[i])) {
        mapping[field] = i;
        break;
      }
    }
  }

  return mapping;
}

function getField(values: string[], mapping: Record<string, number>, field: string): string | null {
  const idx = mapping[field];
  if (idx === undefined || idx >= values.length) return null;
  const val = values[idx]?.trim();
  return val || null;
}

// ─── Row Normalization ─────────────────────────────

function normalizeRow(
  values: string[],
  mapping: Record<string, number>,
  sourcefile: string,
  reliabilityOverrides: ReliabilityOverrides = {},
): NormalizedRecord | null {
  const apn = getField(values, mapping, 'apn');
  const address = getField(values, mapping, 'streetAddress');

  // Must have at least APN or address
  if (!apn && !address) return null;

  // Parse owner name if first/last not separate
  let ownerFirst = getField(values, mapping, 'ownerFirst');
  let ownerLast = getField(values, mapping, 'ownerLast');
  const ownerName = getField(values, mapping, 'ownerName');

  if (!ownerFirst && !ownerLast && ownerName) {
    const parsed = parseOwnerName(ownerName);
    ownerFirst = parsed.firstName;
    ownerLast = parsed.lastName;
  }

  // Build full mailing address
  const mailAddr = getField(values, mapping, 'mailingAddress');
  const mailCity = getField(values, mapping, 'mailingCity');
  const mailState = getField(values, mapping, 'mailingState');
  const mailZip = getField(values, mapping, 'mailingZip');
  const fullMailingAddress = mailAddr
    ? [mailAddr, mailCity, mailState, mailZip].filter(Boolean).join(', ')
    : null;

  // Detect absentee — PropertyRadar uses "Owner Occ?" where "Yes" = owner occupied (NOT absentee)
  const absenteeRaw = getField(values, mapping, 'absenteeOwner');
  let isAbsentee: boolean;
  if (absenteeRaw) {
    // "Owner Occ?" column: Yes = owner occupied, so absentee = NOT yes
    if (['yes', 'y', 'true', '1'].includes(absenteeRaw.toLowerCase().trim())) {
      isAbsentee = false; // Owner occupied
    } else if (['no', 'n', 'false', '0'].includes(absenteeRaw.toLowerCase().trim())) {
      isAbsentee = true; // Not owner occupied = absentee
    } else {
      isAbsentee = address && fullMailingAddress ? detectAbsentee(address, fullMailingAddress) : false;
    }
  } else {
    isAbsentee = address && fullMailingAddress ? detectAbsentee(address, fullMailingAddress) : false;
  }

  // Equity
  const equity = getField(values, mapping, 'equityEstimate') ?? getField(values, mapping, 'propertyValue');

  // Build events from distress type
  const events: NormalizedRecord['events'] = [];
  const distressType = getField(values, mapping, 'distressType')
    ?? getField(values, mapping, 'prStatus')
    ?? getField(values, mapping, 'prListName');

  if (distressType) {
    const mapping2 = matchDistressType(distressType, reliabilityOverrides);
    if (mapping2) {
      const filingDateStr = getField(values, mapping, 'filingDate');
      const recordingDateStr = getField(values, mapping, 'recordingDate');

      events.push({
        eventType: mapping2.eventType as EventType,
        eventLayer: mapping2.eventLayer,
        triggerEventDate: filingDateStr ? parseDate(filingDateStr) : new Date(),
        filingDate: filingDateStr ? parseDate(filingDateStr) : null,
        recordedDate: recordingDateStr ? parseDate(recordingDateStr) : null,
        sourceName: `csv_import:${sourcefile.split(/[/\\]/).pop()}`,
        reliabilityScore: mapping2.reliability,
        rawEventPayload: { distressType, source: 'csv_import' },
      });
    }
  }

  // PropertyRadar boolean columns: "Tax Delinquent?", "Foreclosure?", etc.
  const prTaxDelinquent = getField(values, mapping, 'prTaxDelinquent');
  if (prTaxDelinquent && isTruthy(prTaxDelinquent)) {
    const lienAmt = getField(values, mapping, 'lienAmount');
    events.push({
      eventType: 'TAX_DELINQUENCY' as EventType,
      eventLayer: 'confirmed',
      triggerEventDate: new Date(),
      sourceName: `csv_import:${sourcefile.split(/[/\\]/).pop()}`,
      reliabilityScore: 0.85,
      rawEventPayload: { reason: 'tax_delinquent_flag', delinquentAmount: lienAmt, source: 'propertyradar_csv' },
    });
  }

  const prForeclosure = getField(values, mapping, 'prForeclosure');
  if (prForeclosure && isTruthy(prForeclosure)) {
    events.push({
      eventType: 'NOTICE_OF_DEFAULT' as EventType,
      eventLayer: 'confirmed',
      triggerEventDate: new Date(),
      sourceName: `csv_import:${sourcefile.split(/[/\\]/).pop()}`,
      reliabilityScore: 0.90,
      rawEventPayload: { reason: 'foreclosure_flag', source: 'propertyradar_csv' },
    });
  }

  // If absentee but no other event, add predictive signal
  if (isAbsentee && events.length === 0) {
    events.push({
      eventType: 'PREDICTIVE_ABSENTEE_DISTRESS' as EventType,
      eventLayer: 'predictive',
      triggerEventDate: new Date(),
      sourceName: `csv_import:${sourcefile.split(/[/\\]/).pop()}`,
      reliabilityScore: 0.30,
      rawEventPayload: { reason: 'absentee_from_csv' },
    });
  }

  return {
    property: {
      apn,
      county: getField(values, mapping, 'county'),
      state: getField(values, mapping, 'state'),
      streetAddress: address,
      city: getField(values, mapping, 'city'),
      zip: getField(values, mapping, 'zip'),
      ownerName,
      ownerFirst,
      ownerLast,
      phone: getField(values, mapping, 'phone'),
      email: getField(values, mapping, 'email'),
      mailingAddress: fullMailingAddress,
      absenteeOwner: isAbsentee,
      equityEstimate: equity,
    },
    events,
  };
}

// ─── Helpers ───────────────────────────────────────

function parseOwnerName(raw: string): { firstName: string | null; lastName: string | null } {
  if (!raw) return { firstName: null, lastName: null };

  if (raw.includes(',')) {
    const parts = raw.split(',').map((p) => p.trim());
    return { lastName: parts[0] || null, firstName: parts[1] || null };
  }

  const parts = raw.split(/\s+/);
  if (parts.length >= 2) {
    return { firstName: parts[0] || null, lastName: parts[parts.length - 1] || null };
  }

  return { firstName: null, lastName: raw };
}

function matchDistressType(
  raw: string,
  reliabilityOverrides: ReliabilityOverrides = {},
): { eventType: string; eventLayer: 'confirmed' | 'predictive'; reliability: number } | null {
  const normalized = raw.toLowerCase().trim();

  let match: { eventType: string; eventLayer: 'confirmed' | 'predictive'; reliability: number } | null = null;

  if (DISTRESS_TYPE_MAP[normalized]) {
    match = DISTRESS_TYPE_MAP[normalized];
  } else {
    for (const [key, value] of Object.entries(DISTRESS_TYPE_MAP)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        match = value;
        break;
      }
    }
  }

  if (!match) {
    logger.debug({ distressType: raw }, 'Unknown distress type in CSV, treating as predictive');
    match = { eventType: 'PREDICTIVE_MARKET_STRESS', eventLayer: 'predictive', reliability: 0.20 };
  }

  const override = reliabilityOverrides[match.eventType];
  if (override !== undefined) {
    return { ...match, reliability: override };
  }

  return match;
}

function parseDate(str: string): Date | null {
  if (!str) return null;

  // Try common formats
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  // Try MM/DD/YYYY
  const parts = str.split('/');
  if (parts.length === 3) {
    const d2 = new Date(`${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`);
    if (!isNaN(d2.getTime())) return d2;
  }

  return null;
}

function detectAbsentee(siteAddress: string, mailingAddress: string): boolean {
  const site = siteAddress.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15);
  const mail = mailingAddress.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15);
  return site !== mail;
}

function isTruthy(val: string): boolean {
  return ['yes', 'y', 'true', '1', 'x'].includes(val.toLowerCase().trim());
}

function _isFalsy(val: string): boolean {
  return ['no', 'n', 'false', '0'].includes(val.toLowerCase().trim());
}
