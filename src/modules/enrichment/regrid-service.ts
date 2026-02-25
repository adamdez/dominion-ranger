import { logger } from '../../config/logger.js';

const REGRID_BASE = 'https://app.regrid.com/api/v2';

export interface RegridParcelResult {
  zoning: string | null;
  landUse: string | null;
  legalDescription: string | null;
  acreage: number | null;
  ownerName: string | null;
  ownerAddress: string | null;
  taxStatus: string | null;
  raw: Record<string, unknown>;
}

/**
 * Fetch parcel data from Regrid API.
 * Uses APN+county+state lookup when available, otherwise falls back to address lookup.
 */
export async function fetchRegridParcel(params: {
  apn?: string | null;
  county?: string | null;
  state?: string | null;
  address?: string | null;
}): Promise<RegridParcelResult | null> {
  const apiKey = process.env.REGRID_API_KEY;
  if (!apiKey) {
    logger.debug('REGRID_API_KEY not configured, skipping Regrid parcel lookup');
    return null;
  }

  const { apn, county, state, address } = params;

  try {
    let url: string;
    if (apn && county && state) {
      const path = `${encodeURIComponent(county)},${encodeURIComponent(state)}`;
      url = `${REGRID_BASE}/parcels/apn?parcelnumb=${encodeURIComponent(apn)}&path=${path}&token=${apiKey}`;
    } else if (address) {
      const fullAddress = [address, params.county, params.state].filter(Boolean).join(', ');
      url = `${REGRID_BASE}/parcels/address?query=${encodeURIComponent(fullAddress)}&token=${apiKey}`;
    } else {
      logger.warn('Regrid: insufficient params (need apn+county+state or address)');
      return null;
    }

    logger.info({ apn, county, state, hasAddress: !!address }, 'Fetching Regrid parcel data');

    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      const text = await res.text();
      logger.warn({ status: res.status, body: text.slice(0, 200) }, 'Regrid API error');
      return null;
    }

    const data = (await res.json()) as Record<string, unknown>;

    // Regrid response structure varies; normalize common fields
    const props = (data.properties ?? data) as Record<string, unknown>;
    const zoning = (props.zoning ?? props.zoning_code ?? props.land_use_code) as string | undefined;
    const landUse = (props.land_use ?? props.land_use_code ?? props.landUse) as string | undefined;
    const legalDesc = (props.legal_description ?? props.legal_desc ?? props.legalDescription) as string | undefined;
    const rawAcreage = props.acreage ?? props.acres ?? props.parcel_acres;
    const acreage = rawAcreage != null ? Number(rawAcreage) : null;
    const ownerName = (props.owner_name ?? props.ownerName ?? props.owner) as string | undefined;
    const ownerAddr = (props.owner_address ?? props.ownerAddress ?? props.mail_address) as string | undefined;
    const taxStatus = (props.tax_status ?? props.taxStatus) as string | undefined;

    return {
      zoning: zoning ?? null,
      landUse: landUse ?? null,
      legalDescription: legalDesc ?? null,
      acreage: Number.isFinite(acreage) ? acreage : null,
      ownerName: ownerName ?? null,
      ownerAddress: ownerAddr ?? null,
      taxStatus: taxStatus ?? null,
      raw: data,
    };
  } catch (err) {
    logger.error({ err, params }, 'Regrid parcel lookup failed');
    return null;
  }
}
