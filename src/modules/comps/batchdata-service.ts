import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';

/**
 * BatchData API base URL.
 * Verified endpoints from https://developer.batchdata.com:
 *   - Property lookup:  POST /api/v1/property/lookup
 *   - Property search:  POST /api/v1/property/search
 *   - Sale comps:       POST /api/v1/property/sale-comps  (verify against docs)
 *
 * The exact comp endpoint path should be confirmed against BatchData's
 * interactive Stoplight docs before going live.
 */
const BATCHDATA_BASE = 'https://api.batchdata.com/api/v1';

export interface BatchDataCompRequest {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  radius?: number;
  months?: number;
  limit?: number;
}

export interface BatchDataComp {
  address: string;
  city: string;
  state: string;
  zip: string;
  saleDate: string;
  salePriceCents: number;
  beds: number;
  baths: number;
  sqft: number;
  lotSqft: number;
  yearBuilt: number;
  distanceMiles: number;
  pricePerSqftCents: number;
  propertyType: string;
  daysOnMarket: number | null;
}

export interface BatchDataCompResponse {
  comps: BatchDataComp[];
  estimatedValueCents: number | null;
  estimatedValueLowCents: number | null;
  estimatedValueHighCents: number | null;
  confidenceScore: number | null;
  avgPricePerSqftCents: number;
  medianSalePriceCents: number;
  requestId: string;
  rawResponse: unknown;
}

export async function fetchComps(
  request: BatchDataCompRequest,
): Promise<BatchDataCompResponse> {
  const apiKey = env.BATCHDATA_API_KEY;
  if (!apiKey) {
    throw new Error('BATCHDATA_API_KEY not configured');
  }

  const {
    address,
    city,
    state,
    zip,
    radius = 0.5,
    months = 6,
    limit = 10,
  } = request;

  logger.info({ address, city, state, radius, months }, 'Fetching comps from BatchData');

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  // Step 1: Property lookup for AVM / subject data
  const propertyRes = await fetch(`${BATCHDATA_BASE}/property/lookup`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      requests: [{ street: address, city, state, zip }],
    }),
  });

  if (!propertyRes.ok) {
    const errorText = await propertyRes.text();
    logger.error(
      { status: propertyRes.status, error: errorText },
      'BatchData property lookup failed',
    );
    throw new Error(`BatchData property lookup failed: ${propertyRes.status}`);
  }

  const propertyData = await propertyRes.json() as Record<string, unknown>;

  // Step 2: Comparable sales
  const compRes = await fetch(`${BATCHDATA_BASE}/property/sale-comps`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      requests: [{ street: address, city, state, zip }],
      radius,
      sale_date_min: getDateMonthsAgo(months),
      limit,
    }),
  });

  if (!compRes.ok) {
    const errorText = await compRes.text();
    logger.error(
      { status: compRes.status, error: errorText },
      'BatchData comp lookup failed',
    );
    throw new Error(`BatchData comp lookup failed: ${compRes.status}`);
  }

  const compData = await compRes.json() as Record<string, unknown>;
  const requestId = compRes.headers.get('x-request-id') ?? 'unknown';

  // Step 3: Normalize — field names may vary; adjust after verifying docs
  const rawComps = (
    compData.results ?? compData.data ?? compData.comps ?? []
  ) as Record<string, unknown>[];

  const comps: BatchDataComp[] = rawComps.slice(0, limit).map((c) => {
    const addr = c.address as Record<string, string> | undefined;
    const rawPrice =
      (c.sale_price as number) ??
      (c.lastSalePrice as number) ??
      (c.salePrice as number) ??
      0;
    const sqft =
      (c.sqft as number) ?? (c.livingArea as number) ?? (c.building_sqft as number) ?? 0;
    const salePriceCents = Math.round(rawPrice * 100);
    const pricePerSqftCents = sqft > 0 ? Math.round(salePriceCents / sqft) : 0;

    return {
      address: addr?.full ?? (c.address as string) ?? '',
      city: addr?.city ?? (c.city as string) ?? '',
      state: addr?.state ?? (c.state as string) ?? '',
      zip: addr?.zip ?? (c.zip as string) ?? '',
      saleDate:
        (c.sale_date as string) ?? (c.lastSaleDate as string) ?? (c.saleDate as string) ?? '',
      salePriceCents,
      beds: (c.beds as number) ?? (c.bedrooms as number) ?? 0,
      baths: (c.baths as number) ?? (c.bathrooms as number) ?? 0,
      sqft,
      lotSqft: (c.lot_sqft as number) ?? (c.lotSize as number) ?? 0,
      yearBuilt: (c.year_built as number) ?? (c.yearBuilt as number) ?? 0,
      distanceMiles: (c.distance as number) ?? (c.distance_miles as number) ?? 0,
      pricePerSqftCents,
      propertyType: (c.property_type as string) ?? (c.propertyType as string) ?? 'SFR',
      daysOnMarket: (c.dom as number) ?? (c.daysOnMarket as number) ?? null,
    };
  });

  // Aggregates
  const prices = comps.map((c) => c.salePriceCents).filter((p) => p > 0);
  const perSqft = comps.map((c) => c.pricePerSqftCents).filter((p) => p > 0);

  const medianSalePriceCents = prices.length > 0 ? median(prices) : 0;
  const avgPricePerSqftCents =
    perSqft.length > 0
      ? Math.round(perSqft.reduce((a, b) => a + b, 0) / perSqft.length)
      : 0;

  // AVM from property lookup (structure depends on BatchData response)
  const results = (propertyData.results ?? []) as Record<string, unknown>[];
  const firstResult = results[0] ?? {};
  const avm = (firstResult.valuation ?? firstResult.avm ?? {}) as Record<string, number>;

  return {
    comps,
    estimatedValueCents: avm.value ? Math.round(avm.value * 100) : null,
    estimatedValueLowCents: avm.low ? Math.round(avm.low * 100) : null,
    estimatedValueHighCents: avm.high ? Math.round(avm.high * 100) : null,
    confidenceScore: avm.confidence_score ?? avm.confidenceScore ?? null,
    avgPricePerSqftCents,
    medianSalePriceCents,
    requestId,
    rawResponse: { property: propertyData, comps: compData },
  };
}

function getDateMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().split('T')[0];
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
