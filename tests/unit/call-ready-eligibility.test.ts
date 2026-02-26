/**
 * Unit tests for Call-Ready eligibility rules.
 */
import { describe, it, expect } from 'vitest';
import { evaluateEligibility } from '../../src/modules/call-ready/eligibility.js';

const defaultConfig = {
  scoreThreshold: 40,
  cooldownHours: 24,
  claimOwnedOnly: false,
};

describe('Call-Ready Eligibility', () => {
  it('eligible when all criteria pass (unclaimed pool)', () => {
    const result = evaluateEligibility(
      {
        compositeScore: 55,
        hasCallablePhone: true,
        isDnc: false,
        lastContactAt: null,
        assignedTo: null,
        currentStatus: 'PROMOTED',
        hasLeadInstance: true,
      },
      defaultConfig,
    );
    expect(result.eligible).toBe(true);
    expect(result.reasons.some(r => r.code === 'ELIGIBLE')).toBe(true);
  });

  it('ineligible when no lead instance', () => {
    const result = evaluateEligibility(
      {
        compositeScore: 55,
        hasCallablePhone: true,
        isDnc: false,
        lastContactAt: null,
        assignedTo: null,
        currentStatus: '',
        hasLeadInstance: false,
      },
      defaultConfig,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons.some(r => r.code === 'NO_LEAD_INSTANCE')).toBe(true);
  });

  it('ineligible when already DIAL_READY', () => {
    const result = evaluateEligibility(
      {
        compositeScore: 55,
        hasCallablePhone: true,
        isDnc: false,
        lastContactAt: null,
        assignedTo: null,
        currentStatus: 'DIAL_READY',
        hasLeadInstance: true,
      },
      defaultConfig,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons.some(r => r.code === 'ALREADY_DIAL_READY')).toBe(true);
  });

  it('ineligible when score below threshold', () => {
    const result = evaluateEligibility(
      {
        compositeScore: 35,
        hasCallablePhone: true,
        isDnc: false,
        lastContactAt: null,
        assignedTo: null,
        currentStatus: 'PROMOTED',
        hasLeadInstance: true,
      },
      defaultConfig,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons.some(r => r.code === 'SCORE_BELOW_THRESHOLD')).toBe(true);
    const reason = result.reasons.find(r => r.code === 'SCORE_BELOW_THRESHOLD');
    expect(reason && 'score' in reason && reason.score).toBe(35);
    expect(reason && 'threshold' in reason && reason.threshold).toBe(40);
  });

  it('ineligible when no callable phone', () => {
    const result = evaluateEligibility(
      {
        compositeScore: 55,
        hasCallablePhone: false,
        isDnc: false,
        lastContactAt: null,
        assignedTo: null,
        currentStatus: 'PROMOTED',
        hasLeadInstance: true,
      },
      defaultConfig,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons.some(r => r.code === 'NO_CALLABLE_PHONE')).toBe(true);
  });

  it('ineligible when DNC', () => {
    const result = evaluateEligibility(
      {
        compositeScore: 55,
        hasCallablePhone: true,
        isDnc: true,
        dncSource: 'property_flag',
        lastContactAt: null,
        assignedTo: null,
        currentStatus: 'PROMOTED',
        hasLeadInstance: true,
      },
      defaultConfig,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons.some(r => r.code === 'DNC')).toBe(true);
  });

  it('ineligible when contacted recently (within cooldown)', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const result = evaluateEligibility(
      {
        compositeScore: 55,
        hasCallablePhone: true,
        isDnc: false,
        lastContactAt: twoHoursAgo,
        assignedTo: null,
        currentStatus: 'PROMOTED',
        hasLeadInstance: true,
      },
      { ...defaultConfig, cooldownHours: 24 },
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons.some(r => r.code === 'CONTACTED_RECENTLY')).toBe(true);
  });

  it('eligible when contacted outside cooldown', () => {
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const result = evaluateEligibility(
      {
        compositeScore: 55,
        hasCallablePhone: true,
        isDnc: false,
        lastContactAt: thirtyHoursAgo,
        assignedTo: null,
        currentStatus: 'PROMOTED',
        hasLeadInstance: true,
      },
      { ...defaultConfig, cooldownHours: 24 },
    );
    expect(result.eligible).toBe(true);
  });

  it('ineligible when already claimed (claimOwnedOnly=false)', () => {
    const result = evaluateEligibility(
      {
        compositeScore: 55,
        hasCallablePhone: true,
        isDnc: false,
        lastContactAt: null,
        assignedTo: 'agent-1',
        currentStatus: 'ASSIGNED',
        hasLeadInstance: true,
      },
      defaultConfig,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons.some(r => r.code === 'ALREADY_CLAIMED')).toBe(true);
  });

  it('ineligible when unclaimed (claimOwnedOnly=true)', () => {
    const result = evaluateEligibility(
      {
        compositeScore: 55,
        hasCallablePhone: true,
        isDnc: false,
        lastContactAt: null,
        assignedTo: null,
        currentStatus: 'PROMOTED',
        hasLeadInstance: true,
      },
      { ...defaultConfig, claimOwnedOnly: true },
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons.some(r => r.code === 'MUST_BE_CLAIMED')).toBe(true);
  });

  it('eligible when claimed (claimOwnedOnly=true)', () => {
    const result = evaluateEligibility(
      {
        compositeScore: 55,
        hasCallablePhone: true,
        isDnc: false,
        lastContactAt: null,
        assignedTo: 'agent-1',
        currentStatus: 'ASSIGNED',
        hasLeadInstance: true,
      },
      { ...defaultConfig, claimOwnedOnly: true },
    );
    expect(result.eligible).toBe(true);
  });

  it('score at exact threshold is eligible', () => {
    const result = evaluateEligibility(
      {
        compositeScore: 40,
        hasCallablePhone: true,
        isDnc: false,
        lastContactAt: null,
        assignedTo: null,
        currentStatus: 'PROMOTED',
        hasLeadInstance: true,
      },
      defaultConfig,
    );
    expect(result.eligible).toBe(true);
  });
});
