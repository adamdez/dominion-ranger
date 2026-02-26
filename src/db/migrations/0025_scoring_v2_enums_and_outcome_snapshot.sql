-- Migration 0025: Scoring v2 — new event types + outcome_reservoir columns
-- Additive only. No DROP statements. Safe to re-run.

-- New synthetic distress event types for wholesaling signals
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'ABSENTEE_HIGH_EQUITY';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'LONG_OWNERSHIP_HIGH_EQUITY';

-- Outcome reservoir: scoring snapshot for deal feedback loop
ALTER TABLE outcome_reservoir ADD COLUMN IF NOT EXISTS signal_snapshot JSONB;
ALTER TABLE outcome_reservoir ADD COLUMN IF NOT EXISTS buyer_price_cents BIGINT;
