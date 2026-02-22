/**
 * Tracerfy Enrichment Adapter
 * ─────────────────────────────────────────────────────
 * Fully automated skip trace enrichment via Tracerfy REST API.
 *
 * Flow:
 *   1. Ranger exports properties needing enrichment as CSV in memory
 *   2. POST /v1/api/trace/ — uploads CSV with column mapping
 *   3. Tracerfy processes async, fires webhook when done
 *   4. GET /v1/api/queue/:id — Ranger fetches enriched results
 *   5. Phone/email/address written back to properties table
 *   6. Zero manual steps
 *
 * API Reference (reverse-engineered from docs + GitHub examples):
 *   Base URL: https://tracerfy.com/v1/api/
 *   Auth: Bearer token in Authorization header
 *   POST /trace/ — multipart/form-data with csv_file + column mappings
 *   GET /queues/ — list all jobs
 *   GET /queue/:id — get job results with download_url
 *   GET /analytics/ — account balance/credits
 *   POST /dnc/scrub/ — DNC scrubbing
 */

import { db } from '../../db/connection.js';
import { properties } from '../../db/schema/index.js';
import { eq, isNull, or, and, sql } from 'drizzle-orm';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';

// ─── Configuration ──────────────────────────────────

const TRACERFY_BASE_URL = 'https://tracerfy.com/v1/api';
const TRACERFY_API_KEY = env.TRACERFY_API_KEY ?? '';
const MAX_BATCH_SIZE = 5000; // Tracerfy handles large batches well
const POLL_INTERVAL_MS = 30_000; // 30 seconds between status checks
const MAX_POLL_ATTEMPTS = 60; // 30 minutes max wait

// ─── Types ──────────────────────────────────────────

interface TracerFyTraceResponse {
  message: string;
  queue_id: number;
  status: string;
  type: string;
  created_at: string;
  rows_uploaded: number;
}

interface TracerFyQueueResult {
  id: number;
  created_at: string;
  pending: boolean;
  service_type?: string;
  download_url?: string;
  rows_uploaded: number;
  credits_deducted?: number;
  queue_type?: string;
  trace_type?: string;
  credits_per_lead?: number;
}

/** Single record from GET /queue/:id response */
interface TracerFyRecord {
  address: string;
  city: string;
  state: string;
  zip?: string;
  mail_address?: string;
  mail_city?: string;
  mail_state?: string;
  mail_zip?: string;
  first_name: string;
  last_name: string;
  primary_phone?: string;
  primary_phone_type?: string;
  age?: string;
  // Phones
  mobile_1?: string; mobile_2?: string; mobile_3?: string;
  mobile_4?: string; mobile_5?: string;
  landline_1?: string; landline_2?: string; landline_3?: string;
  // Emails
  email_1?: string; email_2?: string; email_3?: string;
  email_4?: string; email_5?: string;
  // Enhanced only
  alias_1?: string; alias_2?: string; alias_3?: string;
  alias_4?: string; alias_5?: string;
  past_address_1?: string; past_address_2?: string; past_address_3?: string;
  past_address_4?: string; past_address_5?: string;
  business_1?: string; business_2?: string; business_3?: string;
  business_4?: string; business_5?: string;
  // Relatives (enhanced only) — up to 8
  [key: `relative_${number}_name`]: string;
  [key: `relative_${number}_mobile_${number}`]: string;
  [key: `relative_${number}_landline_${number}`]: string;
  [key: `relative_${number}_email_${number}`]: string;
  // Our custom column passed through
  dominion_lead_id?: string;
  [key: string]: string | undefined;
}

interface EnrichmentResult {
  dominionLeadId: string;
  phones: string[];
  emails: string[];
  mailingAddress?: string;
  relatives: { name: string; phones: string[]; emails: string[] }[];
  aliases: string[];
  pastAddresses: string[];
  businesses: string[];
  raw: Record<string, unknown>;
}

// ─── CSV Generation ─────────────────────────────────

/**
 * Build a CSV string from properties needing enrichment.
 * Tracerfy requires: address, city, state, first_name, last_name
 * Optional: mail_address, mail_city, mail_state, zip
 */
function buildEnrichmentCsv(
  rows: {
    dominionLeadId: string;
    streetAddress: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    ownerFirst: string | null;
    ownerLast: string | null;
    ownerName: string | null;
    mailingAddress: string | null;
  }[],
): string {
  const header = 'dominion_lead_id,address,city,state,zip,first_name,last_name,mail_address,mail_city,mail_state';
  const lines = rows.map((r) => {
    // Parse first/last from ownerName if not split
    let first = r.ownerFirst ?? '';
    let last = r.ownerLast ?? '';
    if (!first && !last && r.ownerName) {
      const parts = r.ownerName.split(/[,\s]+/).filter(Boolean);
      if (r.ownerName.includes(',')) {
        // "LAST, FIRST" format
        last = parts[0] ?? '';
        first = parts[1] ?? '';
      } else {
        first = parts[0] ?? '';
        last = parts[parts.length - 1] ?? '';
      }
    }

    // Parse mailing address components if available
    // Format: "123 Main St, Spokane, WA, 99201"
    let mailAddr = '';
    let mailCity = '';
    let mailState = '';
    if (r.mailingAddress) {
      const mailParts = r.mailingAddress.split(',').map((p) => p.trim());
      mailAddr = mailParts[0] ?? '';
      mailCity = mailParts[1] ?? '';
      mailState = mailParts[2] ?? '';
    }

    return [
      csvEscape(r.dominionLeadId),
      csvEscape(r.streetAddress ?? ''),
      csvEscape(r.city ?? ''),
      csvEscape(r.state ?? ''),
      csvEscape(r.zip ?? ''),
      csvEscape(first),
      csvEscape(last),
      csvEscape(mailAddr),
      csvEscape(mailCity),
      csvEscape(mailState),
    ].join(',');
  });

  return [header, ...lines].join('\n');
}

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

// ─── API Client ─────────────────────────────────────

async function tracerFyRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!TRACERFY_API_KEY) {
    throw new Error('TRACERFY_API_KEY not set in environment');
  }

  const url = `${TRACERFY_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${TRACERFY_API_KEY}`,
    ...(options.headers as Record<string, string> ?? {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Tracerfy API error ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Submit a CSV for skip tracing.
 * Uses multipart/form-data with the csv_file field + column mappings.
 * trace_type: 'normal' (1 credit/lead) or 'enhanced' (15 credits/lead)
 */
async function submitTrace(csvContent: string, traceType: 'normal' | 'enhanced' = 'normal'): Promise<TracerFyTraceResponse> {
  if (!TRACERFY_API_KEY) {
    throw new Error('TRACERFY_API_KEY not set in environment');
  }

  const url = `${TRACERFY_BASE_URL}/trace/`;

  // Build multipart form
  const formData = new FormData();

  // CSV file as blob
  const csvBlob = new Blob([csvContent], { type: 'text/csv' });
  formData.append('csv_file', csvBlob, 'ranger_enrichment.csv');

  // Column mappings — required by Tracerfy API
  formData.append('address_column', 'address');
  formData.append('city_column', 'city');
  formData.append('state_column', 'state');
  formData.append('zip_column', 'zip');
  formData.append('first_name_column', 'first_name');
  formData.append('last_name_column', 'last_name');
  formData.append('mail_address_column', 'mail_address');
  formData.append('mail_city_column', 'mail_city');
  formData.append('mail_state_column', 'mail_state');

  // Trace type: normal ($0.02) or enhanced ($0.15)
  formData.append('trace_type', traceType);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TRACERFY_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Tracerfy trace submit failed ${response.status}: ${body}`);
  }

  return response.json() as Promise<TracerFyTraceResponse>;
}

/**
 * Poll for job completion using GET /queues/ to check status.
 * Returns the completed queue metadata.
 */
async function pollForCompletion(queueId: number): Promise<TracerFyQueueResult> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    // Use /queues/ to check pending status — it shows all queues with metadata
    const queues = await tracerFyRequest<TracerFyQueueResult[]>('/queues/');
    const ourQueue = queues.find((q) => q.id === queueId);

    if (ourQueue && !ourQueue.pending) {
      logger.info(
        { queueId, credits: ourQueue.credits_deducted, rows: ourQueue.rows_uploaded, traceType: ourQueue.trace_type },
        'Tracerfy job completed',
      );
      return ourQueue;
    }

    logger.debug({ queueId, attempt, pending: ourQueue?.pending ?? 'not found' }, 'Tracerfy job still processing');
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Tracerfy job ${queueId} timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 60000} minutes`);
}

/**
 * Fetch enriched results from a completed queue.
 * GET /queue/:id returns JSON array of records directly.
 */
async function fetchQueueResults(queueId: number, submittedRows: { dominionLeadId: string; streetAddress: string | null }[]): Promise<Map<string, EnrichmentResult>> {
  const records = await tracerFyRequest<TracerFyRecord[]>(`/queue/${queueId}`);
  const results = new Map<string, EnrichmentResult>();

  for (const record of records) {
    const addressToId = new Map<string, string>(); for (const row of submittedRows) { if (row.streetAddress) { addressToId.set(row.streetAddress.toUpperCase().replace(/[^A-Z0-9]/g, ""), row.dominionLeadId); } }
    const dominionLeadId = addressToId.get((record.address || "").toUpperCase().replace(/[^A-Z0-9]/g, ""));
    if (!dominionLeadId) continue;

    // Extract phones (deduplicated, non-empty)
    const phones = [...new Set([
      record.primary_phone,
      record.mobile_1, record.mobile_2, record.mobile_3,
      record.mobile_4, record.mobile_5,
      record.landline_1, record.landline_2, record.landline_3,
    ].map(cleanPhone).filter(Boolean))] as string[];

    // Extract emails
    const emails = [...new Set([
      record.email_1, record.email_2, record.email_3,
      record.email_4, record.email_5,
    ].map((e) => e?.trim().toLowerCase())
      .filter((e) => e && e.includes('@')))] as string[];

    // Mailing address
    const mailParts = [record.mail_address, record.mail_city, record.mail_state, record.mail_zip]
      .filter(Boolean);
    const mailingAddress = mailParts.length > 0 ? mailParts.join(', ') : undefined;

    // Enhanced fields: aliases
    const aliases = [
      record.alias_1, record.alias_2, record.alias_3,
      record.alias_4, record.alias_5,
    ].filter((a) => a && a.trim()) as string[];

    // Enhanced fields: past addresses
    const pastAddresses = [
      record.past_address_1, record.past_address_2, record.past_address_3,
      record.past_address_4, record.past_address_5,
    ].filter((a) => a && a.trim()) as string[];

    // Enhanced fields: businesses
    const businesses = [
      record.business_1, record.business_2, record.business_3,
      record.business_4, record.business_5,
    ].filter((b) => b && b.trim()) as string[];

    // Enhanced fields: relatives (up to 8)
    const relatives: { name: string; phones: string[]; emails: string[] }[] = [];
    for (let i = 1; i <= 8; i++) {
      const name = record[`relative_${i}_name`];
      if (!name || !name.trim()) continue;

      const relPhones = [
        record[`relative_${i}_mobile_1`],
        record[`relative_${i}_mobile_2`],
        record[`relative_${i}_mobile_3`],
        record[`relative_${i}_landline_1`],
        record[`relative_${i}_landline_2`],
      ].map(cleanPhone).filter(Boolean) as string[];

      const relEmails = [
        record[`relative_${i}_email_1`],
        record[`relative_${i}_email_2`],
        record[`relative_${i}_email_3`],
      ].map((e) => e?.trim().toLowerCase())
        .filter((e) => e && e.includes('@')) as string[];

      relatives.push({ name: name.trim(), phones: relPhones, emails: relEmails });
    }

    results.set(dominionLeadId, {
      dominionLeadId,
      phones,
      emails,
      mailingAddress,
      relatives,
      aliases,
      pastAddresses,
      businesses,
      raw: record as unknown as Record<string, unknown>,
    });
  }

  return results;
}

/**
 * Download and parse CSV results from a download_url.
 * Fallback for when we need CSV-based processing.
 */
async function downloadResults(downloadUrl: string): Promise<Map<string, EnrichmentResult>> {
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download Tracerfy results: ${response.status}`);
  }

  const csvText = await response.text();
  const lines = csvText.split('\n').filter((l) => l.trim());
  if (lines.length < 2) {
    return new Map();
  }

  // Parse headers
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const results = new Map<string, EnrichmentResult>();

  const dominionIdIdx = headers.indexOf('dominion_lead_id');

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 0) continue;

    const dominionLeadId = dominionIdIdx !== -1 ? values[dominionIdIdx]?.trim() : null;
    if (!dominionLeadId) continue;

    // Build a record object from CSV to reuse the JSON parsing logic
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (values[idx]?.trim()) record[h] = values[idx].trim();
    });

    // Extract phones
    const phoneKeys = headers.filter((h) =>
      h.startsWith('mobile') || h.startsWith('landline') || h === 'primary_phone',
    );
    const phones = [...new Set(
      phoneKeys.map((k) => cleanPhone(record[k])).filter(Boolean),
    )] as string[];

    // Extract emails
    const emailKeys = headers.filter((h) => h.startsWith('email'));
    const emails = [...new Set(
      emailKeys.map((k) => record[k]?.toLowerCase()).filter((e) => e && e.includes('@')),
    )] as string[];

    results.set(dominionLeadId, {
      dominionLeadId,
      phones,
      emails,
      mailingAddress: record.mail_address || undefined,
      relatives: [],
      aliases: [],
      pastAddresses: [],
      businesses: [],
      raw: record,
    });
  }

  return results;
}

// ─── Phone Cleaning ─────────────────────────────────

function cleanPhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return null;
}

// ─── CSV Parsing ────────────────────────────────────

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
          i++;
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

// ─── Enhanced Trace Triggers ────────────────────────
// These distress types warrant enhanced trace (relatives, aliases)
// because the owner of record may be deceased, unreachable, or a legal entity
const ENHANCED_TRACE_EVENT_TYPES = new Set([
  'PROBATE',
]);

// ─── Main Enrichment Pipeline ───────────────────────

/**
 * Run the full enrichment pipeline:
 *   1. Query DB for properties missing phone/email
 *   2. Check distress events to split into normal vs enhanced batches
 *   3. Build CSVs for each batch
 *   4. Submit to Tracerfy (normal + enhanced as separate API calls)
 *   5. Poll for completion
 *   6. Download results
 *   7. Update properties table
 *
 * Returns count of enriched properties.
 */
export async function runTracerFyEnrichment(options?: {
  limit?: number;
  county?: string;
  minScore?: number;
  forceAll?: boolean;
  forceEnhanced?: boolean;
}): Promise<{ submitted: number; enriched: number; normalQueueId: number; enhancedQueueId: number }> {
  const limit = options?.limit ?? MAX_BATCH_SIZE;

  logger.info({ limit, county: options?.county, forceEnhanced: options?.forceEnhanced }, 'Starting Tracerfy enrichment pipeline');

  // Step 1: Query properties needing enrichment
  const conditions = [];

  if (!options?.forceAll) {
    conditions.push(
      or(
        isNull(properties.phone),
        eq(properties.phone, ''),
      ),
    );
  }

  if (options?.county) {
    conditions.push(eq(properties.county, options.county.toUpperCase()));
  }

  const needsEnrichment = await db
    .select({
      dominionLeadId: properties.dominionLeadId,
      streetAddress: properties.streetAddress,
      city: properties.city,
      state: properties.state,
      zip: properties.zip,
      ownerFirst: properties.ownerFirst,
      ownerLast: properties.ownerLast,
      ownerName: properties.ownerName,
      mailingAddress: properties.mailingAddress,
    })
    .from(properties)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(limit);

  if (needsEnrichment.length === 0) {
    logger.info('No properties need enrichment');
    return { submitted: 0, enriched: 0, normalQueueId: 0, enhancedQueueId: 0 };
  }

  // Filter out records with no address (Tracerfy needs address)
  const validRows = needsEnrichment.filter((r) => r.streetAddress || r.ownerName);

  // Step 2: Split into normal vs enhanced based on distress events
  let normalRows = validRows;
  let enhancedRows: typeof validRows = [];

  if (!options?.forceEnhanced) {
    // Query which properties have enhanced-trigger events
    const enhancedLeadIds = await db.execute(sql`
      SELECT DISTINCT dominion_lead_id
      FROM distress_events
      WHERE event_type IN (${sql.join(
        [...ENHANCED_TRACE_EVENT_TYPES].map(t => sql`${t}`),
        sql`, `
      )})
    `);

    const enhancedIdSet = new Set(
      (enhancedLeadIds.rows as { dominion_lead_id: string }[]).map((r) => r.dominion_lead_id),
    );

    enhancedRows = validRows.filter((r) => enhancedIdSet.has(r.dominionLeadId));
    normalRows = validRows.filter((r) => !enhancedIdSet.has(r.dominionLeadId));
  } else {
    // Force all to enhanced
    enhancedRows = validRows;
    normalRows = [];
  }

  logger.info(
    { total: validRows.length, normal: normalRows.length, enhanced: enhancedRows.length },
    'Enrichment batches split by trace type',
  );

  let totalEnriched = 0;
  let normalQueueId = 0;
  let enhancedQueueId = 0;

  // Step 3: Process normal batch
  if (normalRows.length > 0) {
    const csvContent = buildEnrichmentCsv(normalRows);
    const traceResponse = await submitTrace(csvContent, 'normal');
    normalQueueId = traceResponse.queue_id;
    logger.info({ queueId: normalQueueId, rows: traceResponse.rows_uploaded }, 'Normal trace submitted');

    const completedJob = await pollForCompletion(normalQueueId);
    if (completedJob) {
      const results = await downloadAndApplyResults(completedJob.id, 'normal', normalRows);
      totalEnriched += results;
    }
  }

  // Step 4: Process enhanced batch
  if (enhancedRows.length > 0) {
    const csvContent = buildEnrichmentCsv(enhancedRows);
    const traceResponse = await submitTrace(csvContent, 'enhanced');
    enhancedQueueId = traceResponse.queue_id;
    logger.info({ queueId: enhancedQueueId, rows: traceResponse.rows_uploaded }, 'Enhanced trace submitted');

    const completedJob = await pollForCompletion(enhancedQueueId);
    if (completedJob) {
      const results = await downloadAndApplyResults(completedJob.id, 'enhanced', enhancedRows);
      totalEnriched += results;
    }
  }

  logger.info(
    { submitted: validRows.length, enriched: totalEnriched, normalQueueId, enhancedQueueId },
    'Tracerfy enrichment pipeline complete',
  );

  return {
    submitted: validRows.length,
    enriched: totalEnriched,
    normalQueueId,
    enhancedQueueId,
  };
}

/**
 * Fetch results from Tracerfy queue and write back to properties table.
 */
async function downloadAndApplyResults(queueId: number, traceType: "normal" | "enhanced", submittedRows: { dominionLeadId: string; streetAddress: string | null }[]): Promise<number> {
  const results = await fetchQueueResults(queueId, submittedRows);
  logger.info({ results: results.size, traceType }, 'Tracerfy results fetched');

  let enrichedCount = 0;

  for (const [dominionLeadId, result] of results) {
    if (result.phones.length === 0 && result.emails.length === 0) continue;

    try {
      const updates: Record<string, unknown> = {};

      if (result.phones.length > 0) {
        updates.phone = result.phones[0];
      }
      if (result.emails.length > 0) {
        updates.email = result.emails[0];
      }
      if (result.mailingAddress) {
        updates.mailingAddress = result.mailingAddress;
      }

      // Store full contact stack in enrichment_data JSONB
      updates.enrichmentData = JSON.stringify({
        source: 'tracerfy',
        traceType,
        enrichedAt: new Date().toISOString(),
        queueId,
        phones: result.phones,
        emails: result.emails,
        relatives: result.relatives ?? [],
        aliases: result.aliases ?? [],
        pastAddresses: result.pastAddresses ?? [],
        businesses: result.businesses ?? [],
        raw: result.raw,
      });

      await db
        .update(properties)
        .set(updates as any)
        .where(eq(properties.dominionLeadId, dominionLeadId));

      enrichedCount++;
    } catch (err) {
      logger.error({ dominionLeadId, err }, 'Failed to update property with enrichment data');
    }
  }

  return enrichedCount;
}

// ─── Account Analytics ──────────────────────────────

export async function getTracerFyBalance(): Promise<{
  balance: number;
  totalQueues: number;
  propertiesTraced: number;
  queuesPending: number;
  queuesCompleted: number;
}> {
  const data = await tracerFyRequest<{
    total_queues: number;
    properties_traced: number;
    queues_pending: number;
    queues_completed: number;
    balance: number;
  }>('/analytics/');

  return {
    balance: data.balance ?? 0,
    totalQueues: data.total_queues ?? 0,
    propertiesTraced: data.properties_traced ?? 0,
    queuesPending: data.queues_pending ?? 0,
    queuesCompleted: data.queues_completed ?? 0,
  };
}

// ─── DNC Scrubbing ──────────────────────────────────

/**
 * Submit a completed trace queue for DNC scrubbing.
 * Scrubs ALL phone numbers from a previous trace against
 * Federal DNC, State DNC, DMA, and TCPA Litigator databases.
 * 1 credit per phone checked.
 *
 * Valid phone_columns: primary_phone, mobile_1-5, landline_1-3
 * Defaults to all 9 phone fields if omitted.
 */
export async function submitDncScrub(
  queueId: number,
  phoneColumns?: string[],
): Promise<{
  message: string;
  dnc_queue_id: number;
  status: string;
  phones_to_check: number;
  phone_columns_used: string[];
}> {
  const body: Record<string, unknown> = { queue_id: queueId };
  if (phoneColumns && phoneColumns.length > 0) {
    body.phone_columns = phoneColumns;
  }

  return tracerFyRequest('/dnc/scrub-from-queue/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Get DNC scrub results.
 * Returns two download URLs:
 *   - download_url: all phones with DNC flags (national_dnc, state_dnc, dma, litigator, phone_type, is_clean)
 *   - clean_download_url: only DNC-free phones
 */
export async function getDncResults(queueId: number): Promise<{
  id: number;
  pending: boolean;
  download_url?: string;
  clean_download_url?: string;
  rows_uploaded?: number;
  phones_checked?: number;
  phones_clean?: number;
  credits_deducted?: number;
  source_type?: string;
}> {
  return tracerFyRequest(`/dnc/queue/${queueId}`);
}
