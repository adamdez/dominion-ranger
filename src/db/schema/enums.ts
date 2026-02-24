import { pgEnum } from 'drizzle-orm/pg-core';

// ─── Distress Event Types ──────────────────────────
export const eventTypeEnum = pgEnum('event_type', [
  // Confirmed Layer B
  'NOTICE_OF_DEFAULT',
  'LIS_PENDENS',
  'TAX_DELINQUENCY',
  'PROBATE',
  'BANKRUPTCY',
  'HOA_LIEN',
  'CODE_ENFORCEMENT',
  'NOTICE_OF_TRUSTEE_SALE',
  'TAX_LIEN',
  'MECHANIC_LIEN',
  'JUDGMENT_LIEN',

  // Predictive Layer A
  'PREDICTIVE_EQUITY_DECLINE',
  'PREDICTIVE_PAYMENT_STRESS',
  'PREDICTIVE_OWNERSHIP_FATIGUE',
  'PREDICTIVE_VACANCY_SIGNAL',
  'PREDICTIVE_LISTING_WITHDRAWAL',
  'PREDICTIVE_DIVORCE_FILING',
  'PREDICTIVE_CODE_VIOLATION',
  'PREDICTIVE_DEFERRED_MAINTENANCE',
  'PREDICTIVE_ABSENTEE_DISTRESS',
  'PREDICTIVE_MARKET_STRESS',
  'SHERIFF_SALE',
]);

export const eventLayerEnum = pgEnum('event_layer', [
  'predictive',
  'confirmed',
]);

export const freshnessEnum = pgEnum('freshness_category', [
  'same_day',
  '1_3_days',
  '4_7_days',
  'stale',
]);

// ─── Mortgage ──────────────────────────────────────
export const mortgageStatusEnum = pgEnum('mortgage_status', [
  'CURRENT',
  'LATE_30',
  'LATE_60',
  'LATE_90',
  'DEFAULT',
  'FORECLOSURE',
  'FREE_AND_CLEAR',
  'UNKNOWN',
]);

// ─── Promotion ─────────────────────────────────────
export const marketingTierEnum = pgEnum('marketing_tier', [
  'A',
  'B',
  'C',
]);

export const urgencyLevelEnum = pgEnum('urgency_level', [
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
]);

// ─── Outcome (Sentinel) ───────────────────────────
export const outcomeStatusEnum = pgEnum('outcome_status', [
  'PROMOTED',
  'CLAIMED',
  'DIALED',
  'OFFER_SENT',
  'CONTRACTED',
  'CLOSED',
  'DEAD',
  'LISTED',
  'SOLD',
]);

// ─── Workflow ─────────────────────────────────────
export const leadInstanceStatusEnum = pgEnum('lead_instance_status', [
  'PROMOTED',
  'ASSIGNED',
  'COMPLIANCE_PENDING',
  'DIAL_READY',
  'DIALING',
  'CONTACTED',
  'OFFER_SENT',
  'CONTRACTED',
  'CLOSED',
  'DEAD',
]);

// ─── Dispositions ────────────────────────────────
export const dispositionTypeEnum = pgEnum('disposition_type', [
  'NO_ANSWER',
  'LEFT_VOICEMAIL',
  'CALLBACK_REQUESTED',
  'NOT_INTERESTED',
  'WRONG_NUMBER',
  'DO_NOT_CALL',
  'INTERESTED',
  'APPOINTMENT_SET',
  'DISCONNECTED',
]);

// ─── RBAC ──────────────────────────────────────────
export const userRoleEnum = pgEnum('user_role', [
  'ADMIN',
  'FIELD',
  'READONLY',
  'MANAGER',
  'AGENT',
]);
