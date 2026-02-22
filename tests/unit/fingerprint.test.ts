import { describe, it, expect } from 'vitest';
import { generateEventFingerprint } from '../../src/lib/fingerprint.js';

describe('generateEventFingerprint', () => {
  const baseInput = {
    dominionLeadId: '01935a7c-1234-7000-8000-000000000001',
    eventType: 'NOTICE_OF_DEFAULT',
    eventLayer: 'confirmed',
    sourceName: 'PropertyRadar',
    triggerEventDate: new Date('2026-01-15T00:00:00Z'),
  };

  it('produces a 64-character hex string', () => {
    const fp = generateEventFingerprint(baseInput);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic — same inputs always produce the same fingerprint', () => {
    const fp1 = generateEventFingerprint(baseInput);
    const fp2 = generateEventFingerprint(baseInput);
    const fp3 = generateEventFingerprint(baseInput);
    expect(fp1).toBe(fp2);
    expect(fp2).toBe(fp3);
  });

  it('changes when dominionLeadId differs', () => {
    const fp1 = generateEventFingerprint(baseInput);
    const fp2 = generateEventFingerprint({ ...baseInput, dominionLeadId: '01935a7c-1234-7000-8000-000000000002' });
    expect(fp1).not.toBe(fp2);
  });

  it('changes when eventType differs', () => {
    const fp1 = generateEventFingerprint(baseInput);
    const fp2 = generateEventFingerprint({ ...baseInput, eventType: 'TAX_DELINQUENCY' });
    expect(fp1).not.toBe(fp2);
  });

  it('changes when eventLayer differs', () => {
    const fp1 = generateEventFingerprint(baseInput);
    const fp2 = generateEventFingerprint({ ...baseInput, eventLayer: 'predictive' });
    expect(fp1).not.toBe(fp2);
  });

  it('changes when sourceName differs', () => {
    const fp1 = generateEventFingerprint(baseInput);
    const fp2 = generateEventFingerprint({ ...baseInput, sourceName: 'ForeclosureRadar' });
    expect(fp1).not.toBe(fp2);
  });

  it('changes when triggerEventDate differs', () => {
    const fp1 = generateEventFingerprint(baseInput);
    const fp2 = generateEventFingerprint({ ...baseInput, triggerEventDate: new Date('2026-02-01T00:00:00Z') });
    expect(fp1).not.toBe(fp2);
  });

  it('uses the same date regardless of time component', () => {
    const fp1 = generateEventFingerprint({
      ...baseInput,
      triggerEventDate: new Date('2026-01-15T08:30:00Z'),
    });
    const fp2 = generateEventFingerprint({
      ...baseInput,
      triggerEventDate: new Date('2026-01-15T23:59:59Z'),
    });
    expect(fp1).toBe(fp2);
  });

  it('falls back to filingDate when triggerEventDate is null', () => {
    const fp1 = generateEventFingerprint({
      ...baseInput,
      triggerEventDate: null,
      filingDate: new Date('2026-01-15T00:00:00Z'),
    });
    const fp2 = generateEventFingerprint({
      ...baseInput,
      triggerEventDate: null,
      filingDate: new Date('2026-01-15T00:00:00Z'),
    });
    expect(fp1).toBe(fp2);
  });

  it('falls back to recordedDate when both trigger and filing are null', () => {
    const fp1 = generateEventFingerprint({
      ...baseInput,
      triggerEventDate: null,
      filingDate: null,
      recordedDate: new Date('2026-01-15T00:00:00Z'),
    });
    const fp2 = generateEventFingerprint({
      ...baseInput,
      triggerEventDate: null,
      filingDate: null,
      recordedDate: new Date('2026-01-15T00:00:00Z'),
    });
    expect(fp1).toBe(fp2);
  });

  it('produces stable output when all dates are null', () => {
    const fp1 = generateEventFingerprint({
      ...baseInput,
      triggerEventDate: null,
      filingDate: null,
      recordedDate: null,
    });
    const fp2 = generateEventFingerprint({
      ...baseInput,
      triggerEventDate: null,
      filingDate: null,
      recordedDate: null,
    });
    expect(fp1).toBe(fp2);
  });
});
