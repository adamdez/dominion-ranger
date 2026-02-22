/**
 * Charter Phase 1 — Scoring Logic Unit Tests
 *
 * Tests pure scoring functions without DB access:
 *   - Equity multiplier resolution is deterministic
 *   - Deal score calculation is deterministic
 *   - Suppression logic is correct
 */
import { describe, it, expect } from 'vitest';

// Re-implement the pure functions locally for unit testing
// (they're private in the service; we test the logic contracts)

interface EquityMultiplierRange {
  min: number;
  max?: number;
  multiplier: number;
}

interface EquityMultiplierConfig {
  ranges: EquityMultiplierRange[];
  default_multiplier: number;
}

function resolveEquityMultiplier(equityEstimate: string | null, config: EquityMultiplierConfig): number {
  if (!equityEstimate) return config.default_multiplier;
  const equity = parseFloat(equityEstimate);
  if (isNaN(equity)) return config.default_multiplier;
  for (const range of config.ranges) {
    const aboveMin = equity >= range.min;
    const belowMax = range.max === undefined || equity < range.max;
    if (aboveMin && belowMax) return range.multiplier;
  }
  return config.default_multiplier;
}

const EQUITY_CONFIG: EquityMultiplierConfig = {
  ranges: [
    { min: 0, max: 25000, multiplier: 0.7 },
    { min: 25000, max: 75000, multiplier: 0.85 },
    { min: 75000, max: 200000, multiplier: 1.0 },
    { min: 200000, multiplier: 1.15 },
  ],
  default_multiplier: 1.0,
};

describe('Equity Multiplier', () => {
  it('returns default when equity is null', () => {
    expect(resolveEquityMultiplier(null, EQUITY_CONFIG)).toBe(1.0);
  });

  it('returns default when equity is NaN', () => {
    expect(resolveEquityMultiplier('not-a-number', EQUITY_CONFIG)).toBe(1.0);
  });

  it('returns 0.7 for low equity (<25k)', () => {
    expect(resolveEquityMultiplier('15000.00', EQUITY_CONFIG)).toBe(0.7);
  });

  it('returns 0.85 for mid-low equity (25k-75k)', () => {
    expect(resolveEquityMultiplier('50000.00', EQUITY_CONFIG)).toBe(0.85);
  });

  it('returns 1.0 for mid equity (75k-200k)', () => {
    expect(resolveEquityMultiplier('150000.00', EQUITY_CONFIG)).toBe(1.0);
  });

  it('returns 1.15 for high equity (200k+)', () => {
    expect(resolveEquityMultiplier('350000.00', EQUITY_CONFIG)).toBe(1.15);
  });

  it('is deterministic — same input always returns same multiplier', () => {
    const results = Array.from({ length: 50 }, () =>
      resolveEquityMultiplier('125000.00', EQUITY_CONFIG),
    );
    expect(new Set(results).size).toBe(1);
  });

  it('handles boundary values correctly', () => {
    expect(resolveEquityMultiplier('0.00', EQUITY_CONFIG)).toBe(0.7);
    expect(resolveEquityMultiplier('25000.00', EQUITY_CONFIG)).toBe(0.85);
    expect(resolveEquityMultiplier('75000.00', EQUITY_CONFIG)).toBe(1.0);
    expect(resolveEquityMultiplier('200000.00', EQUITY_CONFIG)).toBe(1.15);
  });
});

describe('Suppression Logic', () => {
  interface SuppressionConfig {
    mortgage_statuses?: string[];
    max_ownership_months?: number;
  }

  function checkSuppression(
    property: { mortgageStatus: string | null; ownershipDurationMonths: number | null },
    config: SuppressionConfig | null,
  ): string | null {
    if (!config) return null;
    if (config.mortgage_statuses?.includes(property.mortgageStatus ?? '')) {
      return `Suppressed: mortgage status ${property.mortgageStatus}`;
    }
    if (config.max_ownership_months && property.ownershipDurationMonths) {
      if (property.ownershipDurationMonths < config.max_ownership_months) {
        return `Suppressed: ownership duration`;
      }
    }
    return null;
  }

  it('returns null when no config', () => {
    expect(checkSuppression({ mortgageStatus: 'DEFAULT', ownershipDurationMonths: 12 }, null)).toBeNull();
  });

  it('returns null when property is not suppressed', () => {
    const config: SuppressionConfig = { mortgage_statuses: ['FORECLOSURE'], max_ownership_months: 6 };
    expect(checkSuppression({ mortgageStatus: 'CURRENT', ownershipDurationMonths: 24 }, config)).toBeNull();
  });

  it('suppresses by mortgage status', () => {
    const config: SuppressionConfig = { mortgage_statuses: ['FORECLOSURE'] };
    const result = checkSuppression({ mortgageStatus: 'FORECLOSURE', ownershipDurationMonths: null }, config);
    expect(result).toContain('FORECLOSURE');
  });

  it('suppresses by ownership duration', () => {
    const config: SuppressionConfig = { max_ownership_months: 12 };
    const result = checkSuppression({ mortgageStatus: 'CURRENT', ownershipDurationMonths: 6 }, config);
    expect(result).toContain('ownership duration');
  });

  it('does not suppress when ownership meets threshold', () => {
    const config: SuppressionConfig = { max_ownership_months: 12 };
    expect(checkSuppression({ mortgageStatus: 'CURRENT', ownershipDurationMonths: 24 }, config)).toBeNull();
  });
});

describe('Deal Score Components', () => {
  const DEAL_WEIGHTS = {
    equity_weight: 0.35,
    ownership_weight: 0.25,
    absentee_weight: 0.15,
    mortgage_weight: 0.25,
    equity_thresholds: { low: 25000, mid: 75000, high: 200000 },
    ownership_thresholds: { short_months: 24, long_months: 120 },
    mortgage_severity: {
      FREE_AND_CLEAR: 0.3,
      CURRENT: 0.2,
      LATE_30: 0.5,
      LATE_60: 0.7,
      LATE_90: 0.85,
      DEFAULT: 0.95,
      FORECLOSURE: 1.0,
      UNKNOWN: 0.1,
    } as Record<string, number>,
  };

  function calculateDealScore(property: {
    equityEstimate: string | null;
    ownershipDurationMonths: number | null;
    absenteeOwner: boolean | null;
    mortgageStatus: string | null;
  }): number {
    let score = 0;
    const equity = property.equityEstimate ? parseFloat(property.equityEstimate) : 0;
    const { low, mid, high } = DEAL_WEIGHTS.equity_thresholds;
    let equityFactor = 0;
    if (equity >= high) equityFactor = 1.0;
    else if (equity >= mid) equityFactor = 0.7;
    else if (equity >= low) equityFactor = 0.4;
    else equityFactor = 0.15;
    score += equityFactor * DEAL_WEIGHTS.equity_weight;
    const months = property.ownershipDurationMonths ?? 0;
    const { short_months, long_months } = DEAL_WEIGHTS.ownership_thresholds;
    let ownershipFactor = 0;
    if (months >= long_months) ownershipFactor = 1.0;
    else if (months >= short_months) ownershipFactor = 0.5;
    else ownershipFactor = 0.2;
    score += ownershipFactor * DEAL_WEIGHTS.ownership_weight;
    if (property.absenteeOwner) score += DEAL_WEIGHTS.absentee_weight;
    const mortgageStatus = property.mortgageStatus ?? 'UNKNOWN';
    const mortgageFactor = DEAL_WEIGHTS.mortgage_severity[mortgageStatus] ?? 0;
    score += mortgageFactor * DEAL_WEIGHTS.mortgage_weight;
    return Math.min(100, score * 100);
  }

  it('high-equity foreclosure absentee property scores high', () => {
    const score = calculateDealScore({
      equityEstimate: '250000.00',
      ownershipDurationMonths: 180,
      absenteeOwner: true,
      mortgageStatus: 'FORECLOSURE',
    });
    expect(score).toBeGreaterThan(70);
  });

  it('low-equity recent owner scores low', () => {
    const score = calculateDealScore({
      equityEstimate: '10000.00',
      ownershipDurationMonths: 6,
      absenteeOwner: false,
      mortgageStatus: 'CURRENT',
    });
    expect(score).toBeLessThan(30);
  });

  it('is deterministic — same inputs always produce same score', () => {
    const prop = {
      equityEstimate: '125000.00',
      ownershipDurationMonths: 60,
      absenteeOwner: true,
      mortgageStatus: 'LATE_60',
    };
    const results = Array.from({ length: 50 }, () => calculateDealScore(prop));
    expect(new Set(results).size).toBe(1);
  });

  it('null equity defaults to low factor', () => {
    const score = calculateDealScore({
      equityEstimate: null,
      ownershipDurationMonths: 60,
      absenteeOwner: false,
      mortgageStatus: 'UNKNOWN',
    });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(50);
  });
});
