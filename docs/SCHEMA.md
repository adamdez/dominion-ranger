# Dominion Ranger — Database Schema Reference

All tables use PostgreSQL. Primary keys are UUID v7 (time-sortable) unless otherwise noted.

---

## properties

Permanent identity table for real estate parcels. Keyed on APN + County composite unique index.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| dominion_lead_id | uuid | PK | Immutable UUID v7, generated at first sighting |
| property_id | uuid | NOT NULL, UNIQUE | Internal reference UUID |
| apn | varchar(64) | yes | Assessor Parcel Number (county-scoped) |
| county | varchar(128) | yes | County name |
| state | varchar(2) | yes | Two-letter state code |
| standardized_address | text | yes | Normalized address for matching |
| street_address | varchar(256) | yes | Raw street address |
| city | varchar(128) | yes | City |
| zip | varchar(10) | yes | ZIP code |
| owner_name | text | yes | Full owner name (raw) |
| owner_first | varchar(128) | yes | Parsed first name |
| owner_last | varchar(128) | yes | Parsed last name |
| phone | varchar(20) | yes | Primary phone (enriched via REISkip) |
| email | varchar(256) | yes | Primary email (enriched) |
| mailing_address | text | yes | Owner mailing address |
| ownership_duration_months | integer | yes | Months of ownership |
| absentee_owner | boolean | default false | Absentee owner flag |
| equity_estimate | numeric(12,2) | yes | Estimated equity in dollars |
| mortgage_status | enum | default UNKNOWN | FREE_AND_CLEAR, CURRENT, LATE_30, LATE_60, LATE_90, DEFAULT, FORECLOSURE, UNKNOWN |
| created_at | timestamptz | NOT NULL | First ingested |
| updated_at | timestamptz | NOT NULL | Last enrichment |

**Indexes:** apn+county (unique), dominion_lead_id, state+county, owner_last, zip

**Relationships:** Referenced by distress_events, scoring_records, promoted_leads, lead_instances, signal_accumulation, outcome_reservoir

---

## distress_events (APPEND-ONLY)

Immutable event log of distress signals. Protected by database triggers that prevent UPDATE and DELETE.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| event_id | uuid | PK | Event UUID v7 |
| dominion_lead_id | uuid | NOT NULL, FK | References properties |
| event_type | enum | NOT NULL | NOTICE_OF_DEFAULT, TAX_DELINQUENCY, BANKRUPTCY, etc. |
| event_layer | enum | NOT NULL | confirmed or predictive |
| trigger_event_date | timestamptz | yes | When the distress event occurred |
| filing_date | timestamptz | yes | Legal filing date |
| recorded_date | timestamptz | yes | County recording date |
| source_name | varchar(128) | NOT NULL | Data source identifier |
| fingerprint | varchar(64) | NOT NULL, UNIQUE | SHA-256 dedup hash |
| source_url | text | yes | Link to source record |
| source_legitimacy_notes | text | yes | Notes on source reliability |
| freshness_category | enum | yes | same_day, within_week, within_month, stale |
| reliability_score | numeric(3,2) | NOT NULL | 0.00-1.00 reliability rating |
| raw_event_payload | jsonb | yes | Full raw data preserved for audit |
| ingested_at | timestamptz | NOT NULL | When pipeline ingested this |
| created_at | timestamptz | NOT NULL | Row creation time |

**Indexes:** dominion_lead_id, event_type, event_layer, fingerprint (unique), created_at, dominion_lead_id+created_at, event_type+event_layer

**Triggers:** `distress_events_no_update`, `distress_events_no_delete` — raise Charter violation exception

---

## scoring_records (APPEND-ONLY)

Versioned scoring history. Each re-score appends a new row; old rows are never modified.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| score_id | uuid | PK | Score record UUID v7 |
| dominion_lead_id | uuid | NOT NULL, FK | References properties |
| composite_score | numeric(7,4) | NOT NULL | Weighted combination of motivation + deal |
| motivation_score | numeric(7,4) | yes | Distress signal intensity score |
| deal_score | numeric(7,4) | yes | Property economics score |
| confidence_score | numeric(5,4) | NOT NULL | Signal confidence rating |
| score_model_version | varchar(32) | NOT NULL | Config version that produced this score |
| score_inputs_snapshot | jsonb | NOT NULL | Full input snapshot for replay |
| signal_contributions | jsonb | NOT NULL | Per-signal weight breakdown |
| time_decay_factor | numeric(5,4) | yes | Average time decay across signals |
| score_decay_rate | numeric(5,4) | yes | Rate of score decay |
| days_since_trigger | integer | yes | Days since earliest trigger event |
| first_detected_at | timestamptz | yes | Earliest signal date |
| last_scored_at | timestamptz | NOT NULL | When this score was computed |
| created_at | timestamptz | NOT NULL | Row creation time |

**Indexes:** dominion_lead_id, dominion_lead_id+created_at, composite_score, score_model_version

**Triggers:** `scoring_records_no_update`, `scoring_records_no_delete` — raise Charter violation exception

---

## scoring_model_configs

Configuration table for the scoring engine. Only one version may be active at a time.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| version | varchar(32) | PK | Model version identifier (e.g., "v1.0") |
| confirmed_weights | jsonb | NOT NULL | Weight map for confirmed-layer events |
| predictive_weights | jsonb | NOT NULL | Weight map for predictive-layer events |
| decay_config | jsonb | NOT NULL | Time decay function and floor |
| promotion_threshold | numeric(7,4) | NOT NULL | Minimum composite score for promotion |
| tier_thresholds | jsonb | NOT NULL | A/B/C tier cutoff scores |
| confidence_config | jsonb | NOT NULL | Confidence model parameters |
| equity_multiplier_config | jsonb | yes | Equity-based score multiplier ranges |
| deal_score_weights | jsonb | yes | Deal score component weights |
| composite_weights | jsonb | yes | Motivation vs deal weight ratio |
| suppression_config | jsonb | yes | Negative-stack suppression rules |
| active | boolean | NOT NULL, default false | Whether this version is active |
| created_at | timestamptz | NOT NULL | Row creation time |

---

## promoted_leads

Records of properties that crossed the promotion threshold.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| promotion_id | uuid | PK | Promotion UUID v7 |
| dominion_lead_id | uuid | NOT NULL, FK | References properties |
| composite_score | numeric(7,4) | NOT NULL | Score at time of promotion |
| confidence_score | numeric(5,4) | NOT NULL | Confidence at promotion |
| score_model_version | varchar(32) | NOT NULL | Model version used |
| marketing_tier | enum | NOT NULL | A, B, or C |
| urgency_level | enum | NOT NULL | CRITICAL, HIGH, MEDIUM, LOW |
| recommended_action | text | yes | Human-readable next step |
| signal_summary | jsonb | yes | Top signals summary |
| promoted_at | timestamptz | NOT NULL | When promoted |
| exported_to_sentinel_at | timestamptz | yes | When sent to Sentinel |

**Indexes:** dominion_lead_id, promoted_at, marketing_tier, urgency_level

---

## lead_instances

Temporal acquisition lifecycle for a property. Separate from properties (identity separation invariant).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| lead_instance_id | uuid | PK | Instance UUID v7 |
| dominion_lead_id | uuid | NOT NULL, FK | References properties |
| promotion_id | uuid | FK | References promoted_leads |
| assigned_to | varchar(128) | FK | References users |
| status | enum | NOT NULL, default PROMOTED | 10-state lifecycle enum |
| version | integer | NOT NULL, default 1 | Optimistic locking counter |
| compliance_cleared | boolean | NOT NULL, default false | DNC + litigator check passed |
| dnc_checked_at | timestamptz | yes | When DNC check ran |
| litigant_checked_at | timestamptz | yes | When litigator check ran |
| claimed_at | timestamptz | yes | When an agent claimed |
| dialed_at | timestamptz | yes | First dial attempt |
| contacted_at | timestamptz | yes | First contact made |
| offer_sent_at | timestamptz | yes | Offer transmitted |
| contracted_at | timestamptz | yes | Contract signed |
| closed_at | timestamptz | yes | Deal closed |
| notes | text | yes | Free-form notes |
| created_at | timestamptz | NOT NULL | Row creation time |
| updated_at | timestamptz | NOT NULL | Last modification |

**Indexes:** dominion_lead_id, assigned_to, status, created_at

---

## signal_accumulation

Rolling signal metrics per property, used for acceleration and density bonuses in scoring.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| dominion_lead_id | uuid | PK, FK | References properties |
| first_signal_detected_at | timestamptz | NOT NULL | Earliest signal date |
| signal_count_7d | integer | NOT NULL, default 0 | Signals in last 7 days |
| signal_count_30d | integer | NOT NULL, default 0 | Signals in last 30 days |
| total_signal_count | integer | NOT NULL, default 0 | All-time signal count |
| signal_acceleration_rate | numeric(7,4) | default 0 | Rate of signal increase |
| signal_density_score | numeric(7,4) | default 0 | Signal density metric |
| updated_at | timestamptz | NOT NULL | Last recalculation |

---

## audit_log

Immutable audit trail for all system actions.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| log_id | uuid | PK | Audit entry UUID v7 |
| dominion_lead_id | uuid | yes | Associated property (null for system events) |
| user_id | varchar(128) | yes | Acting user or "system" |
| action_type | varchar(64) | NOT NULL | Action identifier |
| metadata | jsonb | yes | Action-specific details |
| created_at | timestamptz | NOT NULL | When action occurred |

**Indexes:** dominion_lead_id, action_type, created_at, user_id

---

## users

User accounts for authentication and RBAC.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| user_id | varchar(128) | PK | User identifier |
| email | varchar(256) | NOT NULL, UNIQUE | Email address |
| name | varchar(256) | yes | Display name |
| role | enum | NOT NULL, default READONLY | ADMIN, FIELD, READONLY |
| active | boolean | NOT NULL, default true | Account active flag |
| created_at | timestamptz | NOT NULL | Account creation |
| updated_at | timestamptz | NOT NULL | Last modification |

---

## system_settings

Key-value store for system configuration.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| key | varchar(128) | PK | Setting key |
| value | jsonb | NOT NULL | Setting value |
| updated_at | timestamptz | NOT NULL | Last modification |

---

## outcome_reservoir

Tracks acquisition outcomes for ML training data and ROI analysis.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| dominion_lead_id | uuid | PK, FK | References properties |
| outcome_status | enum | NOT NULL, default PROMOTED | PROMOTED, CONTACTED, CONTRACTED, CLOSED, LOST |
| contacted_at | timestamptz | yes | First contact |
| contract_signed_at | timestamptz | yes | Contract execution |
| deal_closed_at | timestamptz | yes | Deal closing |
| assignment_fee | numeric(12,2) | yes | Revenue from assignment |
| days_to_contract | integer | yes | Days from first contact to contract |
| lost_reason | text | yes | Why the deal was lost |
| updated_at | timestamptz | NOT NULL | Last update |
