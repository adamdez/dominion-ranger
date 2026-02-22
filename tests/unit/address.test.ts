import { describe, it, expect } from 'vitest';
import { standardizeAddress, addressKey } from '../../src/lib/address.js';

describe('standardizeAddress', () => {
  it('uppercases and normalizes whitespace', () => {
    expect(standardizeAddress('  123  main  street  ')).toBe('123 MAIN ST');
  });

  it('replaces common abbreviations', () => {
    expect(standardizeAddress('456 Oak Avenue')).toBe('456 OAK AVE');
    expect(standardizeAddress('789 Pine Boulevard')).toBe('789 PINE BLVD');
    expect(standardizeAddress('101 North Elm Drive')).toBe('101 N ELM DR');
  });

  it('handles apartment/suite notation', () => {
    expect(standardizeAddress('200 Main St Apt 4B')).toBe('200 MAIN ST APT 4B');
    expect(standardizeAddress('200 Main St Suite 100')).toBe('200 MAIN ST STE 100');
  });

  it('removes punctuation', () => {
    expect(standardizeAddress('123 Main St., Apt. #5')).toBe('123 MAIN ST APT UNIT 5');
  });

  it('handles empty string', () => {
    expect(standardizeAddress('')).toBe('');
  });
});

describe('addressKey', () => {
  it('strips all non-alphanumeric chars and lowercases', () => {
    const key = addressKey('123 Main St, Apt 4B');
    expect(key).toBe('123mainstapt4b');
  });

  it('produces same key for equivalent addresses', () => {
    const key1 = addressKey('123 Main Street');
    const key2 = addressKey('123 MAIN ST');
    expect(key1).toBe(key2);
  });
});
