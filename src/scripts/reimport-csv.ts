/**
 * Standalone CSV Reimport Script
 *
 * Reads PropertyRadar CSV with Ranger Full Extract fields,
 * updates existing properties with severity attributes,
 * creates distress events from flag columns.
 *
 * Usage:
 *   npx tsx src/scripts/reimport-csv.ts spokane.csv
 *   npx tsx src/scripts/reimport-csv.ts kootenai.csv KOOTENAI ID
 *   npx tsx src/scripts/reimport-csv.ts kootenai.csv KOOTENAI ID --dry-run
 *
 * When county/state are passed on CLI, they are used as defaults for all rows
 * (for CSVs like Kootenai that lack those columns).
 *
 * Rows without APN get a synthetic identifier: SYNTH-{hash} so reimport is idempotent.
 *
 * This bypasses BullMQ and the API — runs directly against the DB.
 * Processes records sequentially to avoid Neon connection pool exhaustion.
 */

import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema/index.js';
import type { DistressEvent } from '../db/schema/index.js';
import { EventLayer } from '../db/schema/constants.js';
import { generateEventFingerprint } from '../lib/fingerprint.js';
import { generateId } from '../lib/ids.js';
import { recalculateSignalAccumulation } from '../modules/signals/service.js';
import { env } from '../config/env.js';

// Use a small pool to avoid Neon limits
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  min: 1,
  max: 3,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 10_000,
});

const db = drizzle(pool, { schema });
const { properties, distressEvents } = schema;

// ── Config ──────────────────────────────────────
const IMPORT_DIR = './data/imports';

export interface ReimportResult {
  created: number;
  updated: number;
  eventsCreated: number;
  dominionLeadIds: string[];
}

export async function runReimportCsv(
  filePath: string,
  options?: { county?: string; state?: string; dryRun?: boolean },
): Promise<ReimportResult> {
  const defaultCounty = options?.county?.toUpperCase();
  const defaultState = options?.state?.toUpperCase();
  return runImport(filePath, defaultCounty, defaultState, options?.dryRun ?? false);
}

const JUNK_ADDRESSES = ['', 'unknown', 'n/a', 'none', 'null'];

/** Generate deterministic synthetic APN from address for rows missing APN. */
function syntheticApn(
  streetAddress: string,
  city: string | null,
  state: string | null,
  lineNum: number,
): string {
  const addr = (streetAddress || '').trim();
  const c = (city || '').trim().toLowerCase();
  const s = (state || '').trim().toUpperCase();
  // If city is unknown/empty, include row index to prevent collisions for generic addresses
  const hashInput =
    city && c !== 'unknown' && c !== 'n/a' && c !== 'none'
      ? `${addr}-${city}-${s}`
      : `${addr}-${city}-${s}-row${lineNum}`;
  const hash = createHash('sha256').update(hashInput).digest('hex').slice(0, 12);
  return `SYNTH-${hash}`;
}

// ── CSV Parsing ─────────────────────────────────
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else { current += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === ',') { result.push(current.trim()); current = ''; }
      else { current += char; }
    }
  }
  result.push(current.trim());
  return result;
}

// Column name → index mapping (includes Kootenai / reduced-column-set aliases)
const HEADER_MAP: Record<string, string[]> = {
  type:             ['type'],
  address:          ['address', 'property address', 'street', 'street address', 'property_address'],
  city:             ['city'],
  county:           ['county'],
  state:            ['state'],
  zip:              ['zip', 'zipcode', 'zip code'],
  sqft:             ['sq ft'],
  beds:             ['beds'],
  baths:            ['baths'],
  estValue:         ['est value'],
  estEquityDollar:  ['est equity $'],
  purchaseAmt:      ['purchase amt'],
  owner:            ['owner'],
  ownerOcc:         ['owner occ?'],
  hudRent:          ['hud rent'],
  listedForSale:    ['listed for sale?'],
  foreclosure:      ['foreclosure?'],
  apn:              ['apn', 'parcel', 'parcel id', 'parcel_id', 'parcelid'],
  mailAddress:      ['mail address'],
  mailCity:         ['mail city'],
  mailState:        ['mail state'],
  mailZip:          ['mail zip'],
  mailVacant:       ['mail vacant?'],
  annualTaxes:      ['taxes / yr'],
  estTaxRate:       ['est tax %'],
  taxDelinquentAmt: ['tax delinquent $'],
  estEquityPct:     ['est equity %'],
  estOpenLoans:     ['est open loans $'],
  cltv:             ['cltv %'],
  purchaseDate:     ['purchase date'],
  yearBuilt:        ['yr built'],
  lotSqft:          ['lot sqft'],
  purchaseSeller:   ['purchase seller'],
  bankruptcy:       ['bankruptcy?'],
  divorce:          ['divorce?'],
  deceasedOwner:    ['deceased owner?'],
  siteVacant:       ['site vacant?'],
  openLoansCount:   ['est open loans #'],
  firstPurpose:     ['1st purpose'],
  firstLoanType:    ['1st loan type'],
  firstRecDate:     ['1st rec date'],
  firstConcurrent:  ['1st concurrent?'],
  firstAmount:      ['1st amount'],
  firstCashOut:     ['1st cash out'],
  secondRateType:   ['2nd rate type'],
  secondAmount:     ['2nd amount'],
  secondLoanType:   ['2nd loan type'],
  secondRecDate:    ['2nd rec date'],
  secondPurpose:    ['2nd purpose'],
  propertyType:     ['type'],
};

function buildMapping(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());
  for (const [field, aliases] of Object.entries(HEADER_MAP)) {
    for (let i = 0; i < lowerHeaders.length; i++) {
      if (aliases.includes(lowerHeaders[i])) {
        mapping[field] = i;
        break;
      }
    }
  }
  return mapping;
}

function get(values: string[], mapping: Record<string, number>, field: string): string | null {
  const idx = mapping[field];
  if (idx === undefined || idx >= values.length) return null;
  const val = values[idx]?.trim();
  return val || null;
}

function num(val: string | null): number | null {
  if (!val) return null;
  const n = parseFloat(val.replace(/[$,%]/g, ''));
  return isNaN(n) ? null : n;
}

function isTruthy(val: string | null): boolean {
  if (!val) return false;
  return ['yes', 'y', 'true', '1', 'x'].includes(val.toLowerCase().trim());
}

function parseOwnerName(raw: string): { first: string | null; last: string | null } {
  if (!raw) return { first: null, last: null };
  if (raw.includes(',')) {
    const parts = raw.split(',').map(p => p.trim());
    return { last: parts[0] || null, first: parts[1] || null };
  }
  const parts = raw.split(/\s+/);
  if (parts.length >= 2) return { first: parts[0], last: parts[parts.length - 1] };
  return { first: null, last: raw };
}

// ── Main Processing ─────────────────────────────
async function runImport(
  filePath: string,
  defaultCounty?: string,
  defaultState?: string,
  dryRun = false,
): Promise<ReimportResult> {
  console.log(`\n🏗️  Dominion Ranger CSV Reimport`);
  console.log(`   File: ${filePath}`);
  console.log(`   County: ${defaultCounty || 'from CSV'}`);
  console.log(`   State: ${defaultState || 'from CSV'}`);
  if (dryRun) console.log(`   Mode: DRY-RUN (no inserts)\n`);
  else console.log('');

  const rl = createInterface({
    input: createReadStream(filePath, 'utf-8'),
    crlfDelay: Infinity,
  });

  let headers: string[] = [];
  let mapping: Record<string, number> = {};
  let lineNum = 0;
  let updated = 0;
  let created = 0;
  let eventsCreated = 0;
  let errors = 0;
  let skipped = 0;
  let dryRunCount = 0;
  const dominionLeadIds: string[] = [];
  const dryRunPreview: Array<Record<string, unknown>> = [];

  const startTime = Date.now();

  for await (const line of rl) {
    lineNum++;

    if (lineNum === 1) {
      headers = parseCsvLine(line);
      mapping = buildMapping(headers);
      console.log(`📋 Headers: ${headers.length} columns, ${Object.keys(mapping).length} mapped`);
      console.log(`   Mapped: ${Object.keys(mapping).join(', ')}\n`);
      continue;
    }

    const values = parseCsvLine(line);
    if (values.length === 0 || values.every(v => !v.trim())) continue;

    const address = get(values, mapping, 'address');
    const city = get(values, mapping, 'city');
    const county = get(values, mapping, 'county')?.toUpperCase() || defaultCounty || null;
    const state = get(values, mapping, 'state')?.toUpperCase() || defaultState || null;
    const zip = get(values, mapping, 'zip') || null; // missing zip → null, don't crash

    // Skip rows with no valid address — can't identify or contact
    const addrLower = (address || '').toLowerCase().trim();
    if (!address || JUNK_ADDRESSES.includes(addrLower)) {
      console.warn(`⚠️  Row ${lineNum}: Skipping — no valid address (got: "${address ?? ''}")`);
      skipped++;
      continue;
    }

    let apn = get(values, mapping, 'apn');
    if (!apn && address) {
      // Synthetic APN: require county for unique constraint (apn + county)
      if (!county) {
        console.warn(`  Row ${lineNum}: No APN and no county (need CLI county for synthetic ID). Skipping.`);
        skipped++;
        continue;
      }
      apn = syntheticApn(address, city, state, lineNum);
      if (!dryRun) console.warn(`  Row ${lineNum}: No APN found, using synthetic ID: ${apn}`);
    }
    if (!apn && !address) { skipped++; continue; }
    const ownerRaw = get(values, mapping, 'owner') || '';
    const { first: ownerFirst, last: ownerLast } = parseOwnerName(ownerRaw);

    // Dry-run: collect preview and skip DB
    if (dryRun) {
      if (dryRunPreview.length < 5) {
        dryRunPreview.push({
          apn,
          address,
          city,
          county,
          state,
          zip: zip ?? '(empty)',
          owner: ownerRaw || '(empty)',
        });
      }
      dryRunCount++;
      continue;
    }

    // Build mailing address
    const mailParts = [
      get(values, mapping, 'mailAddress'),
      get(values, mapping, 'mailCity'),
      get(values, mapping, 'mailState'),
      get(values, mapping, 'mailZip'),
    ].filter(Boolean);
    const mailingAddress = mailParts.length > 0 ? mailParts.join(', ') : null;

    // Absentee detection
    const ownerOcc = get(values, mapping, 'ownerOcc');
    const isAbsentee = ownerOcc !== null ? !isTruthy(ownerOcc) : false;

    // Purchase date → ownership months
    const purchaseDateStr = get(values, mapping, 'purchaseDate');
    let ownershipMonths: number | null = null;
    if (purchaseDateStr) {
      const pd = new Date(purchaseDateStr);
      if (!isNaN(pd.getTime())) {
        ownershipMonths = Math.floor((Date.now() - pd.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
      }
    }

    // ── Parse numeric/boolean fields used by property upsert and events ──
    const taxAmt = num(get(values, mapping, 'taxDelinquentAmt'));
    const estEquityDollar = num(get(values, mapping, 'estEquityDollar'));
    const purchaseAmt = num(get(values, mapping, 'purchaseAmt'));
    const taxPerYear = num(get(values, mapping, 'annualTaxes'));
    const estTaxPct = num(get(values, mapping, 'estTaxRate'));
    const estEquityPct = num(get(values, mapping, 'estEquityPct'));
    const estOpenLoansVal = num(get(values, mapping, 'estOpenLoans'));
    const cltvVal = num(get(values, mapping, 'cltv'));
    const openLoansCountVal = num(get(values, mapping, 'openLoansCount'));
    const firstAmountVal = num(get(values, mapping, 'firstAmount'));
    const hudRentVal = num(get(values, mapping, 'hudRent'));
    const yearBuiltVal = num(get(values, mapping, 'yearBuilt'));
    const lotSqftVal = num(get(values, mapping, 'lotSqft'));

    const mailVacantVal = isTruthy(get(values, mapping, 'mailVacant'));
    const firstRecDateStr = get(values, mapping, 'firstRecDate');

    const isBankrupt = isTruthy(get(values, mapping, 'bankruptcy'));
    const isDivorce = isTruthy(get(values, mapping, 'divorce'));
    const isDeceased = isTruthy(get(values, mapping, 'deceasedOwner'));
    const isVacant = isTruthy(get(values, mapping, 'siteVacant'));
    const isForeclosure = isTruthy(get(values, mapping, 'foreclosure'));

    // Resolve historical date from purchase date or import timestamp
    const purchaseDate = purchaseDateStr ? new Date(purchaseDateStr) : null;
    const historicalDate = (purchaseDate && !isNaN(purchaseDate.getTime())) ? purchaseDate : null;

    try {
      // ── Atomic upsert property (Charter: ON CONFLICT DO UPDATE, no SELECT-then-INSERT) ──
      const candidateId = generateId();
      const candidatePropertyId = generateId();

      const purchaseDateParsed = purchaseDateStr ? new Date(purchaseDateStr) : null;
      const purchaseDateValid = purchaseDateParsed && !isNaN(purchaseDateParsed.getTime()) ? purchaseDateParsed : null;
      const firstLoanDateParsed = firstRecDateStr ? new Date(firstRecDateStr) : null;
      const firstLoanDateValid = firstLoanDateParsed && !isNaN(firstLoanDateParsed.getTime()) ? firstLoanDateParsed : null;

      const insertValues: typeof properties.$inferInsert = {
          dominionLeadId: candidateId,
          propertyId: candidatePropertyId,
          apn: apn || null,
          county,
          state,
          streetAddress: address,
          city,
          zip: zip || null,
          ownerName: ownerRaw || null,
          ownerFirst,
          ownerLast,
          mailingAddress,
          mailAddress: get(values, mapping, 'mailAddress') || null,
          mailCity: get(values, mapping, 'mailCity') || null,
          mailState: get(values, mapping, 'mailState') || null,
          mailZip: get(values, mapping, 'mailZip') || null,
          mailVacant: mailVacantVal,
          absenteeOwner: isAbsentee,
          equityEstimate: estEquityDollar?.toString() || null,
          ownershipDurationMonths: ownershipMonths,
          mortgageStatus: 'UNKNOWN',
          purchaseDate: purchaseDateValid ? purchaseDateValid.toISOString().slice(0, 10) : null,
          purchaseAmountCents: purchaseAmt != null ? Math.round(purchaseAmt * 100) : null,
          purchaseSeller: get(values, mapping, 'purchaseSeller') || null,
          taxPerYearCents: taxPerYear != null ? Math.round(taxPerYear * 100) : null,
          estTaxPercent: estTaxPct?.toString() ?? null,
          taxDelinquentCents: taxAmt != null && taxAmt > 0 ? Math.round(taxAmt * 100) : null,
          estEquityPercent: estEquityPct?.toString() ?? null,
          estOpenLoansCents: estOpenLoansVal != null ? Math.round(estOpenLoansVal * 100) : null,
          cltvPercent: cltvVal?.toString() ?? null,
          estOpenLoansCount: openLoansCountVal != null ? Math.round(openLoansCountVal) : null,
          firstLoanPurpose: get(values, mapping, 'firstPurpose') || null,
          firstLoanType: get(values, mapping, 'firstLoanType') || null,
          firstLoanDate: firstLoanDateValid ? firstLoanDateValid.toISOString().slice(0, 10) : null,
          firstLoanAmountCents: firstAmountVal != null ? Math.round(firstAmountVal * 100) : null,
          hudRent: hudRentVal != null ? Math.round(hudRentVal) : null,
          yearBuilt: yearBuiltVal != null ? Math.round(yearBuiltVal) : null,
          lotSqft: lotSqftVal != null ? Math.round(lotSqftVal) : null,
          propertyType: get(values, mapping, 'propertyType') || null,
      };
      const [result] = await db
        .insert(properties)
        .values(insertValues)
        .onConflictDoUpdate({
          target: [properties.apn, properties.county],
          set: {
            ownerName: sql`COALESCE(excluded.owner_name, ${properties.ownerName})`,
            ownerFirst: sql`COALESCE(excluded.owner_first, ${properties.ownerFirst})`,
            ownerLast: sql`COALESCE(excluded.owner_last, ${properties.ownerLast})`,
            mailingAddress: sql`COALESCE(excluded.mailing_address, ${properties.mailingAddress})`,
            mailAddress: sql`COALESCE(excluded.mail_address, ${properties.mailAddress})`,
            mailCity: sql`COALESCE(excluded.mail_city, ${properties.mailCity})`,
            mailState: sql`COALESCE(excluded.mail_state, ${properties.mailState})`,
            mailZip: sql`COALESCE(excluded.mail_zip, ${properties.mailZip})`,
            mailVacant: sql`COALESCE(excluded.mail_vacant, ${properties.mailVacant})`,
            absenteeOwner: sql`COALESCE(excluded.absentee_owner, ${properties.absenteeOwner})`,
            equityEstimate: sql`COALESCE(excluded.equity_estimate, ${properties.equityEstimate})`,
            ownershipDurationMonths: sql`COALESCE(excluded.ownership_duration_months, ${properties.ownershipDurationMonths})`,
            purchaseDate: sql`COALESCE(excluded.purchase_date, ${properties.purchaseDate})`,
            purchaseAmountCents: sql`COALESCE(excluded.purchase_amount_cents, ${properties.purchaseAmountCents})`,
            purchaseSeller: sql`COALESCE(excluded.purchase_seller, ${properties.purchaseSeller})`,
            taxPerYearCents: sql`COALESCE(excluded.tax_per_year_cents, ${properties.taxPerYearCents})`,
            estTaxPercent: sql`COALESCE(excluded.est_tax_percent, ${properties.estTaxPercent})`,
            taxDelinquentCents: sql`COALESCE(excluded.tax_delinquent_cents, ${properties.taxDelinquentCents})`,
            estEquityPercent: sql`COALESCE(excluded.est_equity_percent, ${properties.estEquityPercent})`,
            estOpenLoansCents: sql`COALESCE(excluded.est_open_loans_cents, ${properties.estOpenLoansCents})`,
            cltvPercent: sql`COALESCE(excluded.cltv_percent, ${properties.cltvPercent})`,
            estOpenLoansCount: sql`COALESCE(excluded.est_open_loans_count, ${properties.estOpenLoansCount})`,
            firstLoanPurpose: sql`COALESCE(excluded.first_loan_purpose, ${properties.firstLoanPurpose})`,
            firstLoanType: sql`COALESCE(excluded.first_loan_type, ${properties.firstLoanType})`,
            firstLoanDate: sql`COALESCE(excluded.first_loan_date, ${properties.firstLoanDate})`,
            firstLoanAmountCents: sql`COALESCE(excluded.first_loan_amount_cents, ${properties.firstLoanAmountCents})`,
            hudRent: sql`COALESCE(excluded.hud_rent, ${properties.hudRent})`,
            yearBuilt: sql`COALESCE(excluded.year_built, ${properties.yearBuilt})`,
            lotSqft: sql`COALESCE(excluded.lot_sqft, ${properties.lotSqft})`,
            propertyType: sql`COALESCE(excluded.property_type, ${properties.propertyType})`,
            updatedAt: new Date(),
          },
        })
        .returning();

      const dominionLeadId = result.dominionLeadId;
      dominionLeadIds.push(dominionLeadId);
      const isNew = dominionLeadId === candidateId;

      if (isNew) created++;
      else updated++;

      // ── Create distress events (only for actual distress flags) ──
      type EventType = DistressEvent['eventType'];
      type EventLayerType = DistressEvent['eventLayer'];
      interface EventDraft {
        eventId: string;
        dominionLeadId: string;
        eventType: EventType;
        eventLayer: EventLayerType;
        triggerEventDate: Date;
        sourceName: string;
        reliabilityScore: string;
        rawEventPayload: Record<string, unknown>;
        freshnessCategory: 'same_day' | '1_3_days' | '4_7_days' | 'stale';
      }
      const source = `csv_reimport:${filePath.split(/[/\\]/).pop() ?? 'unknown'}`;
      const newEvents: EventDraft[] = [];

      // Use historical date for trigger; classify freshness based on age
      function resolveDate(): { date: Date; freshness: EventDraft['freshnessCategory'] } {
        if (historicalDate) {
          const daysAgo = Math.floor((Date.now() - historicalDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysAgo <= 0) return { date: historicalDate, freshness: 'same_day' };
          if (daysAgo <= 3) return { date: historicalDate, freshness: '1_3_days' };
          if (daysAgo <= 7) return { date: historicalDate, freshness: '4_7_days' };
          return { date: historicalDate, freshness: 'stale' };
        }
        return { date: new Date(), freshness: 'same_day' };
      }

      // Only create TAX_DELINQUENCY if actually tax delinquent
      if (taxAmt && taxAmt > 0) {
        const { date, freshness } = resolveDate();
        newEvents.push({
          eventId: generateId(),
          dominionLeadId,
          eventType: 'TAX_DELINQUENCY' as EventType,
          eventLayer: EventLayer.CONFIRMED as EventLayerType,
          triggerEventDate: date,
          sourceName: source,
          reliabilityScore: '0.85',
          rawEventPayload: { reason: 'tax_delinquent_amount', taxDelinquentAmount: taxAmt, source: 'propertyradar' },
          freshnessCategory: freshness,
        });
      }

      if (isForeclosure) {
        const { date, freshness } = resolveDate();
        newEvents.push({
          eventId: generateId(),
          dominionLeadId,
          eventType: 'NOTICE_OF_DEFAULT' as EventType,
          eventLayer: EventLayer.CONFIRMED as EventLayerType,
          triggerEventDate: date,
          sourceName: source,
          reliabilityScore: '0.90',
          rawEventPayload: { reason: 'foreclosure_flag', source: 'propertyradar' },
          freshnessCategory: freshness,
        });
      }

      if (isBankrupt) {
        const { date, freshness } = resolveDate();
        newEvents.push({
          eventId: generateId(),
          dominionLeadId,
          eventType: 'BANKRUPTCY' as EventType,
          eventLayer: EventLayer.CONFIRMED as EventLayerType,
          triggerEventDate: date,
          sourceName: source,
          reliabilityScore: '0.90',
          rawEventPayload: { reason: 'bankruptcy_flag', source: 'propertyradar' },
          freshnessCategory: freshness,
        });
      }

      if (isDivorce) {
        const { date, freshness } = resolveDate();
        newEvents.push({
          eventId: generateId(),
          dominionLeadId,
          eventType: 'PREDICTIVE_DIVORCE_FILING' as EventType,
          eventLayer: EventLayer.PREDICTIVE as EventLayerType,
          triggerEventDate: date,
          sourceName: source,
          reliabilityScore: '0.60',
          rawEventPayload: { reason: 'divorce_flag', source: 'propertyradar' },
          freshnessCategory: freshness,
        });
      }

      if (isDeceased) {
        const { date, freshness } = resolveDate();
        newEvents.push({
          eventId: generateId(),
          dominionLeadId,
          eventType: 'PROBATE' as EventType,
          eventLayer: EventLayer.CONFIRMED as EventLayerType,
          triggerEventDate: date,
          sourceName: source,
          reliabilityScore: '0.80',
          rawEventPayload: { reason: 'deceased_owner_flag', source: 'propertyradar' },
          freshnessCategory: freshness,
        });
      }

      if (isVacant) {
        const { date, freshness } = resolveDate();
        newEvents.push({
          eventId: generateId(),
          dominionLeadId,
          eventType: 'PREDICTIVE_VACANCY_SIGNAL' as EventType,
          eventLayer: EventLayer.PREDICTIVE as EventLayerType,
          triggerEventDate: date,
          sourceName: source,
          reliabilityScore: '0.50',
          rawEventPayload: { reason: 'site_vacant_flag', source: 'propertyradar' },
          freshnessCategory: freshness,
        });
      }

      if (isAbsentee) {
        const { date, freshness } = resolveDate();
        newEvents.push({
          eventId: generateId(),
          dominionLeadId,
          eventType: 'PREDICTIVE_ABSENTEE_DISTRESS' as EventType,
          eventLayer: EventLayer.PREDICTIVE as EventLayerType,
          triggerEventDate: date,
          sourceName: source,
          reliabilityScore: '0.30',
          rawEventPayload: { reason: 'absentee_from_csv', source: 'propertyradar' },
          freshnessCategory: freshness,
        });
      }

      for (const evt of newEvents) {
        const fingerprint = generateEventFingerprint({
          dominionLeadId: evt.dominionLeadId,
          eventType: evt.eventType,
          eventLayer: evt.eventLayer,
          sourceName: evt.sourceName,
          triggerEventDate: evt.triggerEventDate,
        });
        await db.insert(distressEvents).values({ ...evt, fingerprint })
          .onConflictDoNothing({ target: [distressEvents.fingerprint] });
        eventsCreated++;
      }

      // Recalculate signal accumulation for scoring readiness
      if (newEvents.length > 0) {
        try {
          await recalculateSignalAccumulation(dominionLeadId);
        } catch (err: unknown) {
          if (errors <= 5) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`  Signal accumulation error for ${dominionLeadId}: ${msg}`);
          }
        }
      }

      // Progress logging
      const processed = updated + created;
      if (processed % 500 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = (processed / parseFloat(elapsed)).toFixed(0);
        console.log(`  ${processed} processed (${updated} updated, ${created} new) | ${eventsCreated} events | ${rate}/sec`);
      }

    } catch (err: unknown) {
      errors++;
      if (errors <= 5) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  Error on line ${lineNum} (APN: ${apn}): ${message}`);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (dryRun) {
    console.log(`\n📋 Dry-run complete in ${elapsed}s`);
    console.log(`   Total rows that would be imported: ${dryRunCount}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`\n   First 5 rows (as mapped):`);
    dryRunPreview.forEach((row, i) => {
      console.log(`   ${i + 1}. APN: ${row.apn} | ${row.address} | ${row.city}, ${row.state} ${row.zip} | ${row.owner}`);
    });
    console.log('\n   Run without --dry-run to import.\n');
    return { created: 0, updated: 0, eventsCreated: 0, dominionLeadIds: [] };
  }

  console.log(`\n✅ Import complete in ${elapsed}s`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Created: ${created}`);
  console.log(`   Events:  ${eventsCreated}`);
  console.log(`   Errors:  ${errors}`);
  console.log(`   Skipped: ${skipped}`);
  console.log('\n   Run scoring with: npx tsx src/scripts/backfill-scoring.ts\n');

  return { created, updated, eventsCreated, dominionLeadIds };
}

// CLI entry — only run when executed directly (not when imported)
const isMainModule = process.argv[1]?.includes('reimport-csv') ?? false;
if (isMainModule) {
  if (process.argv.includes('--print-migration')) {
    const migrationPath = join(process.cwd(), 'src/db/migrations/0023_property_detail_columns.sql');
    try {
      console.log('\n📋 Migration SQL (run manually in Neon):\n');
      console.log(readFileSync(migrationPath, 'utf-8'));
      console.log('\n');
    } catch {
      console.error('Migration file not found:', migrationPath);
    }
    process.exit(0);
  }

  const args = process.argv.slice(2).filter(a => a !== '--dry-run' && a !== '--print-migration');
  const dryRun = process.argv.includes('--dry-run');
  const fileName = args[0];
  if (!fileName) {
    console.error('Usage: npx tsx src/scripts/reimport-csv.ts <filename.csv> [county] [state] [--dry-run]');
    console.error('       npx tsx src/scripts/reimport-csv.ts --print-migration  (print migration SQL)');
    process.exit(1);
  }
  const filePath = fileName.includes('/') || fileName.includes('\\') ? fileName : join(IMPORT_DIR, fileName);
  const defaultCounty = args[1]?.toUpperCase();
  const defaultState = args[2]?.toUpperCase();

  runImport(filePath, defaultCounty, defaultState, dryRun)
    .then(() => {
      pool.end();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      pool.end().then(() => process.exit(1));
    });
}
