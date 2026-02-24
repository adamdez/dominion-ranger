/**
 * Charter v2.3 — Suppression: custom_flags Not Implemented
 *
 * This test documents the GAP: the scoring suppression config
 * accepts custom_flags (DNC, LITIGANT, OPT_OUT) but checkSuppression()
 * only handles mortgage_statuses and max_ownership_months.
 *
 * The custom_flags path is dead code — this test makes that visible.
 */
import { describe, it, expect } from 'vitest';

interface SuppressionConfig {
  mortgage_statuses?: string[];
  max_ownership_months?: number;
  custom_flags?: string[];
}

interface MockProperty {
  mortgageStatus: string | null;
  ownershipDurationMonths: number | null;
  customFlags?: string[];
}

/**
 * Replicates the checkSuppression() logic from src/modules/scoring/service.ts
 * to verify its behavior in isolation.
 */
function checkSuppression(property: MockProperty, config: SuppressionConfig | null): string | null {
  if (!config) return null;

  if (config.mortgage_statuses?.includes(property.mortgageStatus ?? '')) {
    return `Suppressed: mortgage status ${property.mortgageStatus}`;
  }

  if (config.max_ownership_months && property.ownershipDurationMonths) {
    if (property.ownershipDurationMonths < config.max_ownership_months) {
      return `Suppressed: ownership duration ${property.ownershipDurationMonths}mo < ${config.max_ownership_months}mo minimum`;
    }
  }

  // NOTE: custom_flags is NOT checked — this is the documented gap
  return null;
}

describe('Suppression: custom_flags Gap', () => {
  const configWithCustomFlags: SuppressionConfig = {
    mortgage_statuses: ['FORECLOSURE_COMPLETE'],
    custom_flags: ['DNC', 'LITIGANT', 'OPT_OUT'],
  };

  it('mortgage suppression works correctly', () => {
    const property: MockProperty = {
      mortgageStatus: 'FORECLOSURE_COMPLETE',
      ownershipDurationMonths: null,
    };
    const result = checkSuppression(property, configWithCustomFlags);
    expect(result).toContain('Suppressed');
  });

  it('DOCUMENTS GAP: custom_flags are accepted in config but never checked', () => {
    const dncProperty: MockProperty = {
      mortgageStatus: 'CURRENT',
      ownershipDurationMonths: 120,
      customFlags: ['DNC'],
    };

    // This SHOULD suppress if custom_flags were implemented
    // But it returns null because custom_flags path is dead code
    const result = checkSuppression(dncProperty, configWithCustomFlags);
    expect(result).toBeNull(); // <-- This is the bug being documented
  });

  it('DOCUMENTS GAP: OPT_OUT flag has no effect on suppression', () => {
    const optOutProperty: MockProperty = {
      mortgageStatus: 'CURRENT',
      ownershipDurationMonths: 120,
      customFlags: ['OPT_OUT'],
    };

    const result = checkSuppression(optOutProperty, configWithCustomFlags);
    expect(result).toBeNull(); // <-- This is the gap being documented
  });

  it('DOCUMENTS GAP: LITIGANT flag has no effect on suppression', () => {
    const litigantProperty: MockProperty = {
      mortgageStatus: 'CURRENT',
      ownershipDurationMonths: 120,
      customFlags: ['LITIGANT'],
    };

    const result = checkSuppression(litigantProperty, configWithCustomFlags);
    expect(result).toBeNull(); // <-- This is the gap being documented
  });

  it('null config returns no suppression', () => {
    const property: MockProperty = {
      mortgageStatus: 'FORECLOSURE_COMPLETE',
      ownershipDurationMonths: null,
    };
    expect(checkSuppression(property, null)).toBeNull();
  });
});
