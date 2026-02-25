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
    { name: `${request.firstName} ${request.lastName}`, street: request.street },
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
    const results = ((data.results ?? data.data ?? []) as Record<string, unknown>[]);

    if (results.length === 0) {
      return {
        success: false,
        persons: [],
        rawResponse: data,
        error: 'No results returned',
      };
    }

    const persons: BatchDataPerson[] = [];

    for (const result of results) {
      const identity = (result.identity ?? result.person ?? result) as Record<string, unknown>;
      const rawPhones = (
        result.phones ?? result.phone_numbers ?? identity.phones ?? []
      ) as Array<Record<string, unknown>>;
      const rawEmails = (
        result.emails ?? result.email_addresses ?? identity.emails ?? []
      ) as Array<Record<string, unknown>>;

      const phones: BatchDataPhone[] = rawPhones
        .map((p) => {
          const cleaned = cleanPhone(
            (p.phone_number ?? p.phone ?? p.number ?? '') as string,
          );
          if (!cleaned) return null;
          return {
            phone: cleaned,
            phoneType: ((p.phone_type ?? p.type ?? null) as string | null)?.toUpperCase() ?? null,
            isConnected: (p.is_connected ?? p.connected ?? null) as boolean | null,
          };
        })
        .filter((p): p is BatchDataPhone => p !== null);

      const emails: BatchDataEmail[] = rawEmails
        .map((e) => {
          const email = ((e.email_address ?? e.email ?? '') as string)
            .trim()
            .toLowerCase();
          return email && email.includes('@') ? { email } : null;
        })
        .filter((e): e is BatchDataEmail => e !== null);

      const nameData = (identity.name ?? identity) as Record<string, string>;
      persons.push({
        firstName: nameData.first ?? nameData.first_name ?? null,
        lastName: nameData.last ?? nameData.last_name ?? null,
        phones,
        emails,
        relationship: (identity.relationship ?? null) as string | null,
      });

      // Also parse associated people if present
      const associated = (
        result.associated_people ?? result.associates ?? []
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
    const apiResults = (data.results ?? data.data ?? []) as Record<string, unknown>[];
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
