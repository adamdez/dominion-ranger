import { describe, it, expect } from 'vitest';
import { exponentialDecay, daysBetween, classifyFreshness } from '../../src/lib/dates.js';

describe('exponentialDecay', () => {
  it('returns 1.0 for day 0', () => {
    expect(exponentialDecay(0, 60)).toBe(1.0);
  });

  it('returns ~0.5 at half-life', () => {
    const decay = exponentialDecay(60, 60);
    expect(decay).toBeCloseTo(0.5, 1);
  });

  it('returns ~0.25 at 2x half-life', () => {
    const decay = exponentialDecay(120, 60);
    expect(decay).toBeCloseTo(0.25, 1);
  });

  it('never goes below floor', () => {
    const decay = exponentialDecay(1000, 30, 0.05);
    expect(decay).toBe(0.05);
  });

  it('uses custom floor', () => {
    const decay = exponentialDecay(1000, 30, 0.10);
    expect(decay).toBe(0.10);
  });

  it('handles negative days', () => {
    expect(exponentialDecay(-5, 60)).toBe(1.0);
  });

  it('handles zero half-life gracefully', () => {
    expect(exponentialDecay(10, 0)).toBe(0.05);
  });
});

describe('daysBetween', () => {
  it('calculates days correctly', () => {
    const from = new Date('2025-01-01');
    const to = new Date('2025-01-31');
    expect(daysBetween(from, to)).toBe(30);
  });

  it('returns 0 for same day', () => {
    const date = new Date('2025-06-15');
    expect(daysBetween(date, date)).toBe(0);
  });
});

describe('classifyFreshness', () => {
  it('classifies same day', () => {
    expect(classifyFreshness(0)).toBe('same_day');
  });

  it('classifies 1-3 days', () => {
    expect(classifyFreshness(1)).toBe('1_3_days');
    expect(classifyFreshness(3)).toBe('1_3_days');
  });

  it('classifies 4-7 days', () => {
    expect(classifyFreshness(4)).toBe('4_7_days');
    expect(classifyFreshness(7)).toBe('4_7_days');
  });

  it('classifies stale', () => {
    expect(classifyFreshness(8)).toBe('stale');
    expect(classifyFreshness(100)).toBe('stale');
  });
});
