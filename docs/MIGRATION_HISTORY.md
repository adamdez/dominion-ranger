# Migration History

All migrations are located in `src/db/migrations/` and managed by Drizzle Kit.

## 0000_sparkling_black_bolt.sql — Initial Schema

**Applied:** Phase 1 initial build

Creates the foundational database schema:

**Tables (10):**
- `properties` — Core identity table with APN+County unique index
- `distress_events` — Append-only event store with fingerprint dedup
- `scoring_records` — Append-only scoring history
- `scoring_model_configs` — Config-driven scoring parameters
- `signal_accumulation` — Rolling signal metrics per property
- `promoted_leads` — Promotion records with tier and urgency
- `outcome_reservoir` — Acquisition outcome tracking
- `audit_log` — Immutable audit trail
- `users` — User accounts with RBAC roles
- `system_settings` — Key-value system configuration

**Enums (8):**
- `event_type` — 21 distress event types (confirmed + predictive)
- `event_layer` — confirmed, predictive
- `freshness_category` — same_day, within_week, within_month, stale
- `marketing_tier` — A, B, C
- `urgency_level` — CRITICAL, HIGH, MEDIUM, LOW
- `mortgage_status` — FREE_AND_CLEAR through UNKNOWN
- `outcome_status` — PROMOTED through LOST
- `user_role` — ADMIN, FIELD, READONLY

**Indexes:** Full coverage on all query-critical columns and composite indexes.

**Rollback:**
```sql
-- WARNING: Destroys all data. Only use in development.
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS outcome_reservoir CASCADE;
DROP TABLE IF EXISTS signal_accumulation CASCADE;
DROP TABLE IF EXISTS promoted_leads CASCADE;
DROP TABLE IF EXISTS scoring_records CASCADE;
DROP TABLE IF EXISTS distress_events CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS scoring_model_configs CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS properties CASCADE;
DROP TYPE IF EXISTS event_type CASCADE;
DROP TYPE IF EXISTS event_layer CASCADE;
DROP TYPE IF EXISTS freshness_category CASCADE;
DROP TYPE IF EXISTS marketing_tier CASCADE;
DROP TYPE IF EXISTS urgency_level CASCADE;
DROP TYPE IF EXISTS mortgage_status CASCADE;
DROP TYPE IF EXISTS outcome_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
```

---

## 0001_charming_wendell_rand.sql — Scoring Tri-Model Columns

**Applied:** Phase 1, Sprint 2

Adds tri-score model support to the scoring infrastructure.

**Changes:**
- `scoring_model_configs`: Add `equity_multiplier_config`, `deal_score_weights`, `suppression_config` JSONB columns
- `scoring_records`: Add `motivation_score` and `deal_score` numeric(7,4) columns

**Rollback:**
```sql
ALTER TABLE scoring_model_configs DROP COLUMN IF EXISTS equity_multiplier_config;
ALTER TABLE scoring_model_configs DROP COLUMN IF EXISTS deal_score_weights;
ALTER TABLE scoring_model_configs DROP COLUMN IF EXISTS suppression_config;
ALTER TABLE scoring_records DROP COLUMN IF EXISTS motivation_score;
ALTER TABLE scoring_records DROP COLUMN IF EXISTS deal_score;
```

---

## 0002_smiling_mandarin.sql — Lead Instances Table

**Applied:** Phase 1, Sprint 3

Creates the workflow domain's lead lifecycle table.

**Changes:**
- Add `lead_instance_status` enum: PROMOTED, ASSIGNED, COMPLIANCE_PENDING, DIAL_READY, DIALING, CONTACTED, OFFER_SENT, CONTRACTED, CLOSED, DEAD
- Create `lead_instances` table with 18 columns, FK relationships, and 4 indexes

**Rollback:**
```sql
DROP TABLE IF EXISTS lead_instances CASCADE;
DROP TYPE IF EXISTS lead_instance_status CASCADE;
```

---

## 0003_amusing_namora.sql — Composite Weights Config Column

**Applied:** Phase 1 completion

Adds config-driven composite score weights to remove the last hardcoded scoring heuristic.

**Changes:**
- `scoring_model_configs`: Add `composite_weights` JSONB column

**Purpose:** Charter section C requires all scoring heuristics to be config-driven. The motivation/deal weight ratio (previously hardcoded as 0.65/0.35) is now read from this column.

**Default seed value:**
```json
{
  "motivation_weight": 0.65,
  "deal_weight": 0.35
}
```

**Rollback:**
```sql
ALTER TABLE scoring_model_configs DROP COLUMN IF EXISTS composite_weights;
```
