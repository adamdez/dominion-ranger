/**
 * Typed constant objects derived from database enum definitions.
 *
 * Use these instead of raw strings throughout the codebase so that
 * TypeScript catches stale references when enums change.
 */

export const LeadStatus = {
  PROMOTED: 'PROMOTED',
  ASSIGNED: 'ASSIGNED',
  COMPLIANCE_PENDING: 'COMPLIANCE_PENDING',
  DIAL_READY: 'DIAL_READY',
  DIALING: 'DIALING',
  CONTACTED: 'CONTACTED',
  OFFER_SENT: 'OFFER_SENT',
  CONTRACTED: 'CONTRACTED',
  CLOSED: 'CLOSED',
  DEAD: 'DEAD',
} as const;

export type LeadStatusValue = (typeof LeadStatus)[keyof typeof LeadStatus];

export const EventLayer = {
  CONFIRMED: 'confirmed',
  PREDICTIVE: 'predictive',
} as const;

export type EventLayerValue = (typeof EventLayer)[keyof typeof EventLayer];

export const MarketingTier = {
  A: 'A',
  B: 'B',
  C: 'C',
} as const;

export type MarketingTierValue = (typeof MarketingTier)[keyof typeof MarketingTier];

export const UrgencyLevel = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;

export type UrgencyLevelValue = (typeof UrgencyLevel)[keyof typeof UrgencyLevel];

export const MortgageStatus = {
  CURRENT: 'CURRENT',
  LATE_30: 'LATE_30',
  LATE_60: 'LATE_60',
  LATE_90: 'LATE_90',
  DEFAULT: 'DEFAULT',
  FORECLOSURE: 'FORECLOSURE',
  FREE_AND_CLEAR: 'FREE_AND_CLEAR',
  UNKNOWN: 'UNKNOWN',
} as const;

export type MortgageStatusValue = (typeof MortgageStatus)[keyof typeof MortgageStatus];

export const OutcomeStatus = {
  PROMOTED: 'PROMOTED',
  CLAIMED: 'CLAIMED',
  DIALED: 'DIALED',
  OFFER_SENT: 'OFFER_SENT',
  CONTRACTED: 'CONTRACTED',
  CLOSED: 'CLOSED',
  DEAD: 'DEAD',
  LISTED: 'LISTED',
  SOLD: 'SOLD',
} as const;

export type OutcomeStatusValue = (typeof OutcomeStatus)[keyof typeof OutcomeStatus];

export const UserRole = {
  ADMIN: 'ADMIN',
  FIELD: 'FIELD',
  READONLY: 'READONLY',
} as const;

export type UserRoleValue = (typeof UserRole)[keyof typeof UserRole];
