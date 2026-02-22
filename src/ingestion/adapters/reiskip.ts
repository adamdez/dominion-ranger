import type { EnrichmentAdapter } from './interface.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';

/**
 * REISkip enrichment adapter.
 *
 * REISkip provides skip tracing — contact information enrichment:
 * - Phone numbers (mobile, landline)
 * - Email addresses
 * - Mailing addresses
 * - Relative/associate connections
 *
 * This is NOT a distress source. It augments existing property records
 * with contact data needed for outreach after promotion.
 */

interface SkipTraceResult {
  phones?: Array<{ number: string; type: string; status: string }>;
  emails?: Array<{ address: string; type: string }>;
  addresses?: Array<{ full: string; type: string }>;
  [key: string]: unknown;
}

export class REISkipAdapter implements EnrichmentAdapter {
  readonly name = 'reiskip';
  readonly description = 'REISkip — skip tracing, phone/email enrichment';

  private apiKey: string;

  constructor() {
    this.apiKey = env.REISKIP_API_KEY ?? '';
  }

  async enrichProperty(property: {
    ownerFirst?: string | null;
    ownerLast?: string | null;
    streetAddress?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  }): Promise<{
    phone?: string;
    email?: string;
    mailingAddress?: string;
    additionalPhones?: string[];
    additionalEmails?: string[];
  } | null> {
    if (!this.apiKey) {
      logger.warn('REISkip API key not configured, skipping enrichment');
      return null;
    }

    if (!property.ownerFirst && !property.ownerLast && !property.streetAddress) {
      logger.debug('Insufficient data for skip trace');
      return null;
    }

    try {
      // Placeholder for actual REISkip API call.
      // Will be wired when we have live API access.
      //
      // Typical REISkip API call:
      // POST /api/v1/skip-trace
      // Body: { first_name, last_name, address, city, state, zip }
      // Returns: { phones[], emails[], addresses[] }

      logger.info(
        { ownerLast: property.ownerLast, address: property.streetAddress },
        'REISkip enrichment requested (stub)',
      );

      return null;
    } catch (err) {
      logger.error({ err }, 'REISkip enrichment failed');
      return null;
    }
  }

  /**
   * Process a real REISkip response into our normalized format.
   * Called by the actual API integration when wired.
   */
  normalizeResponse(result: SkipTraceResult): {
    phone?: string;
    email?: string;
    mailingAddress?: string;
    additionalPhones?: string[];
    additionalEmails?: string[];
  } {
    // Best phone: prefer mobile, then landline
    const phones = (result.phones ?? []).sort((a, b) => {
      if (a.type === 'mobile' && b.type !== 'mobile') return -1;
      if (a.type !== 'mobile' && b.type === 'mobile') return 1;
      return 0;
    });

    const primaryPhone = phones[0]?.number;
    const additionalPhones = phones.slice(1).map((p) => p.number);

    // Best email: prefer personal, then work
    const emails = result.emails ?? [];
    const primaryEmail = emails[0]?.address;
    const additionalEmails = emails.slice(1).map((e) => e.address);

    // Mailing address
    const mailingAddr = (result.addresses ?? []).find((a) => a.type === 'mailing')?.full;

    return {
      phone: primaryPhone,
      email: primaryEmail,
      mailingAddress: mailingAddr,
      additionalPhones: additionalPhones.length > 0 ? additionalPhones : undefined,
      additionalEmails: additionalEmails.length > 0 ? additionalEmails : undefined,
    };
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    return true;
  }
}
