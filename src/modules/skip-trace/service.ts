/**
 * Two-tier on-demand skip trace service.
 *
 * Tier 1 (Standard): Tracerfy — $0.10-0.15/record, good coverage
 * Tier 2 (Advanced): REISkip — $0.40-0.75/record, premium data
 *
 * Both tiers:
 *   - Triggered per-lead only (never bulk from this service)
 *   - Write results back to properties table
 *   - Log activity for analytics cost tracking
 *   - Store raw API response in skip_trace_raw for audit
 */
import { eq } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { properties, propertyContacts } from '../../db/schema/index.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { NotFoundError } from '../../lib/errors.js';
import { logActivity } from '../analytics/activity-logger.js';

const TRACERFY_BASE_URL = 'https://tracerfy.com/v1/api';
const TRACERFY_API_KEY = env.TRACERFY_API_KEY ?? '';

export interface SkipTraceResult {
  success: boolean;
  tier: 'STANDARD' | 'ADVANCED';
  source: string;
  phone?: string | null;
  phoneType?: string | null;
  phone2?: string | null;
  phone2Type?: string | null;
  phone3?: string | null;
  phone3Type?: string | null;
  email?: string | null;
  email2?: string | null;
  email3?: string | null;
  mailingAddress?: string | null;
  rawResponse: Record<string, unknown>;
  costCents: number;
  error?: string;
  allPhones?: Array<{ number: string; type: string }>;
  allEmails?: string[];
}

function cleanPhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return null;
}

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

/**
 * Tier 1: Standard skip trace via Tracerfy.
 * Submits a single-row CSV, polls for completion, returns results.
 */
async function tracerFySkipTrace(property: {
  dominionLeadId: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  ownerFirst: string | null;
  ownerLast: string | null;
  ownerName: string | null;
  mailAddress?: string | null;
  mailCity?: string | null;
  mailState?: string | null;
  mailZip?: string | null;
  absenteeOwner?: boolean | string | null;
}): Promise<SkipTraceResult> {
  if (!TRACERFY_API_KEY) {
    return {
      success: false, tier: 'STANDARD', source: 'TRACERFY',
      rawResponse: {}, costCents: 0,
      error: 'Tracerfy API key not configured. Set TRACERFY_API_KEY.',
    };
  }

  let first = property.ownerFirst ?? '';
  let last = property.ownerLast ?? '';
  if (!first && !last && property.ownerName) {
    const parts = property.ownerName.split(/[,\s]+/).filter(Boolean);
    if (property.ownerName.includes(',')) {
      last = parts[0] ?? '';
      first = parts[1] ?? '';
    } else {
      first = parts[0] ?? '';
      last = parts[parts.length - 1] ?? '';
    }
  }

  // For absentee owners, use mailing address (where the owner lives)
  // Fall back to property address if no mailing address
  const isAbsentee =
    property.absenteeOwner === true ||
    property.absenteeOwner === 'Yes' ||
    property.absenteeOwner === 'Y';
  const useMailAddress = isAbsentee && property.mailAddress;

  const traceStreet = useMailAddress
    ? (property.mailAddress ?? property.streetAddress ?? '')
    : (property.streetAddress ?? '');
  const traceCity = useMailAddress
    ? (property.mailCity ?? property.city ?? '')
    : (property.city ?? '');
  const traceState = useMailAddress
    ? (property.mailState ?? property.state ?? '')
    : (property.state ?? '');
  const traceZip = useMailAddress
    ? (property.mailZip ?? property.zip ?? '')
    : (property.zip ?? '');

  logger.info(
    {
      dominionLeadId: property.dominionLeadId,
      addressType: useMailAddress ? 'mailing' : 'property',
      street: traceStreet,
      city: traceCity,
      state: traceState,
    },
    'Tracerfy skip trace: using address',
  );

  const header = 'dominion_lead_id,address,city,state,zip,first_name,last_name';
  const row = [
    csvEscape(property.dominionLeadId),
    csvEscape(traceStreet),
    csvEscape(traceCity),
    csvEscape(traceState),
    csvEscape(traceZip),
    csvEscape(first),
    csvEscape(last),
  ].join(',');
  const csvContent = `${header}\n${row}`;

  const formData = new FormData();
  formData.append('csv_file', new Blob([csvContent], { type: 'text/csv' }), 'skip_trace.csv');
  formData.append('address_column', 'address');
  formData.append('city_column', 'city');
  formData.append('state_column', 'state');
  formData.append('zip_column', 'zip');
  formData.append('first_name_column', 'first_name');
  formData.append('last_name_column', 'last_name');
  formData.append('trace_type', 'normal');

  const submitRes = await fetch(`${TRACERFY_BASE_URL}/trace/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TRACERFY_API_KEY}` },
    body: formData,
  });

  if (!submitRes.ok) {
    const body = await submitRes.text();
    return {
      success: false, tier: 'STANDARD', source: 'TRACERFY',
      rawResponse: { httpStatus: submitRes.status, body },
      costCents: 0, error: `Tracerfy API error: ${submitRes.status}`,
    };
  }

  const submitData = await submitRes.json() as { queue_id: number };
  const queueId = submitData.queue_id;

  // Poll for completion (every 3s, max 3 min for single record)
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(r => setTimeout(r, 3_000));

    const queuesRes = await fetch(`${TRACERFY_BASE_URL}/queues/`, {
      headers: { Authorization: `Bearer ${TRACERFY_API_KEY}` },
    });
    if (!queuesRes.ok) continue;

    const queues = await queuesRes.json() as Array<{ id: number; pending: boolean; credits_deducted?: number }>;
    const ourQueue = queues.find(q => q.id === queueId);
    if (!ourQueue || ourQueue.pending) continue;

    // Fetch results
    const resultRes = await fetch(`${TRACERFY_BASE_URL}/queue/${queueId}`, {
      headers: { Authorization: `Bearer ${TRACERFY_API_KEY}` },
    });
    if (!resultRes.ok) continue;

    const records = await resultRes.json() as Array<Record<string, string>>;
    const record = records[0];
    if (!record) {
      return {
        success: false, tier: 'STANDARD', source: 'TRACERFY',
        rawResponse: { queueId, records: [] }, costCents: (ourQueue.credits_deducted ?? 1) * 2,
        error: 'No results returned from Tracerfy',
      };
    }

    const phones = [
      { raw: record.primary_phone, type: record.primary_phone_type ?? 'UNKNOWN' },
      { raw: record.mobile_1, type: 'MOBILE' },
      { raw: record.mobile_2, type: 'MOBILE' },
      { raw: record.mobile_3, type: 'MOBILE' },
      { raw: record.mobile_4, type: 'MOBILE' },
      { raw: record.landline_1, type: 'LANDLINE' },
      { raw: record.landline_2, type: 'LANDLINE' },
      { raw: record.landline_3, type: 'LANDLINE' },
    ]
      .map(p => ({ number: cleanPhone(p.raw), type: p.type ?? 'UNKNOWN' }))
      .filter(p => p.number);

    const emails = [record.email_1, record.email_2, record.email_3]
      .map(e => e?.trim().toLowerCase())
      .filter((e): e is string => !!e && e.includes('@'));

    const mailParts = [record.mail_address, record.mail_city, record.mail_state, record.mail_zip].filter(Boolean);

    return {
      success: phones.length > 0 || emails.length > 0,
      tier: 'STANDARD',
      source: 'TRACERFY',
      phone: phones[0]?.number ?? null,
      phoneType: phones[0]?.type ?? null,
      phone2: phones[1]?.number ?? null,
      phone2Type: phones[1]?.type ?? null,
      phone3: phones[2]?.number ?? null,
      phone3Type: phones[2]?.type ?? null,
      email: emails[0] ?? null,
      email2: emails[1] ?? null,
      email3: emails[2] ?? null,
      mailingAddress: mailParts.length > 0 ? mailParts.join(', ') : null,
      rawResponse: record as unknown as Record<string, unknown>,
      costCents: (ourQueue.credits_deducted ?? 1) * 2, // Tracerfy = $0.02/record
      allPhones: phones as Array<{ number: string; type: string }>,
      allEmails: emails,
    };
  }

  return {
    success: false, tier: 'STANDARD', source: 'TRACERFY',
    rawResponse: { queueId, timeout: true }, costCents: 0,
    error: 'Tracerfy trace timed out',
  };
}

/**
 * Tier 2: Advanced skip trace via REISkip.
 * Currently returns a graceful error if REISKIP_API_KEY is not set.
 */
async function reiSkipTrace(property: {
  dominionLeadId: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  ownerFirst: string | null;
  ownerLast: string | null;
}): Promise<SkipTraceResult> {
  if (!env.REISKIP_API_KEY) {
    return {
      success: false, tier: 'ADVANCED', source: 'REISKIP',
      rawResponse: {}, costCents: 0,
      error: 'Advanced skip trace not configured. Set REISKIP_API_KEY.',
    };
  }

  // TODO: Implement actual REISkip API call when API access is available
  logger.info({ dominionLeadId: property.dominionLeadId }, 'REISkip advanced trace requested (not yet wired)');
  return {
    success: false, tier: 'ADVANCED', source: 'REISKIP',
    rawResponse: {}, costCents: 0,
    error: 'REISkip API integration pending. Use Standard tier (Tracerfy) for now.',
  };
}

/**
 * Run an on-demand skip trace for a single property.
 * Writes results back to the properties table and logs activity.
 */
export async function skipTraceProperty(
  dominionLeadId: string,
  tier: 'STANDARD' | 'ADVANCED',
): Promise<SkipTraceResult> {
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.dominionLeadId, dominionLeadId));

  if (!property) throw new NotFoundError('Property', dominionLeadId);

  logger.info({ dominionLeadId, tier }, 'Skip trace requested');

  const result = tier === 'STANDARD'
    ? await tracerFySkipTrace(property)
    : await reiSkipTrace(property);

  if (result.success) {
    const updates: Record<string, unknown> = {
      skipTraceTier: result.tier,
      skipTracedAt: new Date(),
      skipTraceSource: result.source,
      skipTraceRaw: result.rawResponse,
      updatedAt: new Date(),
    };

    if (result.phone) updates.phone = result.phone;
    if (result.phoneType) updates.phoneType = result.phoneType;
    if (result.phone2) updates.phone2 = result.phone2;
    if (result.phone2Type) updates.phone2Type = result.phone2Type;
    if (result.phone3) updates.phone3 = result.phone3;
    if (result.phone3Type) updates.phone3Type = result.phone3Type;
    if (result.email) updates.email = result.email;
    if (result.email2) updates.email2 = result.email2;
    if (result.mailingAddress) updates.mailingAddress = result.mailingAddress;

    await db.update(properties).set(updates).where(eq(properties.dominionLeadId, dominionLeadId));

    // Insert into property_contacts for multi-contact support
    // First, fetch existing contacts to avoid duplicates (Charter: idempotent operations)
    const existingContacts = await db
      .select({ phone: propertyContacts.phone, email: propertyContacts.email })
      .from(propertyContacts)
      .where(eq(propertyContacts.dominionLeadId, dominionLeadId));

    const existingPhones = new Set(existingContacts.map(c => c.phone).filter(Boolean));
    const existingEmails = new Set(existingContacts.map(c => c.email?.toLowerCase()).filter(Boolean));

    const contactRows: Array<{
      dominionLeadId: string;
      contactName: string | null;
      contactType: string;
      phone: string | null;
      phoneType: string | null;
      email: string | null;
      source: string;
      isPrimary: boolean;
      isOwnerMatch: boolean;
      rawData: Record<string, unknown>;
    }> = [];

    // Use allPhones if available (Tracerfy returns up to 8), otherwise fall back to individual fields
    const phoneList =
      result.allPhones && result.allPhones.length > 0
        ? result.allPhones.map((p, i) => ({
            phone: p.number,
            type: p.type,
            primary: i === 0,
          }))
        : [
            { phone: result.phone, type: result.phoneType, primary: true },
            { phone: result.phone2, type: result.phone2Type, primary: false },
            { phone: result.phone3, type: result.phone3Type, primary: false },
          ];

    const phones = phoneList.filter(p => p.phone && !existingPhones.has(p.phone));

    for (const p of phones) {
      contactRows.push({
        dominionLeadId,
        contactName: property.ownerName,
        contactType: 'OWNER',
        phone: p.phone ?? null,
        phoneType: p.type ?? null,
        email: null,
        source: result.source,
        isPrimary: p.primary && existingPhones.size === 0,
        isOwnerMatch: true,
        rawData: result.rawResponse,
      });
    }

    const emailList =
      result.allEmails && result.allEmails.length > 0
        ? result.allEmails
        : ([result.email, result.email2, result.email3].filter(Boolean) as string[]);

    const emails = emailList.filter(
      (e): e is string => !!e && !existingEmails.has(e.toLowerCase()),
    );
    if (emails.length > 0 && phones.length === 0) {
      for (let i = 0; i < emails.length; i++) {
        contactRows.push({
          dominionLeadId,
          contactName: property.ownerName,
          contactType: 'OWNER',
          phone: null,
          phoneType: null,
          email: emails[i] ?? null,
          source: result.source,
          isPrimary: existingPhones.size === 0 && existingEmails.size === 0 && i === 0,
          isOwnerMatch: true,
          rawData: result.rawResponse,
        });
      }
    } else {
      // Attach emails to existing phone-based contact rows
      for (let i = 0; i < Math.min(emails.length, contactRows.length); i++) {
        contactRows[i].email = emails[i] ?? null;
      }
    }

    if (contactRows.length > 0) {
      await db.insert(propertyContacts).values(contactRows).catch(err => {
        logger.error({ err, dominionLeadId }, 'Failed to insert property contacts from skip trace');
      });
    }
  }

  // Log activity for cost tracking (PART 3)
  await logActivity({
    dominionLeadId,
    activityType: 'COMPLIANCE_CHECKED',
    channel: 'OUTBOUND_COLD',
    costCents: result.costCents,
    meta: {
      action: 'SKIP_TRACE',
      tier: result.tier,
      source: result.source,
      success: result.success,
      phonesFound: result.allPhones?.length ?? [result.phone, result.phone2, result.phone3].filter(Boolean).length,
      emailsFound: result.allEmails?.length ?? [result.email, result.email2, result.email3].filter(Boolean).length,
      error: result.error,
    },
  }).catch(err => logger.error({ err }, 'Failed to log skip trace activity'));

  logger.info(
    { dominionLeadId, tier, success: result.success, source: result.source, costCents: result.costCents },
    result.success ? 'Skip trace completed' : 'Skip trace failed',
  );

  return result;
}
