/**
 * Unit tests for Tracerfy /queues/ response normalization.
 *
 * Verifies safe parsing of various response shapes, including malformed ones.
 */
import { describe, it, expect } from 'vitest';
import { normalizeTracerfyQueuesResponse } from '../../src/lib/tracerfy-queues.js';

describe('normalizeTracerfyQueuesResponse', () => {
  it('returns array when response is direct array', () => {
    const raw = [
      { id: 1, pending: true, credits_deducted: 5 },
      { id: 2, pending: false },
    ];
    const result = normalizeTracerfyQueuesResponse(raw);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 1, pending: true, credits_deducted: 5 });
    expect(result[1]).toEqual({ id: 2, pending: false });
  });

  it('returns array when response is { data: [...] }', () => {
    const raw = {
      data: [
        { id: 10, pending: false, rows_uploaded: 100 },
      ],
    };
    const result = normalizeTracerfyQueuesResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 10, pending: false, rows_uploaded: 100 });
  });

  it('filters out array items missing id', () => {
    const raw = [
      { id: 1, pending: true },
      { pending: true },
      { id: 3 },
    ];
    const result = normalizeTracerfyQueuesResponse(raw);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(3);
  });

  it('filters out null/undefined items in array', () => {
    const raw = [
      { id: 1, pending: true },
      null,
      { id: 2 },
      undefined,
    ];
    const result = normalizeTracerfyQueuesResponse(raw);
    expect(result).toHaveLength(2);
  });

  it('throws descriptive error when response is null', () => {
    expect(() => normalizeTracerfyQueuesResponse(null)).toThrow(
      /Tracerfy \/queues\/ returned null or undefined/,
    );
  });

  it('throws descriptive error when response is undefined', () => {
    expect(() => normalizeTracerfyQueuesResponse(undefined)).toThrow(
      /Tracerfy \/queues\/ returned null or undefined/,
    );
  });

  it('throws descriptive error when response is a plain object (not data wrapper)', () => {
    const raw = { foo: 'bar', count: 0 };
    expect(() => normalizeTracerfyQueuesResponse(raw)).toThrow(
      /Tracerfy \/queues\/ returned unexpected shape/,
    );
  });

  it('throws descriptive error when response is a string', () => {
    const raw = 'invalid';
    expect(() => normalizeTracerfyQueuesResponse(raw)).toThrow(
      /Tracerfy \/queues\/ returned unexpected shape/,
    );
  });

  it('throws descriptive error when response is a number', () => {
    expect(() => normalizeTracerfyQueuesResponse(42)).toThrow(
      /Tracerfy \/queues\/ returned unexpected shape/,
    );
  });

  it('throws descriptive error when data is not an array', () => {
    const raw = { data: 'not-an-array' };
    expect(() => normalizeTracerfyQueuesResponse(raw)).toThrow(
      /Tracerfy \/queues\/ returned unexpected shape/,
    );
  });

  it('throws descriptive error when data is null', () => {
    const raw = { data: null };
    expect(() => normalizeTracerfyQueuesResponse(raw)).toThrow(
      /Tracerfy \/queues\/ returned unexpected shape/,
    );
  });

  it('returns empty array when direct array is empty', () => {
    const result = normalizeTracerfyQueuesResponse([]);
    expect(result).toEqual([]);
  });

  it('returns empty array when data array is empty', () => {
    const result = normalizeTracerfyQueuesResponse({ data: [] });
    expect(result).toEqual([]);
  });

  it('result supports .find() without throwing', () => {
    const raw = [{ id: 99, pending: true }];
    const queues = normalizeTracerfyQueuesResponse(raw);
    const found = queues.find((q) => q.id === 99);
    expect(found).toBeDefined();
    expect(found?.id).toBe(99);
  });

  it('result supports .find() returning undefined when not found', () => {
    const raw = [{ id: 1, pending: true }];
    const queues = normalizeTracerfyQueuesResponse(raw);
    const found = queues.find((q) => q.id === 999);
    expect(found).toBeUndefined();
  });
});
