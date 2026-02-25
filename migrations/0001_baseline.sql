-- ============================================================================
-- Dominion Ranger — Baseline Migration (0001)
-- Generated: 2026-02-25
-- Purpose: Recreate the ENTIRE production schema from scratch for disaster
--          recovery. All statements use IF NOT EXISTS / OR REPLACE so this
--          migration is fully idempotent.
--
-- TABLES: 34 | ENUMS: 17 | TRIGGERS: 6 (append-only invariants)
--
-- WARNING: NEVER use `drizzle-kit push` against production.
-- ============================================================================

BEGIN;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ENUMS                                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$ BEGIN
  CREATE TYPE event_type AS ENUM (
    'NOTICE_OF_DEFAULT', 'LIS_PENDENS', 'TAX_DELINQUENCY', 'PROBATE',
    'BANKRUPTCY', 'HOA_LIEN', 'CODE_ENFORCEMENT', 'NOTICE_OF_TRUSTEE_SALE',
    'TAX_LIEN', 'MECHANIC_LIEN', 'JUDGMENT_LIEN',
    'PREDICTIVE_EQUITY_DECLINE', 'PREDICTIVE_PAYMENT_STRESS',
    'PREDICTIVE_OWNERSHIP_FATIGUE', 'PREDICTIVE_VACANCY_SIGNAL',
    'PREDICTIVE_LISTING_WITHDRAWAL', 'PREDICTIVE_DIVORCE_FILING',
    'PREDICTIVE_CODE_VIOLATION', 'PREDICTIVE_DEFERRED_MAINTENANCE',
    'PREDICTIVE_ABSENTEE_DISTRESS', 'PREDICTIVE_MARKET_STRESS',
    'SHERIFF_SALE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE event_layer AS ENUM ('predictive', 'confirmed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE freshness_category AS ENUM ('same_day', '1_3_days', '4_7_days', 'stale');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mortgage_status AS ENUM (
    'CURRENT', 'LATE_30', 'LATE_60', 'LATE_90',
    'DEFAULT', 'FORECLOSURE', 'FREE_AND_CLEAR', 'UNKNOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE marketing_tier AS ENUM ('A', 'B', 'C');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE urgency_level AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE outcome_status AS ENUM (
    'PROMOTED', 'CLAIMED', 'DIALED', 'OFFER_SENT',
    'CONTRACTED', 'CLOSED', 'DEAD', 'LISTED', 'SOLD'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE lead_instance_status AS ENUM (
    'PROMOTED', 'ASSIGNED', 'COMPLIANCE_PENDING', 'DIAL_READY',
    'DIALING', 'CONTACTED', 'OFFER_SENT', 'CONTRACTED', 'CLOSED', 'DEAD'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE disposition_type AS ENUM (
    'NO_ANSWER', 'LEFT_VOICEMAIL', 'CALLBACK_REQUESTED', 'NOT_INTERESTED',
    'WRONG_NUMBER', 'DO_NOT_CALL', 'INTERESTED', 'APPOINTMENT_SET', 'DISCONNECTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('ADMIN', 'FIELD', 'READONLY', 'MANAGER', 'AGENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE activity_type AS ENUM (
    'CALL_PLACED', 'CALL_CONNECTED', 'TEXT_SENT', 'TEXT_REPLY',
    'EMAIL_SENT', 'EMAIL_REPLY', 'MAIL_SENT', 'MAIL_DELIVERED', 'MAIL_RETURNED',
    'RVM_DROPPED', 'INBOUND_FORM', 'INBOUND_CALL',
    'APPOINTMENT_SET', 'OFFER_SENT', 'CONTRACT_SENT', 'CONTRACT_SIGNED',
    'DEAL_CLOSED', 'STATUS_CHANGED', 'LEAD_ASSIGNED', 'LEAD_PROMOTED',
    'COMPLIANCE_CHECKED', 'DRIP_ENROLLED', 'DRIP_CANCELLED',
    'NOTE_ADDED', 'CALLBACK_SCHEDULED', 'CALLBACK_COMPLETED', 'CALLBACK_MISSED',
    'QR_SCANNED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE activity_channel AS ENUM (
    'OUTBOUND_COLD', 'INBOUND_WEBSITE', 'INBOUND_CALL',
    'DRIP_SMS', 'DRIP_EMAIL', 'DRIP_RVM', 'DIRECT_MAIL',
    'MANUAL_EMAIL', 'MANUAL_SMS', 'GOOGLE_ADS', 'ORGANIC', 'REFERRAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE activity_outcome AS ENUM (
    'NO_ANSWER', 'VOICEMAIL', 'BUSY', 'DISCONNECTED', 'CONNECTED', 'WRONG_NUMBER',
    'WARM', 'FOLLOW_UP', 'OFFER_REQUESTED', 'APPT_SET',
    'NOT_INTERESTED', 'DO_NOT_CALL',
    'CONTRACTED', 'CLOSED', 'FELL_THROUGH', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE channel_type AS ENUM ('INBOUND', 'OUTBOUND', 'PREDICTIVE', 'REFERRAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE task_type AS ENUM (
    'CALLBACK', 'FOLLOW_UP', 'RESEARCH', 'SEND_OFFER', 'SITE_VISIT', 'GENERAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  CORE TABLES (Signal Domain)                                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 1. properties — Permanent property identity (APN + County = unique)
CREATE TABLE IF NOT EXISTS properties (
  dominion_lead_id     UUID PRIMARY KEY NOT NULL,
  property_id          UUID NOT NULL UNIQUE,
  apn                  VARCHAR(64),
  county               VARCHAR(128),
  state                VARCHAR(2),
  standardized_address TEXT,
  street_address       VARCHAR(256),
  city                 VARCHAR(128),
  zip                  VARCHAR(10),
  owner_name           TEXT,
  owner_first          VARCHAR(128),
  owner_last           VARCHAR(128),
  phone                VARCHAR(20),
  phone_type           VARCHAR(16),
  phone_2              VARCHAR(20),
  phone_2_type         VARCHAR(16),
  phone_3              VARCHAR(20),
  phone_3_type         VARCHAR(16),
  email                VARCHAR(256),
  email_2              VARCHAR(256),
  mailing_address      TEXT,
  skip_trace_tier      VARCHAR(16),
  skip_traced_at       TIMESTAMPTZ,
  skip_trace_source    VARCHAR(32),
  skip_trace_raw       JSONB,
  dnc_flag             BOOLEAN DEFAULT FALSE,
  litigant_flag        BOOLEAN DEFAULT FALSE,
  opt_out_flag         BOOLEAN DEFAULT FALSE,
  ownership_duration_months INTEGER,
  absentee_owner       BOOLEAN DEFAULT FALSE,
  equity_estimate      NUMERIC(12, 2),
  mortgage_status      mortgage_status DEFAULT 'UNKNOWN',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_apn_county ON properties (apn, county);
CREATE INDEX IF NOT EXISTS idx_properties_dominion_lead_id ON properties (dominion_lead_id);
CREATE INDEX IF NOT EXISTS idx_properties_state_county ON properties (state, county);
CREATE INDEX IF NOT EXISTS idx_properties_owner_last ON properties (owner_last);
CREATE INDEX IF NOT EXISTS idx_properties_zip ON properties (zip);

-- 2. distress_events — Append-only distress signal store (Charter invariant #1)
CREATE TABLE IF NOT EXISTS distress_events (
  event_id             UUID PRIMARY KEY NOT NULL,
  dominion_lead_id     UUID NOT NULL REFERENCES properties(dominion_lead_id),
  event_type           event_type NOT NULL,
  event_layer          event_layer NOT NULL,
  trigger_event_date   TIMESTAMPTZ,
  filing_date          TIMESTAMPTZ,
  recorded_date        TIMESTAMPTZ,
  source_name          VARCHAR(128) NOT NULL,
  fingerprint          VARCHAR(64) NOT NULL,
  source_url           TEXT,
  source_legitimacy_notes TEXT,
  freshness_category   freshness_category,
  reliability_score    NUMERIC(3, 2) NOT NULL,
  raw_event_payload    JSONB,
  ingested_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_distress_events_dominion_lead_id ON distress_events (dominion_lead_id);
CREATE INDEX IF NOT EXISTS idx_distress_events_type ON distress_events (event_type);
CREATE INDEX IF NOT EXISTS idx_distress_events_layer ON distress_events (event_layer);
CREATE UNIQUE INDEX IF NOT EXISTS uq_distress_events_fingerprint ON distress_events (fingerprint);
CREATE INDEX IF NOT EXISTS idx_distress_events_created_at ON distress_events (created_at);
CREATE INDEX IF NOT EXISTS idx_distress_events_lead_created ON distress_events (dominion_lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_distress_events_type_layer ON distress_events (event_type, event_layer);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  SCORING DOMAIN                                                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 3. scoring_model_configs — Versioned scoring model configuration
CREATE TABLE IF NOT EXISTS scoring_model_configs (
  version              VARCHAR(32) PRIMARY KEY NOT NULL,
  confirmed_weights    JSONB NOT NULL,
  predictive_weights   JSONB NOT NULL,
  decay_config         JSONB NOT NULL,
  promotion_threshold  NUMERIC(7, 4) NOT NULL,
  tier_thresholds      JSONB NOT NULL,
  confidence_config    JSONB NOT NULL,
  equity_multiplier_config JSONB,
  deal_score_weights   JSONB,
  composite_weights    JSONB,
  suppression_config   JSONB,
  active               BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. scoring_records — Append-only scoring history (Charter invariant #2)
CREATE TABLE IF NOT EXISTS scoring_records (
  score_id             UUID PRIMARY KEY NOT NULL,
  dominion_lead_id     UUID NOT NULL REFERENCES properties(dominion_lead_id),
  composite_score      NUMERIC(7, 4) NOT NULL,
  motivation_score     NUMERIC(7, 4),
  deal_score           NUMERIC(7, 4),
  confidence_score     NUMERIC(5, 4) NOT NULL,
  score_model_version  VARCHAR(32) NOT NULL,
  score_inputs_snapshot JSONB NOT NULL,
  signal_contributions JSONB NOT NULL,
  time_decay_factor    NUMERIC(5, 4),
  score_decay_rate     NUMERIC(5, 4),
  days_since_trigger   INTEGER,
  first_detected_at    TIMESTAMPTZ,
  last_scored_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scoring_records_dominion_lead_id ON scoring_records (dominion_lead_id);
CREATE INDEX IF NOT EXISTS idx_scoring_records_lead_created_desc ON scoring_records (dominion_lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_scoring_records_composite ON scoring_records (composite_score);
CREATE INDEX IF NOT EXISTS idx_scoring_records_model_version ON scoring_records (score_model_version);

-- 5. pending_scoring — DB-backed fallback queue when Redis is unavailable
CREATE TABLE IF NOT EXISTS pending_scoring (
  dominion_lead_id     UUID PRIMARY KEY REFERENCES properties(dominion_lead_id) ON DELETE CASCADE,
  reason               VARCHAR(32) NOT NULL DEFAULT 'event_ingested',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. signal_accumulation — Rolling signal counts and trajectory metrics
CREATE TABLE IF NOT EXISTS signal_accumulation (
  dominion_lead_id         UUID PRIMARY KEY REFERENCES properties(dominion_lead_id),
  first_signal_detected_at TIMESTAMPTZ NOT NULL,
  signal_count_7d          INTEGER NOT NULL DEFAULT 0,
  signal_count_30d         INTEGER NOT NULL DEFAULT 0,
  total_signal_count       INTEGER NOT NULL DEFAULT 0,
  signal_acceleration_rate NUMERIC(7, 4) DEFAULT '0',
  signal_density_score     NUMERIC(7, 4) DEFAULT '0',
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_accumulation_density ON signal_accumulation (signal_density_score);
CREATE INDEX IF NOT EXISTS idx_signal_accumulation_total ON signal_accumulation (total_signal_count);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PROMOTION DOMAIN                                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 7. promoted_leads — Deterministic promotion records
CREATE TABLE IF NOT EXISTS promoted_leads (
  promotion_id         UUID PRIMARY KEY NOT NULL,
  dominion_lead_id     UUID NOT NULL REFERENCES properties(dominion_lead_id),
  composite_score      NUMERIC(7, 4) NOT NULL,
  confidence_score     NUMERIC(5, 4) NOT NULL,
  score_model_version  VARCHAR(32) NOT NULL,
  marketing_tier       marketing_tier NOT NULL,
  urgency_level        urgency_level NOT NULL,
  recommended_action   TEXT,
  signal_summary       JSONB,
  promoted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exported_to_sentinel_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_promoted_leads_dominion_lead_id ON promoted_leads (dominion_lead_id);
CREATE INDEX IF NOT EXISTS idx_promoted_leads_promoted_at ON promoted_leads (promoted_at);
CREATE INDEX IF NOT EXISTS idx_promoted_leads_tier ON promoted_leads (marketing_tier);
CREATE INDEX IF NOT EXISTS idx_promoted_leads_urgency ON promoted_leads (urgency_level);

-- 8. outcome_reservoir — Sentinel outcome tracking
CREATE TABLE IF NOT EXISTS outcome_reservoir (
  dominion_lead_id     UUID PRIMARY KEY REFERENCES properties(dominion_lead_id),
  outcome_status       outcome_status NOT NULL DEFAULT 'PROMOTED',
  contacted_at         TIMESTAMPTZ,
  contract_signed_at   TIMESTAMPTZ,
  deal_closed_at       TIMESTAMPTZ,
  assignment_fee       NUMERIC(12, 2),
  days_to_contract     INTEGER,
  lost_reason          TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outcome_reservoir_status ON outcome_reservoir (outcome_status);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  WORKFLOW DOMAIN (CRM)                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 9. lead_instances — Temporal acquisition lifecycle
CREATE TABLE IF NOT EXISTS lead_instances (
  lead_instance_id     UUID PRIMARY KEY NOT NULL,
  dominion_lead_id     UUID NOT NULL REFERENCES properties(dominion_lead_id),
  promotion_id         UUID REFERENCES promoted_leads(promotion_id),
  assigned_to          VARCHAR(128) REFERENCES users(user_id),
  status               lead_instance_status NOT NULL DEFAULT 'PROMOTED',
  version              INTEGER NOT NULL DEFAULT 1,
  compliance_cleared   BOOLEAN NOT NULL DEFAULT FALSE,
  dnc_checked_at       TIMESTAMPTZ,
  litigant_checked_at  TIMESTAMPTZ,
  claimed_at           TIMESTAMPTZ,
  dialed_at            TIMESTAMPTZ,
  contacted_at         TIMESTAMPTZ,
  offer_sent_at        TIMESTAMPTZ,
  contracted_at        TIMESTAMPTZ,
  closed_at            TIMESTAMPTZ,
  notes                TEXT,
  deal_stage           VARCHAR(32) DEFAULT 'NEW_LEAD',
  funnel_stage         TEXT NOT NULL DEFAULT 'prospect',
  declined_count       INTEGER NOT NULL DEFAULT 0,
  declined_at          TIMESTAMPTZ,
  previous_funnel_stage TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_instances_dominion_lead_id ON lead_instances (dominion_lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_instances_assigned_to ON lead_instances (assigned_to);
CREATE INDEX IF NOT EXISTS idx_lead_instances_status ON lead_instances (status);
CREATE INDEX IF NOT EXISTS idx_lead_instances_created_at ON lead_instances (created_at);
CREATE INDEX IF NOT EXISTS idx_lead_instances_deal_stage ON lead_instances (deal_stage);
CREATE INDEX IF NOT EXISTS idx_lead_instances_funnel_stage ON lead_instances (funnel_stage);

-- 10. dispositions — Call attempt outcome log
CREATE TABLE IF NOT EXISTS dispositions (
  id                   UUID PRIMARY KEY NOT NULL,
  lead_instance_id     UUID NOT NULL REFERENCES lead_instances(lead_instance_id),
  disposition          disposition_type NOT NULL,
  notes                TEXT,
  created_by           VARCHAR(128) REFERENCES users(user_id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispositions_lead_instance_id ON dispositions (lead_instance_id);
CREATE INDEX IF NOT EXISTS idx_dispositions_created_at ON dispositions (created_at);

-- 11. tasks — Workflow tasks (callbacks, follow-ups, etc.)
CREATE TABLE IF NOT EXISTS tasks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                VARCHAR(256) NOT NULL,
  description          TEXT,
  task_type            task_type NOT NULL DEFAULT 'GENERAL',
  status               task_status NOT NULL DEFAULT 'PENDING',
  lead_instance_id     UUID,
  dominion_lead_id     UUID,
  assigned_to          VARCHAR(128),
  created_by           VARCHAR(128),
  priority             VARCHAR(10) NOT NULL DEFAULT 'NORMAL',
  source               VARCHAR(64) NOT NULL DEFAULT 'MANUAL',
  cadence_rule         VARCHAR(64),
  attempt_number       INTEGER DEFAULT 1,
  due_at               TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks (lead_instance_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks (due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  AUTH & AUDIT                                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 12. users — System users with RBAC
CREATE TABLE IF NOT EXISTS users (
  user_id              VARCHAR(128) PRIMARY KEY,
  email                VARCHAR(256) NOT NULL UNIQUE,
  password_hash        TEXT,
  name                 VARCHAR(256),
  role                 user_role NOT NULL DEFAULT 'READONLY',
  phone                VARCHAR(20),
  twilio_caller_id     VARCHAR(20),
  avatar_url           TEXT,
  active               BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at        TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- 13. sessions — Refresh-token session store
CREATE TABLE IF NOT EXISTS sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              VARCHAR(128) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  refresh_token        TEXT NOT NULL UNIQUE,
  expires_at           TIMESTAMPTZ NOT NULL,
  ip_address           TEXT,
  user_agent           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON sessions (refresh_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

-- 14. audit_log — System-wide audit trail
CREATE TABLE IF NOT EXISTS audit_log (
  log_id               UUID PRIMARY KEY NOT NULL,
  dominion_lead_id     UUID,
  user_id              VARCHAR(128),
  action_type          VARCHAR(64) NOT NULL,
  metadata             JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_dominion_lead_id ON audit_log (dominion_lead_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_type ON audit_log (action_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log (user_id);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ANALYTICS & ATTRIBUTION                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 15. activity_log — Append-only universal event substrate (Charter invariant #3)
CREATE TABLE IF NOT EXISTS activity_log (
  activity_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dominion_lead_id     UUID NOT NULL REFERENCES properties(dominion_lead_id),
  lead_instance_id     UUID REFERENCES lead_instances(lead_instance_id),
  user_id              VARCHAR(128),
  activity_type        activity_type NOT NULL,
  channel              activity_channel NOT NULL,
  outcome              activity_outcome,
  occurred_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cost_cents           INTEGER,
  revenue_cents        INTEGER,
  meta                 JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_dominion_lead_id ON activity_log (dominion_lead_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_lead_instance_id ON activity_log (lead_instance_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_activity_type ON activity_log (activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_log_channel ON activity_log (channel);
CREATE INDEX IF NOT EXISTS idx_activity_log_occurred_at ON activity_log (occurred_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_lead_type ON activity_log (dominion_lead_id, activity_type);

-- 16. deals — Closed-deal records for attribution and model calibration
CREATE TABLE IF NOT EXISTS deals (
  deal_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_instance_id     UUID NOT NULL REFERENCES lead_instances(lead_instance_id),
  dominion_lead_id     UUID NOT NULL REFERENCES properties(dominion_lead_id),
  agent_user_id        VARCHAR(128),
  property_address     TEXT,
  purchase_price_cents INTEGER,
  assignment_fee_cents INTEGER NOT NULL,
  gross_revenue_cents  INTEGER NOT NULL,
  buyer_purchase_price_cents INTEGER,
  estimated_arv_cents  INTEGER,
  buyer_name           VARCHAR(256),
  buyer_company        VARCHAR(256),
  lead_source          VARCHAR(64),
  lead_source_detail   VARCHAR(256),
  primary_distress_signals JSONB,
  composite_score_at_close DECIMAL(5, 2),
  days_to_close        INTEGER,
  total_touches        INTEGER,
  contract_date        DATE,
  close_date           DATE,
  status               VARCHAR(32) NOT NULL DEFAULT 'CLOSED',
  fell_through_reason  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deals_lead_instance_id ON deals (lead_instance_id);
CREATE INDEX IF NOT EXISTS idx_deals_dominion_lead_id ON deals (dominion_lead_id);
CREATE INDEX IF NOT EXISTS idx_deals_agent_user_id ON deals (agent_user_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals (status);
CREATE INDEX IF NOT EXISTS idx_deals_close_date ON deals (close_date);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  MARKETING & CAMPAIGNS                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 17. marketing_channels
CREATE TABLE IF NOT EXISTS marketing_channels (
  channel_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  channel_type         channel_type NOT NULL,
  active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_channels_channel_type ON marketing_channels (channel_type);
CREATE INDEX IF NOT EXISTS idx_marketing_channels_active ON marketing_channels (active);

-- 18. campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  campaign_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id           UUID NOT NULL REFERENCES marketing_channels(channel_id),
  name                 TEXT NOT NULL,
  start_date           DATE,
  end_date             DATE,
  budget_cents         INTEGER,
  campaign_status      campaign_status NOT NULL DEFAULT 'ACTIVE',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_channel_id ON campaigns (channel_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (campaign_status);

-- 19. campaign_spend_entries
CREATE TABLE IF NOT EXISTS campaign_spend_entries (
  spend_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id          UUID NOT NULL REFERENCES campaigns(campaign_id),
  spend_date           DATE NOT NULL,
  amount_cents         INTEGER NOT NULL,
  description          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_spend_campaign_id ON campaign_spend_entries (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_spend_date ON campaign_spend_entries (spend_date);

-- 20. lead_source_attribution
CREATE TABLE IF NOT EXISTS lead_source_attribution (
  attribution_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_instance_id     UUID NOT NULL REFERENCES lead_instances(lead_instance_id),
  channel_id           UUID REFERENCES marketing_channels(channel_id),
  campaign_id          UUID REFERENCES campaigns(campaign_id),
  attribution_type     VARCHAR(16) NOT NULL DEFAULT 'LAST_TOUCH',
  utm_source           VARCHAR(128),
  utm_medium           VARCHAR(128),
  utm_campaign         VARCHAR(256),
  utm_content          VARCHAR(256),
  utm_term             VARCHAR(256),
  mail_variant_id      UUID,
  tracking_phone       VARCHAR(32),
  captured_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attribution_lead_instance_id ON lead_source_attribution (lead_instance_id);
CREATE INDEX IF NOT EXISTS idx_attribution_channel_id ON lead_source_attribution (channel_id);
CREATE INDEX IF NOT EXISTS idx_attribution_campaign_id ON lead_source_attribution (campaign_id);
CREATE INDEX IF NOT EXISTS idx_attribution_captured_at ON lead_source_attribution (captured_at);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  COMMUNICATION                                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 21. call_logs — Twilio call records
CREATE TABLE IF NOT EXISTS call_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sid             VARCHAR(64) UNIQUE,
  dominion_lead_id     UUID NOT NULL,
  lead_instance_id     UUID,
  user_id              VARCHAR(128) NOT NULL,
  direction            VARCHAR(16) NOT NULL DEFAULT 'OUTBOUND',
  to_phone             VARCHAR(20) NOT NULL,
  from_phone           VARCHAR(20) NOT NULL,
  status               VARCHAR(24) NOT NULL DEFAULT 'initiated',
  duration_seconds     INTEGER,
  recording_url        TEXT,
  recording_sid        VARCHAR(64),
  started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at          TIMESTAMPTZ,
  ended_at             TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON call_logs (dominion_lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_user ON call_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_sid ON call_logs (call_sid);
CREATE INDEX IF NOT EXISTS idx_call_logs_started ON call_logs (started_at);

-- 22. sms_logs — SMS message records
CREATE TABLE IF NOT EXISTS sms_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_sid          VARCHAR(64) UNIQUE,
  dominion_lead_id     UUID,
  lead_instance_id     UUID,
  user_id              VARCHAR(128),
  direction            VARCHAR(16) NOT NULL DEFAULT 'OUTBOUND',
  to_phone             VARCHAR(20) NOT NULL,
  from_phone           VARCHAR(20) NOT NULL,
  body                 TEXT NOT NULL,
  status               VARCHAR(24) DEFAULT 'queued',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_lead ON sms_logs (dominion_lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_sid ON sms_logs (message_sid);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  INBOUND                                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 23. inbound_leads — Website form submissions and inbound inquiries
CREATE TABLE IF NOT EXISTS inbound_leads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dominion_lead_id     UUID,
  lead_instance_id     UUID,
  submitted_name       VARCHAR(256),
  submitted_phone      VARCHAR(32),
  submitted_email      VARCHAR(256),
  submitted_address    TEXT,
  submitted_city       VARCHAR(128),
  submitted_state      VARCHAR(2),
  submitted_zip        VARCHAR(10),
  submitted_message    TEXT,
  source               VARCHAR(64) NOT NULL,
  source_detail        VARCHAR(128),
  utm_source           VARCHAR(128),
  utm_medium           VARCHAR(128),
  utm_campaign         VARCHAR(256),
  utm_content          VARCHAR(256),
  utm_term             VARCHAR(256),
  matched_existing     BOOLEAN DEFAULT FALSE,
  match_confidence     NUMERIC(3, 2),
  auto_reply_sent      BOOLEAN DEFAULT FALSE,
  first_contact_at     TIMESTAMPTZ,
  time_to_contact_seconds INTEGER,
  outcome              VARCHAR(32),
  submitted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbound_leads_dominion_lead_id ON inbound_leads (dominion_lead_id);
CREATE INDEX IF NOT EXISTS idx_inbound_leads_source ON inbound_leads (source);
CREATE INDEX IF NOT EXISTS idx_inbound_leads_submitted_at ON inbound_leads (submitted_at);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  MARKET & ADAPTER MONITORING                                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 24. market_configs — Per-county market configuration
CREATE TABLE IF NOT EXISTS market_configs (
  market_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  county               VARCHAR(128) NOT NULL,
  state                VARCHAR(2) NOT NULL,
  fips_code            VARCHAR(10),
  county_recorder_url  TEXT,
  active               BOOLEAN DEFAULT TRUE,
  adapter_config       JSONB DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS market_configs_county_state_idx ON market_configs (county, state);

-- 25. adapter_run_history — Adapter execution audit trail
CREATE TABLE IF NOT EXISTS adapter_run_history (
  run_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_name         VARCHAR(64) NOT NULL,
  market_id            UUID REFERENCES market_configs(market_id),
  status               VARCHAR(20) NOT NULL DEFAULT 'running',
  records_processed    INTEGER DEFAULT 0,
  events_created       INTEGER DEFAULT 0,
  events_deduplicated  INTEGER DEFAULT 0,
  errors               INTEGER DEFAULT 0,
  error_details        JSONB,
  started_at           TIMESTAMPTZ DEFAULT NOW(),
  completed_at         TIMESTAMPTZ,
  duration_ms          INTEGER
);

CREATE INDEX IF NOT EXISTS idx_adapter_run_adapter ON adapter_run_history (adapter_name);
CREATE INDEX IF NOT EXISTS idx_adapter_run_started ON adapter_run_history (started_at);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PHASE 3: INTELLIGENCE & PIPELINE                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 26. property_contacts — Skip-trace multi-contact records per property
CREATE TABLE IF NOT EXISTS property_contacts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dominion_lead_id     UUID NOT NULL REFERENCES properties(dominion_lead_id) ON DELETE CASCADE,
  contact_name         VARCHAR(256),
  contact_type         VARCHAR(32) NOT NULL DEFAULT 'OWNER',
  phone                VARCHAR(20),
  phone_type           VARCHAR(16),
  phone_status         VARCHAR(16) DEFAULT 'UNKNOWN',
  email                VARCHAR(256),
  dnd_calls            BOOLEAN DEFAULT FALSE,
  dnd_sms              BOOLEAN DEFAULT FALSE,
  dnd_email            BOOLEAN DEFAULT FALSE,
  source               VARCHAR(32),
  is_primary           BOOLEAN DEFAULT FALSE,
  is_owner_match       BOOLEAN DEFAULT FALSE,
  raw_data             JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_contacts_lead ON property_contacts (dominion_lead_id);
CREATE INDEX IF NOT EXISTS idx_property_contacts_phone ON property_contacts (phone);

-- 27. tags — Admin-managed tag definitions
CREATE TABLE IF NOT EXISTS tags (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 VARCHAR(64) NOT NULL,
  color                VARCHAR(7) DEFAULT '#6B7280',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name ON tags (name);

-- 28. lead_instance_tags — Many-to-many junction: tags on lead instances
CREATE TABLE IF NOT EXISTS lead_instance_tags (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_instance_id     UUID NOT NULL,
  tag_id               UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  applied_by           VARCHAR(128),
  applied_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_tags_unique ON lead_instance_tags (lead_instance_id, tag_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_lead ON lead_instance_tags (lead_instance_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_tag ON lead_instance_tags (tag_id);

-- 29. saved_filters — Smart list presets for leads view
CREATE TABLE IF NOT EXISTS saved_filters (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 VARCHAR(128) NOT NULL,
  description          VARCHAR(512),
  filter_config        JSONB NOT NULL,
  is_default           BOOLEAN DEFAULT FALSE,
  created_by           VARCHAR(128),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  COMP ENGINE                                                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 30. comp_reports — Comparable sales analysis reports
CREATE TABLE IF NOT EXISTS comp_reports (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  dominion_lead_id     UUID NOT NULL REFERENCES properties(dominion_lead_id),
  subject_address      TEXT NOT NULL,
  subject_city         TEXT,
  subject_state        TEXT,
  subject_zip          TEXT,
  subject_beds         INTEGER,
  subject_baths        NUMERIC(3, 1),
  subject_sqft         INTEGER,
  subject_lot_sqft     INTEGER,
  subject_year_built   INTEGER,
  subject_property_type TEXT,
  estimated_value_cents BIGINT,
  estimated_value_low_cents BIGINT,
  estimated_value_high_cents BIGINT,
  confidence_score     NUMERIC(5, 2),
  comps                JSONB NOT NULL DEFAULT '[]',
  comp_count           INTEGER NOT NULL DEFAULT 0,
  avg_price_per_sqft_cents BIGINT,
  median_sale_price_cents BIGINT,
  arv_cents            BIGINT,
  max_offer_cents      BIGINT,
  rehab_estimate_cents BIGINT DEFAULT 0,
  assignment_fee_cents BIGINT DEFAULT 500000,
  search_radius_miles  NUMERIC(4, 2) DEFAULT 0.5,
  search_months        INTEGER DEFAULT 6,
  batchdata_request_id TEXT,
  raw_response         JSONB,
  generated_by         TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comp_reports_dominion_lead_id ON comp_reports (dominion_lead_id);
CREATE INDEX IF NOT EXISTS idx_comp_reports_created_at ON comp_reports (created_at);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  OFFERS                                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 31. offers — Purchase offer tracking
CREATE TABLE IF NOT EXISTS offers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dominion_lead_id     UUID NOT NULL REFERENCES properties(dominion_lead_id),
  property_id          UUID NOT NULL,
  lead_instance_id     UUID REFERENCES lead_instances(lead_instance_id),
  created_by           TEXT NOT NULL REFERENCES users(user_id),
  property_address     TEXT NOT NULL,
  property_city        TEXT,
  property_state       TEXT,
  property_zip         TEXT,
  property_county      TEXT,
  owner_name           TEXT,
  offer_amount_cents   BIGINT NOT NULL,
  earnest_money_cents  BIGINT NOT NULL DEFAULT 100000,
  closing_days         INTEGER NOT NULL DEFAULT 21,
  inspection_days      INTEGER NOT NULL DEFAULT 10,
  offer_expiry_days    INTEGER NOT NULL DEFAULT 7,
  contingencies        TEXT[] DEFAULT ARRAY['inspection', 'title', 'financing'],
  additional_terms     TEXT,
  comp_report_id       UUID,
  arv_cents            BIGINT,
  rehab_estimate_cents BIGINT,
  max_offer_cents      BIGINT,
  assignment_fee_cents BIGINT DEFAULT 1000000,
  status               TEXT NOT NULL DEFAULT 'draft',
  counter_amount_cents BIGINT,
  counter_notes        TEXT,
  sent_at              TIMESTAMPTZ,
  responded_at         TIMESTAMPTZ,
  expires_at           TIMESTAMPTZ,
  pdf_url              TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offers_property ON offers (property_id);
CREATE INDEX IF NOT EXISTS idx_offers_dominion_lead ON offers (dominion_lead_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers (status);
CREATE INDEX IF NOT EXISTS idx_offers_created_by ON offers (created_by);
CREATE INDEX IF NOT EXISTS idx_offers_expires ON offers (expires_at);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  CONFIG & OPERATIONAL                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 32. system_settings — Key-value system configuration store
CREATE TABLE IF NOT EXISTS system_settings (
  key                  VARCHAR(128) PRIMARY KEY,
  value                JSONB NOT NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 33. feature_flags — Runtime feature toggles
CREATE TABLE IF NOT EXISTS feature_flags (
  flag_key             VARCHAR(128) PRIMARY KEY,
  enabled              BOOLEAN NOT NULL DEFAULT FALSE,
  description          TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 34. error_log — Application error tracking
CREATE TABLE IF NOT EXISTS error_log (
  error_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type           VARCHAR(64) NOT NULL,
  message              TEXT NOT NULL,
  stack                TEXT,
  context              JSONB DEFAULT '{}',
  resolved             BOOLEAN DEFAULT FALSE,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_log_type ON error_log (error_type);
CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log (created_at);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  APPEND-ONLY TRIGGERS (Charter v2.3 Invariants)                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- distress_events  → invariant #1 (no UPDATE, no DELETE)
-- scoring_records  → invariant #2 (no UPDATE, no DELETE)
-- activity_log     → invariant #3 (no UPDATE, no DELETE)

CREATE OR REPLACE FUNCTION prevent_append_only_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Charter violation: % on append-only table "%" is prohibited',
    TG_OP, TG_TABLE_NAME;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS distress_events_no_update ON distress_events;
CREATE TRIGGER distress_events_no_update
  BEFORE UPDATE ON distress_events
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

DROP TRIGGER IF EXISTS distress_events_no_delete ON distress_events;
CREATE TRIGGER distress_events_no_delete
  BEFORE DELETE ON distress_events
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

DROP TRIGGER IF EXISTS scoring_records_no_update ON scoring_records;
CREATE TRIGGER scoring_records_no_update
  BEFORE UPDATE ON scoring_records
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

DROP TRIGGER IF EXISTS scoring_records_no_delete ON scoring_records;
CREATE TRIGGER scoring_records_no_delete
  BEFORE DELETE ON scoring_records
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

DROP TRIGGER IF EXISTS activity_log_no_update ON activity_log;
CREATE TRIGGER activity_log_no_update
  BEFORE UPDATE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

DROP TRIGGER IF EXISTS activity_log_no_delete ON activity_log;
CREATE TRIGGER activity_log_no_delete
  BEFORE DELETE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

COMMIT;
