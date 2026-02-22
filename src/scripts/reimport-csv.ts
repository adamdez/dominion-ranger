/**
 * Standalone CSV Reimport Script
 * 
 * Reads PropertyRadar CSV with Ranger Full Extract fields,
 * updates existing properties with severity attributes,
 * creates distress events from flag columns.
 * 
 * Usage: npx tsx src/scripts/reimport-csv.ts spokane.csv
 * 
 * This bypasses BullMQ and the API — runs directly against the DB.
 * Processes records sequentially to avoid Neon connection pool exhaustion.
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '../db/schema/index.js';
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
const fileName = process.argv[2];
if (!fileName) {
  console.error('Usage: npx tsx src/scripts/reimport-csv.ts <filename.csv>');
  process.exit(1);
}
const filePath = fileName.includes('/') || fileName.includes('\\') ? fileName : join(IMPORT_DIR, fileName);

// Default settings
const DEFAULT_COUNTY = process.argv[3]?.toUpperCase() || undefined;
const DEFAULT_STATE = process.argv[4]?.toUpperCase() || undefined;

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

// Column name → index mapping
const HEADER_MAP: Record<string, string[]> = {
  type:             ['type'],
  address:          ['address'],
  city:             ['city'],
  county:           ['county'],
  state:            ['state'],
  zip:              ['zip'],
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
  apn:              ['apn'],
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

function generateUUID(): string {
  // UUID v7 approximation
  const now = Date.now();
  const hex = now.toString(16).padStart(12, '0');
  const random = Array.from({ length: 20 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${random.slice(0, 3)}-${(0x80 | (parseInt(random[3], 16) & 0x3f)).toString(16)}${random.slice(4, 6)}-${random.slice(6, 18)}`;
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
async function main() {
  console.log(`\n🏗️  Dominion Ranger CSV Reimport`);
  console.log(`   File: ${filePath}`);
  console.log(`   County: ${DEFAULT_COUNTY || 'from CSV'}`);
  console.log(`   State: ${DEFAULT_STATE || 'from CSV'}\n`);

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

    const apn = get(values, mapping, 'apn');
    const address = get(values, mapping, 'address');
    if (!apn && !address) { skipped++; continue; }

    const county = get(values, mapping, 'county')?.toUpperCase() || DEFAULT_COUNTY || null;
    const state = get(values, mapping, 'state')?.toUpperCase() || DEFAULT_STATE || null;
    const ownerRaw = get(values, mapping, 'owner') || '';
    const { first: ownerFirst, last: ownerLast } = parseOwnerName(ownerRaw);

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

    // ── Build property_attributes JSONB ──
    const attrs: Record<string, any> = {};
    const taxAmt = num(get(values, mapping, 'taxDelinquentAmt'));
    const estValue = num(get(values, mapping, 'estValue'));
    const estEquityDollar = num(get(values, mapping, 'estEquityDollar'));
    const estEquityPct = num(get(values, mapping, 'estEquityPct'));
    const openLoans = num(get(values, mapping, 'estOpenLoans'));
    const cltvPct = num(get(values, mapping, 'cltv'));
    const annualTaxes = num(get(values, mapping, 'annualTaxes'));
    const purchaseAmt = num(get(values, mapping, 'purchaseAmt'));
    const yearBuilt = num(get(values, mapping, 'yearBuilt'));
    const lotSqft = num(get(values, mapping, 'lotSqft'));
    const hudRent = num(get(values, mapping, 'hudRent'));
    const openLoansCount = num(get(values, mapping, 'openLoansCount'));
    const firstAmount = num(get(values, mapping, 'firstAmount'));
    const firstCashOut = num(get(values, mapping, 'firstCashOut'));
    const secondAmount = num(get(values, mapping, 'secondAmount'));

    if (taxAmt) attrs.taxDelinquentAmount = taxAmt;
    if (estValue) attrs.estimatedValue = estValue;
    if (estEquityDollar) attrs.estimatedEquityDollars = estEquityDollar;
    if (estEquityPct) attrs.estimatedEquityPct = estEquityPct;
    if (openLoans) attrs.openLoansBalance = openLoans;
    if (cltvPct) attrs.cltvPct = cltvPct;
    if (annualTaxes) attrs.annualTaxes = annualTaxes;
    if (purchaseAmt) attrs.purchaseAmount = purchaseAmt;
    if (purchaseDateStr) attrs.purchaseDate = purchaseDateStr;
    if (yearBuilt) attrs.yearBuilt = yearBuilt;
    if (lotSqft) attrs.lotSqft = lotSqft;
    if (hudRent) attrs.hudRent = hudRent;
    if (openLoansCount) attrs.openLoansCount = openLoansCount;
    if (firstAmount) attrs.firstLoanAmount = firstAmount;
    if (firstCashOut) attrs.firstCashOut = firstCashOut;
    if (secondAmount) attrs.secondLoanAmount = secondAmount;

    const sqft = num(get(values, mapping, 'sqft'));
    const beds = num(get(values, mapping, 'beds'));
    const baths = num(get(values, mapping, 'baths'));
    const propType = get(values, mapping, 'type');
    const firstPurpose = get(values, mapping, 'firstPurpose');
    const firstLoanType = get(values, mapping, 'firstLoanType');
    const secondRateType = get(values, mapping, 'secondRateType');

    if (sqft) attrs.sqft = sqft;
    if (beds) attrs.beds = beds;
    if (baths) attrs.baths = baths;
    if (propType) attrs.propertyType = propType;
    if (firstPurpose) attrs.firstLoanPurpose = firstPurpose;
    if (firstLoanType) attrs.firstLoanType = firstLoanType;
    if (secondRateType) attrs.secondRateType = secondRateType;

    // Boolean flags
    const isBankrupt = isTruthy(get(values, mapping, 'bankruptcy'));
    const isDivorce = isTruthy(get(values, mapping, 'divorce'));
    const isDeceased = isTruthy(get(values, mapping, 'deceasedOwner'));
    const isVacant = isTruthy(get(values, mapping, 'siteVacant'));
    const isMailVacant = isTruthy(get(values, mapping, 'mailVacant'));
    const isForeclosure = isTruthy(get(values, mapping, 'foreclosure'));

    if (isBankrupt) attrs.inBankruptcy = true;
    if (isDivorce) attrs.hasDivorce = true;
    if (isDeceased) attrs.ownerDeceased = true;
    if (isVacant) attrs.siteVacant = true;
    if (isMailVacant) attrs.mailVacant = true;

    // Severity ratios
    if (taxAmt && estValue && estValue > 0) {
      attrs.taxToValueRatio = +(taxAmt / estValue).toFixed(4);
    }

    const attrJson = Object.keys(attrs).length > 0 ? attrs : null;

    try {
      // ── Find or create property ──
      let dominionLeadId: string;
      let isNew = false;

      if (apn && county) {
        const existing = await db
          .select({ dominionLeadId: properties.dominionLeadId })
          .from(properties)
          .where(and(eq(properties.apn, apn), eq(properties.county, county)))
          .limit(1);

        if (existing.length > 0) {
          dominionLeadId = existing[0].dominionLeadId;
          // Update with new data
          await db.update(properties).set({
            ownerName: ownerRaw || undefined,
            ownerFirst: ownerFirst || undefined,
            ownerLast: ownerLast || undefined,
            mailingAddress: mailingAddress || undefined,
            absenteeOwner: isAbsentee,
            equityEstimate: estEquityDollar?.toString() || undefined,
            ownershipDurationMonths: ownershipMonths,
            propertyAttributes: attrJson,
            updatedAt: new Date(),
          }).where(eq(properties.dominionLeadId, dominionLeadId));
          updated++;
        } else {
          dominionLeadId = generateUUID();
          isNew = true;
        }
      } else {
        dominionLeadId = generateUUID();
        isNew = true;
      }

      if (isNew) {
        await db.insert(properties).values({
          dominionLeadId,
          propertyId: generateUUID(),
          apn: apn || null,
          county,
          state,
          streetAddress: address,
          city: get(values, mapping, 'city'),
          zip: get(values, mapping, 'zip'),
          ownerName: ownerRaw || null,
          ownerFirst,
          ownerLast,
          mailingAddress,
          absenteeOwner: isAbsentee,
          equityEstimate: estEquityDollar?.toString() || null,
          ownershipDurationMonths: ownershipMonths,
          mortgageStatus: 'UNKNOWN',
          propertyAttributes: attrJson,
        });
        created++;
      }

      // ── Create distress events ──
      const source = `csv_reimport:${fileName}`;
      const newEvents: any[] = [];

      // Always add TAX_DELINQUENCY (this IS the tax delinquent list)
      newEvents.push({
        eventId: generateUUID(),
        dominionLeadId,
        eventType: 'TAX_DELINQUENCY',
        eventLayer: 'confirmed',
        triggerEventDate: new Date(),
        sourceName: source,
        reliabilityScore: '0.85',
        rawEventPayload: { reason: 'tax_delinquent_list', taxDelinquentAmount: taxAmt, source: 'propertyradar' },
        freshnessCategory: 'same_day',
      });

      if (isForeclosure) {
        newEvents.push({
          eventId: generateUUID(),
          dominionLeadId,
          eventType: 'NOTICE_OF_DEFAULT',
          eventLayer: 'confirmed',
          triggerEventDate: new Date(),
          sourceName: source,
          reliabilityScore: '0.90',
          rawEventPayload: { reason: 'foreclosure_flag', source: 'propertyradar' },
          freshnessCategory: 'same_day',
        });
      }

      if (isBankrupt) {
        newEvents.push({
          eventId: generateUUID(),
          dominionLeadId,
          eventType: 'BANKRUPTCY',
          eventLayer: 'confirmed',
          triggerEventDate: new Date(),
          sourceName: source,
          reliabilityScore: '0.90',
          rawEventPayload: { reason: 'bankruptcy_flag', source: 'propertyradar' },
          freshnessCategory: 'same_day',
        });
      }

      if (isDivorce) {
        newEvents.push({
          eventId: generateUUID(),
          dominionLeadId,
          eventType: 'PREDICTIVE_DIVORCE_FILING',
          eventLayer: 'predictive',
          triggerEventDate: new Date(),
          sourceName: source,
          reliabilityScore: '0.60',
          rawEventPayload: { reason: 'divorce_flag', source: 'propertyradar' },
          freshnessCategory: 'same_day',
        });
      }

      if (isDeceased) {
        newEvents.push({
          eventId: generateUUID(),
          dominionLeadId,
          eventType: 'PROBATE',
          eventLayer: 'confirmed',
          triggerEventDate: new Date(),
          sourceName: source,
          reliabilityScore: '0.80',
          rawEventPayload: { reason: 'deceased_owner_flag', source: 'propertyradar' },
          freshnessCategory: 'same_day',
        });
      }

      if (isVacant) {
        newEvents.push({
          eventId: generateUUID(),
          dominionLeadId,
          eventType: 'PREDICTIVE_VACANCY_SIGNAL',
          eventLayer: 'predictive',
          triggerEventDate: new Date(),
          sourceName: source,
          reliabilityScore: '0.50',
          rawEventPayload: { reason: 'site_vacant_flag', source: 'propertyradar' },
          freshnessCategory: 'same_day',
        });
      }

      if (isAbsentee) {
        newEvents.push({
          eventId: generateUUID(),
          dominionLeadId,
          eventType: 'PREDICTIVE_ABSENTEE_DISTRESS',
          eventLayer: 'predictive',
          triggerEventDate: new Date(),
          sourceName: source,
          reliabilityScore: '0.30',
          rawEventPayload: { reason: 'absentee_from_csv', source: 'propertyradar' },
          freshnessCategory: 'same_day',
        });
      }

      // Insert events one at a time to avoid connection issues
      for (const evt of newEvents) {
        await db.insert(distressEvents).values(evt);
        eventsCreated++;
      }

      // Progress logging
      const processed = updated + created;
      if (processed % 500 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = (processed / parseFloat(elapsed)).toFixed(0);
        console.log(`  ⚡ ${processed} processed (${updated} updated, ${created} new) | ${eventsCreated} events | ${rate}/sec`);
      }

    } catch (err: any) {
      errors++;
      if (errors <= 5) {
        console.error(`  ❌ Error on line ${lineNum} (APN: ${apn}): ${err.message}`);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n✅ Import complete in ${elapsed}s`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Created: ${created}`);
  console.log(`   Events:  ${eventsCreated}`);
  console.log(`   Errors:  ${errors}`);
  console.log(`   Skipped: ${skipped}\n`);

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  pool.end().then(() => process.exit(1));
});
