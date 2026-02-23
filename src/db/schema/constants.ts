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

export const DealStage = {
  NEW_LEAD: 'NEW_LEAD',
  SKIP_TRACED: 'SKIP_TRACED',
  CONTACTED: 'CONTACTED',
  INTERESTED: 'INTERESTED',
  OFFER_MADE: 'OFFER_MADE',
  UNDER_CONTRACT: 'UNDER_CONTRACT',
  TITLE_ESCROW: 'TITLE_ESCROW',
  CLOSED_WON: 'CLOSED_WON',
  CLOSED_LOST: 'CLOSED_LOST',
  DEAD: 'DEAD',
} as const;

export type DealStageValue = (typeof DealStage)[keyof typeof DealStage];

export const TaskStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type TaskStatusValue = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskType = {
  CALLBACK: 'CALLBACK',
  FOLLOW_UP: 'FOLLOW_UP',
  RESEARCH: 'RESEARCH',
  SEND_OFFER: 'SEND_OFFER',
  SITE_VISIT: 'SITE_VISIT',
  GENERAL: 'GENERAL',
} as const;

export type TaskTypeValue = (typeof TaskType)[keyof typeof TaskType];

export const ContactType = {
  OWNER: 'OWNER',
  LANDLORD: 'LANDLORD',
  RELATIVE: 'RELATIVE',
  TENANT: 'TENANT',
  SPOUSE: 'SPOUSE',
  ATTORNEY: 'ATTORNEY',
  OTHER: 'OTHER',
} as const;

export type ContactTypeValue = (typeof ContactType)[keyof typeof ContactType];

export const PhoneStatus = {
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  WRONG_NUMBER: 'WRONG_NUMBER',
  DNC: 'DNC',
  UNKNOWN: 'UNKNOWN',
} as const;

export type PhoneStatusValue = (typeof PhoneStatus)[keyof typeof PhoneStatus];
