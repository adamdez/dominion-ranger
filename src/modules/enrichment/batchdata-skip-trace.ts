/**
 * BatchData Skip Trace Service
 * ─────────────────────────────────────────────────────
 * Low-cost skip trace via BatchData ($0.01/record).
 *
 * API: POST https://api.batchdata.com/api/v1/property/skip-trace
 * Auth: Bearer token in Authorization header
 * Body: { requests: [{ name: { first, last }, address: { street, city, state, zip } }] }
 * Returns: phones[], emails[], associated people
 */

import { logger } from '../../config/logger.js';

const BATCHDATA_BASE = 'https://api.batchdata.com/api/v1';

export interface BatchDataSkipTraceRequest {
  firstName: string;
  lastName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface BatchDataPhone {
  phone: string;
  phoneType: string | null;
  isConnected: boolean | null;
}

export interface BatchDataEmail {
  email: string;
}

export interface BatchDataPerson {
  firstName: string | null;
  lastName: string | null;
  phones: BatchDataPhone[];
  emails: BatchDataEmail[];
  relationship: string | null;
}

export interface BatchDataSkipTraceResult {
  success: boolean;
  persons: BatchDataPerson[];
  rawResponse: Record<string, unknown>;
  error?: string;
}

/**
 * Parse owner name string into first/last for BatchData skip trace.
 * Handles: "LAST, FIRST", "FIRST & SPOUSE LAST", "FIRST MIDDLE LAST", entities (trusts/LLCs).
 */
export function parseOwnerName(ownerName: string): { first: string; last: string } | null {
  if (!ownerName || ownerName.trim() === '') return null;

  const name = ownerName.trim().toUpperCase();

  // Skip trusts, LLCs, corps — skip trace won't work on entities
  if (/\b(TRUST|LLC|INC|CORP|BANK|COUNTY|STATE|CITY|CHURCH|ASSOC|FOUNDATION)\b/i.test(name)) {
    return null;
  }

  // Handle "LAST, FIRST" format
  if (name.includes(',')) {
    const [lastPart, firstPart] = name.split(',').map((s) => s.trim());
    // Remove "& SPOUSE" from first name
    const firstName = (firstPart || '').split(/\s*&\s*/)[0].trim();
    // Remove middle initials (single letters)
    const cleanFirst =
      firstName.split(/\s+/).filter((w) => w.length > 1)[0] ||
      firstName.split(/\s+/)[0] ||
      '';
    return {
      first: cleanFirst,
      last: lastPart.split(/\s+/)[0] || lastPart,
    };
  }

  // Handle "FIRST & SPOUSE LAST" format (most common in our data)
  // "JACK & SHIRLEY EVENOFF" → first: JACK, last: EVENOFF
  if (name.includes('&')) {
    const parts = name.split(/\s*&\s*/);
    // First person's first name is before the &
    const firstName = parts[0].trim().split(/\s+/).pop() || parts[0].trim();
    // Last name is the last word of the full string
    const allWords = name.split(/\s+/);
    const lastName = allWords[allWords.length - 1];
    return { first: firstName, last: lastName };
  }

  // Handle "FIRST MIDDLE LAST" or "FIRST LAST" format
  const words = name.split(/\s+/).filter((w) => w.length > 0);
  if (words.length >= 2) {
    return { first: words[0], last: words[words.length - 1] };
  }

  // Single word — treat as last name
  if (words.length === 1) {
    return { first: '', last: words[0] };
  }

  return null;
}

function cleanPhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return null;
}

/**
 * Skip trace a single property via BatchData.
 * Cost: ~$0.01 per record.
 */
export async function batchDataSkipTrace(
  request: BatchDataSkipTraceRequest,
): Promise<BatchDataSkipTraceResult> {
  const apiKey = process.env.BATCHDATA_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      persons: [],
      rawResponse: {},
      error: 'BATCHDATA_API_KEY not configured',
    };
  }

  const body = {
    requests: [
      {
        name: {
          first: request.firstName.toUpperCase(),
          last: request.lastName.toUpperCase(),
        },
        address: {
          street: request.street.toUpperCase(),
          city: request.city.toUpperCase(),
          state: request.state.toUpperCase(),
          zip: request.zip,
        },
      },
    ],
  };

  logger.info(
    {
      name: { first: request.firstName, last: request.lastName },
      address: body.requests[0].address,
    },
    'BatchData skip trace request',
  );

  try {
    const response = await fetch(`${BATCHDATA_BASE}/property/skip-trace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { status: response.status, error: errorText },
        'BatchData skip trace failed',
      );
      return {
        success: false,
        persons: [],
        rawResponse: { httpStatus: response.status, body: errorText },
        error: `BatchData API error: ${response.status}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    logger.info({ raw: JSON.stringify(data, null, 2).slice(0, 500) }, 'BatchData skip trace raw response');

    // Handle API error responses
    const status = data?.status as { code?: number; message?: string } | undefined;
    if ((status && status.code !== 200) || !data?.results) {
      logger.info({ status: data?.status }, 'BatchData skip trace: no results or error');
      return {
        success: false,
        persons: [],
        rawResponse: data,
        error: status?.message ?? 'No results or API error',
      };
    }

    // Handle various response shapes: results may be object with persons[], or array, or null
    const rawResults = data.results as Record<string, unknown> | unknown[] | null | undefined;
    const personsArray: Array<Record<string, unknown>> = Array.isArray(rawResults)
      ? rawResults as Array<Record<string, unknown>>
      : Array.isArray((rawResults as Record<string, unknown>)?.persons)
        ? ((rawResults as Record<string, unknown>).persons as Array<Record<string, unknown>>)
        : (rawResults as Record<string, unknown>)?.person
          ? [(rawResults as Record<string, unknown>).person as Record<string, unknown>]
          : [];

    if (personsArray.length === 0) {
      logger.info({ ownerName: `${request.firstName} ${request.lastName}` }, 'BatchData skip trace: no persons found');
      return {
        success: false,
        persons: [],
        rawResponse: data,
        error: 'No results returned',
      };
    }

    const persons: BatchDataPerson[] = [];

    for (const result of personsArray) {
      const identity = (result.identity ?? result.person ?? result) as Record<string, unknown>;
      const nameObj = (identity.name ?? identity) as Record<string, string>;
      const rawPhones = (
        (result.phones ?? result.phone_numbers ?? identity.phones ?? []) as Array<Record<string, unknown>>
      ) ?? [];
      const rawEmails = (
        (result.emails ?? result.email_addresses ?? identity.emails ?? []) as Array<Record<string, unknown>>
      ) ?? [];

      const phones: BatchDataPhone[] = (Array.isArray(rawPhones) ? rawPhones : [])
        .map((p) => {
          const cleaned = cleanPhone(
            ((p?.phone_number ?? p?.phone ?? p?.number ?? '') as string),
          );
          if (!cleaned) return null;
          return {
            phone: cleaned,
            phoneType: ((p.phone_type ?? p.type ?? null) as string | null)?.toUpperCase() ?? null,
            isConnected: (p.is_connected ?? p.connected ?? null) as boolean | null,
          };
        })
        .filter((p): p is BatchDataPhone => p !== null);

      const emails: BatchDataEmail[] = (Array.isArray(rawEmails) ? rawEmails : [])
        .map((e) => {
          const email = ((e?.email_address ?? e?.email ?? '') as string)
            .trim()
            .toLowerCase();
          return email && email.includes('@') ? { email } : null;
        })
        .filter((e): e is BatchDataEmail => e !== null);

      persons.push({
        firstName: nameObj?.first ?? (nameObj as Record<string, string>)?.first_name ?? null,
        lastName: nameObj?.last ?? (nameObj as Record<string, string>)?.last_name ?? null,
        phones,
        emails,
        relationship: (identity.relationship ?? null) as string | null,
      });

      // Also parse associated people if present
      const associated = (
        Array.isArray(result.associated_people)
          ? result.associated_people
          : Array.isArray(result.associates)
            ? result.associates
            : []
      ) as Array<Record<string, unknown>>;
      for (const assoc of associated) {
        const assocName = (assoc.name ?? assoc) as Record<string, string>;
        const assocPhones = ((assoc.phones ?? []) as Array<Record<string, unknown>>)
          .map((p) => {
            const cleaned = cleanPhone(
              (p.phone_number ?? p.phone ?? '') as string,
            );
            if (!cleaned) return null;
            return {
              phone: cleaned,
              phoneType: ((p.phone_type ?? p.type ?? null) as string | null)?.toUpperCase() ?? null,
              isConnected: (p.is_connected ?? null) as boolean | null,
            };
          })
          .filter((p): p is BatchDataPhone => p !== null);

        const assocEmails = ((assoc.emails ?? []) as Array<Record<string, unknown>>)
          .map((e) => {
            const email = ((e.email_address ?? e.email ?? '') as string)
              .trim()
              .toLowerCase();
            return email && email.includes('@') ? { email } : null;
          })
          .filter((e): e is BatchDataEmail => e !== null);

        if (assocPhones.length > 0 || assocEmails.length > 0) {
          persons.push({
            firstName: assocName.first ?? assocName.first_name ?? null,
            lastName: assocName.last ?? assocName.last_name ?? null,
            phones: assocPhones,
            emails: assocEmails,
            relationship: (assoc.relationship ?? 'ASSOCIATE') as string,
          });
        }
      }
    }

    const totalPhones = persons.reduce((sum, p) => sum + p.phones.length, 0);
    const totalEmails = persons.reduce((sum, p) => sum + p.emails.length, 0);

    logger.info(
      { persons: persons.length, phones: totalPhones, emails: totalEmails },
      'BatchData skip trace completed',
    );

    return {
      success: totalPhones > 0 || totalEmails > 0,
      persons,
      rawResponse: data,
    };
  } catch (err) {
    logger.error({ err }, 'BatchData skip trace request failed');
    return {
      success: false,
      persons: [],
      rawResponse: {},
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Batch skip trace multiple properties in a single API call.
 * BatchData supports up to 100 records per request.
 */
export async function batchDataBulkSkipTrace(
  requests: BatchDataSkipTraceRequest[],
): Promise<Map<string, BatchDataSkipTraceResult>> {
  const apiKey = process.env.BATCHDATA_API_KEY;
  if (!apiKey) {
    const results = new Map<string, BatchDataSkipTraceResult>();
    for (const req of requests) {
      const key = `${req.street}|${req.firstName} ${req.lastName}`;
      results.set(key, {
        success: false,
        persons: [],
        rawResponse: {},
        error: 'BATCHDATA_API_KEY not configured',
      });
    }
    return results;
  }

  const body = {
    requests: requests.map((r) => ({
      name: {
        first: r.firstName.toUpperCase(),
        last: r.lastName.toUpperCase(),
      },
      address: {
        street: r.street.toUpperCase(),
        city: r.city.toUpperCase(),
        state: r.state.toUpperCase(),
        zip: r.zip,
      },
    })),
  };

  logger.info({ count: requests.length }, 'BatchData bulk skip trace request');

  try {
    const response = await fetch(`${BATCHDATA_BASE}/property/skip-trace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status }, 'BatchData bulk skip trace failed');
      const results = new Map<string, BatchDataSkipTraceResult>();
      for (const req of requests) {
        const key = `${req.street}|${req.firstName} ${req.lastName}`;
        results.set(key, {
          success: false,
          persons: [],
          rawResponse: { httpStatus: response.status, body: errorText },
          error: `BatchData API error: ${response.status}`,
        });
      }
      return results;
    }

    // For bulk, the API returns one result per request in order
    const data = (await response.json()) as Record<string, unknown>;
    const rawApiResults = data.results ?? data.data;
    const apiResults: Array<Record<string, unknown>> = Array.isArray(rawApiResults)
      ? (rawApiResults as Array<Record<string, unknown>>)
      : [];
    const resultMap = new Map<string, BatchDataSkipTraceResult>();

    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      const key = `${req.street}|${req.firstName} ${req.lastName}`;
      const singleResult = apiResults[i];

      if (!singleResult) {
        resultMap.set(key, { success: false, persons: [], rawResponse: {}, error: 'No result' });
        continue;
      }

      // Re-use single-record parsing logic
      const single = await batchDataSkipTrace(req);
      resultMap.set(key, single);
    }

    return resultMap;
  } catch (err) {
    logger.error({ err }, 'BatchData bulk skip trace request failed');
    const results = new Map<string, BatchDataSkipTraceResult>();
    for (const req of requests) {
      const key = `${req.street}|${req.firstName} ${req.lastName}`;
      results.set(key, {
        success: false,
        persons: [],
        rawResponse: {},
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
    return results;
  }
}
