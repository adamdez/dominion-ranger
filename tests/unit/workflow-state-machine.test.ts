/**
 * Charter Phase 1 — Workflow State Machine Tests
 *
 * Validates:
 *   - Valid state transitions are accepted
 *   - Invalid state transitions are rejected
 *   - Terminal states (CLOSED, DEAD) have no outgoing transitions
 *   - Compliance gating requirement before DIALING
 */
import { describe, it, expect } from 'vitest';

type LeadStatus =
  | 'PROMOTED' | 'ASSIGNED' | 'COMPLIANCE_PENDING' | 'DIAL_READY'
  | 'DIALING' | 'CONTACTED' | 'OFFER_SENT' | 'CONTRACTED'
  | 'CLOSED' | 'DEAD';

const VALID_TRANSITIONS: Record<string, LeadStatus[]> = {
  PROMOTED:            ['ASSIGNED', 'DEAD'],
  ASSIGNED:            ['COMPLIANCE_PENDING', 'DEAD'],
  COMPLIANCE_PENDING:  ['DIAL_READY', 'DEAD'],
  DIAL_READY:          ['DIALING', 'DEAD'],
  DIALING:             ['CONTACTED', 'DIAL_READY', 'DEAD'],
  CONTACTED:           ['OFFER_SENT', 'DEAD'],
  OFFER_SENT:          ['CONTRACTED', 'DEAD'],
  CONTRACTED:          ['CLOSED', 'DEAD'],
  CLOSED:              [],
  DEAD:                [],
};

function isValidTransition(from: LeadStatus, to: LeadStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

describe('Workflow State Machine', () => {
  describe('Valid transitions', () => {
    const validPairs: [LeadStatus, LeadStatus][] = [
      ['PROMOTED', 'ASSIGNED'],
      ['PROMOTED', 'DEAD'],
      ['ASSIGNED', 'COMPLIANCE_PENDING'],
      ['COMPLIANCE_PENDING', 'DIAL_READY'],
      ['DIAL_READY', 'DIALING'],
      ['DIALING', 'CONTACTED'],
      ['DIALING', 'DIAL_READY'],
      ['CONTACTED', 'OFFER_SENT'],
      ['OFFER_SENT', 'CONTRACTED'],
      ['CONTRACTED', 'CLOSED'],
    ];

    for (const [from, to] of validPairs) {
      it(`allows ${from} -> ${to}`, () => {
        expect(isValidTransition(from, to)).toBe(true);
      });
    }
  });

  describe('Invalid transitions', () => {
    const invalidPairs: [LeadStatus, LeadStatus][] = [
      ['PROMOTED', 'DIALING'],
      ['PROMOTED', 'CONTACTED'],
      ['ASSIGNED', 'DIALING'],
      ['DIAL_READY', 'CONTACTED'],
      ['CONTACTED', 'CLOSED'],
      ['CLOSED', 'PROMOTED'],
      ['DEAD', 'PROMOTED'],
      ['DEAD', 'ASSIGNED'],
    ];

    for (const [from, to] of invalidPairs) {
      it(`blocks ${from} -> ${to}`, () => {
        expect(isValidTransition(from, to)).toBe(false);
      });
    }
  });

  describe('Terminal states', () => {
    it('CLOSED has no outgoing transitions', () => {
      const allStatuses: LeadStatus[] = [
        'PROMOTED', 'ASSIGNED', 'COMPLIANCE_PENDING', 'DIAL_READY',
        'DIALING', 'CONTACTED', 'OFFER_SENT', 'CONTRACTED', 'CLOSED', 'DEAD',
      ];
      for (const target of allStatuses) {
        expect(isValidTransition('CLOSED', target)).toBe(false);
      }
    });

    it('DEAD has no outgoing transitions', () => {
      const allStatuses: LeadStatus[] = [
        'PROMOTED', 'ASSIGNED', 'COMPLIANCE_PENDING', 'DIAL_READY',
        'DIALING', 'CONTACTED', 'OFFER_SENT', 'CONTRACTED', 'CLOSED', 'DEAD',
      ];
      for (const target of allStatuses) {
        expect(isValidTransition('DEAD', target)).toBe(false);
      }
    });
  });

  describe('Every non-terminal state can reach DEAD', () => {
    const nonTerminal: LeadStatus[] = [
      'PROMOTED', 'ASSIGNED', 'COMPLIANCE_PENDING', 'DIAL_READY',
      'DIALING', 'CONTACTED', 'OFFER_SENT', 'CONTRACTED',
    ];

    for (const status of nonTerminal) {
      it(`${status} can transition to DEAD`, () => {
        expect(isValidTransition(status, 'DEAD')).toBe(true);
      });
    }
  });

  describe('Forward-only flow', () => {
    it('cannot skip states (PROMOTED directly to DIALING)', () => {
      expect(isValidTransition('PROMOTED', 'DIALING')).toBe(false);
    });

    it('cannot go backwards (CONTACTED to ASSIGNED)', () => {
      expect(isValidTransition('CONTACTED', 'ASSIGNED')).toBe(false);
    });

    it('DIALING can retry back to DIAL_READY', () => {
      expect(isValidTransition('DIALING', 'DIAL_READY')).toBe(true);
    });
  });
});
