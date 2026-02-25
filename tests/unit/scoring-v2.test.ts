import { describe, it, expect } from 'vitest';
import {
  getEventSeverityMultiplier,
  getRecencyBoost,
  getVelocityBonus,
} from '../../src/modules/scoring/service.js';

// ─── Tax Delinquency Severity Multiplier ──────────

describe('getEventSeverityMultiplier', () => {
  it('returns 1.0 for non-TAX_DELINQUENCY events', () => {
    expect(getEventSeverityMultiplier('NOTICE_OF_DEFAULT', null)).toBe(1.0);
    expect(getEventSeverityMultiplier('PROBATE', { amount: 50000 })).toBe(1.0);
    expect(getEventSeverityMultiplier('BANKRUPTCY', {})).toBe(1.0);
  });

  it('returns 0.3x for small amounts ($385)', () => {
    expect(getEventSeverityMultiplier('TAX_DELINQUENCY', { taxDelinquentAmount: 385 })).toBe(0.3);
  });

  it('returns 0.6x for medium-small amounts ($1200)', () => {
    expect(getEventSeverityMultiplier('TAX_DELINQUENCY', { taxDelinquentAmount: 1200 })).toBe(0.6);
  });

  it('returns 1.0x for medium amounts ($3500)', () => {
    expect(getEventSeverityMultiplier('TAX_DELINQUENCY', { taxDelinquentAmount: 3500 })).toBe(1.0);
  });

  it('returns 1.3x for large amounts ($12,000)', () => {
    expect(getEventSeverityMultiplier('TAX_DELINQUENCY', { taxDelinquentAmount: 12000 })).toBe(1.3);
  });

  it('returns 1.6x for very large amounts ($20,000+)', () => {
    expect(getEventSeverityMultiplier('TAX_DELINQUENCY', { taxDelinquentAmount: 25000 })).toBe(1.6);
  });

  it('returns 0.5 for TAX_DELINQUENCY with null payload', () => {
    expect(getEventSeverityMultiplier('TAX_DELINQUENCY', null)).toBe(0.5);
  });

  it('returns 0.5 for TAX_DELINQUENCY with missing amount', () => {
    expect(getEventSeverityMultiplier('TAX_DELINQUENCY', {})).toBe(0.5);
  });

  it('handles string payload (JSON)', () => {
    const payload = JSON.stringify({ taxDelinquentAmount: 8000 });
    expect(getEventSeverityMultiplier('TAX_DELINQUENCY', payload)).toBe(1.3);
  });

  it('handles string amount values', () => {
    expect(getEventSeverityMultiplier('TAX_DELINQUENCY', { taxDelinquentAmount: '6000' })).toBe(1.3);
  });

  it('boundary: $500 exactly = 0.6x', () => {
    expect(getEventSeverityMultiplier('TAX_DELINQUENCY', { taxDelinquentAmount: 500 })).toBe(0.6);
  });

  it('boundary: $499 = 0.3x', () => {
    expect(getEventSeverityMultiplier('TAX_DELINQUENCY', { taxDelinquentAmount: 499 })).toBe(0.3);
  });
});

// ─── Recency Boost ────────────────────────────────

describe('getRecencyBoost', () => {
  it('returns 1.5x for signal from 15 days ago', () => {
    expect(getRecencyBoost(15)).toBe(1.5);
  });

  it('returns 1.5x for signal from yesterday', () => {
    expect(getRecencyBoost(1)).toBe(1.5);
  });

  it('returns 1.3x for signal from 60 days ago', () => {
    expect(getRecencyBoost(60)).toBe(1.3);
  });

  it('returns 1.15x for signal from 120 days ago', () => {
    expect(getRecencyBoost(120)).toBe(1.15);
  });

  it('returns 1.0x for signal from 300 days ago', () => {
    expect(getRecencyBoost(300)).toBe(1.0);
  });

  it('returns 0.8x for signal from 500 days ago', () => {
    expect(getRecencyBoost(500)).toBe(0.8);
  });

  it('returns 0.6x for signal from 3 years ago', () => {
    expect(getRecencyBoost(1100)).toBe(0.6);
  });

  it('returns 0.6x for signal from 20 years ago', () => {
    expect(getRecencyBoost(7300)).toBe(0.6);
  });

  it('boundary: 30 days = 1.3x (not 1.5x)', () => {
    expect(getRecencyBoost(30)).toBe(1.3);
  });

  it('boundary: 90 days = 1.15x (not 1.3x)', () => {
    expect(getRecencyBoost(90)).toBe(1.15);
  });
});

// ─── Velocity Bonus ───────────────────────────────

describe('getVelocityBonus', () => {
  it('returns 1.0 for a single event', () => {
    const events = [
      { triggerEventDate: new Date('2025-01-15'), createdAt: new Date('2025-01-15') },
    ];
    expect(getVelocityBonus(events)).toBe(1.0);
  });

  it('returns 1.0 for no events', () => {
    expect(getVelocityBonus([])).toBe(1.0);
  });

  it('returns 1.2 for two events 30 days apart', () => {
    const events = [
      { triggerEventDate: new Date('2025-06-15'), createdAt: new Date('2025-06-15') },
      { triggerEventDate: new Date('2025-05-16'), createdAt: new Date('2025-05-16') },
    ];
    expect(getVelocityBonus(events)).toBe(1.2);
  });

  it('returns 1.1 for two events 120 days apart', () => {
    const events = [
      { triggerEventDate: new Date('2025-06-15'), createdAt: new Date('2025-06-15') },
      { triggerEventDate: new Date('2025-02-15'), createdAt: new Date('2025-02-15') },
    ];
    expect(getVelocityBonus(events)).toBe(1.1);
  });

  it('returns 1.0 for two events 2 years apart', () => {
    const events = [
      { triggerEventDate: new Date('2025-06-15'), createdAt: new Date('2025-06-15') },
      { triggerEventDate: new Date('2023-06-15'), createdAt: new Date('2023-06-15') },
    ];
    expect(getVelocityBonus(events)).toBe(1.0);
  });

  it('uses the two most recent events even with many events', () => {
    const events = [
      { triggerEventDate: new Date('2025-06-15'), createdAt: new Date('2025-06-15') },
      { triggerEventDate: new Date('2025-06-01'), createdAt: new Date('2025-06-01') },
      { triggerEventDate: new Date('2020-01-01'), createdAt: new Date('2020-01-01') },
      { triggerEventDate: new Date('2018-01-01'), createdAt: new Date('2018-01-01') },
    ];
    expect(getVelocityBonus(events)).toBe(1.2);
  });

  it('falls back to createdAt if triggerEventDate is null', () => {
    const events = [
      { triggerEventDate: null, createdAt: new Date('2025-06-15') },
      { triggerEventDate: null, createdAt: new Date('2025-05-20') },
    ];
    expect(getVelocityBonus(events)).toBe(1.2);
  });
});

// ─── Combined Score Impact ────────────────────────

describe('Combined score impact examples', () => {
  it('$385 tax delinquency from 2006 contributes almost nothing', () => {
    const baseWeight = 0.35;
    const decayFloor = 0.02;
    const amountSeverity = getEventSeverityMultiplier('TAX_DELINQUENCY', { taxDelinquentAmount: 385 });
    const recency = getRecencyBoost(7300);

    const contribution = baseWeight * decayFloor * amountSeverity * recency;
    expect(contribution).toBeLessThan(0.005);
  });

  it('$12,000 tax delinquency from last month scores meaningfully', () => {
    const baseWeight = 0.35;
    const decay = 0.87; // ~30 days with half_life=150
    const amountSeverity = getEventSeverityMultiplier('TAX_DELINQUENCY', { taxDelinquentAmount: 12000 });
    const recency = getRecencyBoost(30);

    const contribution = baseWeight * decay * amountSeverity * recency;
    expect(contribution).toBeGreaterThan(0.3);
  });

  it('NOTICE_OF_DEFAULT from 2 weeks ago scores very high', () => {
    const baseWeight = 0.95;
    const decay = 0.92; // ~14 days with half_life=120
    const amountSeverity = 1.0; // not TAX_DELINQUENCY
    const recency = getRecencyBoost(14);

    const contribution = baseWeight * decay * amountSeverity * recency;
    expect(contribution).toBeGreaterThan(1.0);
  });
});
