import { describe, it, expect } from 'vitest';
import { generateId, isValidUuid } from '../../src/lib/ids.js';

describe('generateId', () => {
  it('generates valid UUID format', () => {
    const id = generateId();
    expect(isValidUuid(id)).toBe(true);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('generates time-sortable IDs (UUID v7)', () => {
    const id1 = generateId();
    const id2 = generateId();
    // UUID v7 is time-sortable: id2 should sort after id1
    expect(id2 > id1).toBe(true);
  });
});

describe('isValidUuid', () => {
  it('validates correct UUIDs', () => {
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects invalid strings', () => {
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('')).toBe(false);
    expect(isValidUuid('550e8400-e29b-41d4-a716')).toBe(false);
  });
});
