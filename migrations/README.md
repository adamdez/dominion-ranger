# Dominion Ranger — Database Migrations

## CRITICAL SAFETY RULE

**NEVER run `npx drizzle-kit push` or `npx drizzle-kit generate` against production.**

This has wiped the production database before. All schema changes must be hand-written, additive-only SQL migrations applied manually or via the project's migration runner.

### Prohibited Commands

```bash
npx drizzle-kit push    # WILL destroy all data
npx drizzle-kit generate # Do not use Drizzle's migration generator
```

### Required Migration Pattern

```sql
-- GOOD: additive only, idempotent
CREATE TABLE IF NOT EXISTS my_table (...);
ALTER TABLE my_table ADD COLUMN IF NOT EXISTS new_col TEXT;
DO $$ BEGIN CREATE TYPE my_enum AS ENUM (...); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- BAD: NEVER do this
DROP TABLE my_table;
ALTER TABLE my_table DROP COLUMN old_col;
```

---

## Production Schema (34 Tables, 17 Enums)

### Enums (17)

| # | Enum Name | Values |
|---|-----------|--------|
| 1 | `event_type` | NOTICE_OF_DEFAULT, LIS_PENDENS, TAX_DELINQUENCY, PROBATE, BANKRUPTCY, HOA_LIEN, CODE_ENFORCEMENT, NOTICE_OF_TRUSTEE_SALE, TAX_LIEN, MECHANIC_LIEN, JUDGMENT_LIEN, PREDICTIVE_EQUITY_DECLINE, PREDICTIVE_PAYMENT_STRESS, PREDICTIVE_OWNERSHIP_FATIGUE, PREDICTIVE_VACANCY_SIGNAL, PREDICTIVE_LISTING_WITHDRAWAL, PREDICTIVE_DIVORCE_FILING, PREDICTIVE_CODE_VIOLATION, PREDICTIVE_DEFERRED_MAINTENANCE, PREDICTIVE_ABSENTEE_DISTRESS, PREDICTIVE_MARKET_STRESS, SHERIFF_SALE |
| 2 | `event_layer` | predictive, confirmed |
| 3 | `freshness_category` | same_day, 1_3_days, 4_7_days, stale |
| 4 | `mortgage_status` | CURRENT, LATE_30, LATE_60, LATE_90, DEFAULT, FORECLOSURE, FREE_AND_CLEAR, UNKNOWN |
| 5 | `marketing_tier` | A, B, C |
| 6 | `urgency_level` | CRITICAL, HIGH, MEDIUM, LOW |
| 7 | `outcome_status` | PROMOTED, CLAIMED, DIALED, OFFER_SENT, CONTRACTED, CLOSED, DEAD, LISTED, SOLD |
| 8 | `lead_instance_status` | PROMOTED, ASSIGNED, COMPLIANCE_PENDING, DIAL_READY, DIALING, CONTACTED, OFFER_SENT, CONTRACTED, CLOSED, DEAD |
| 9 | `disposition_type` | NO_ANSWER, LEFT_VOICEMAIL, CALLBACK_REQUESTED, NOT_INTERESTED, WRONG_NUMBER, DO_NOT_CALL, INTERESTED, APPOINTMENT_SET, DISCONNECTED |
| 10 | `user_role` | ADMIN, FIELD, READONLY, MANAGER, AGENT |
| 11 | `activity_type` | CALL_PLACED, CALL_CONNECTED, TEXT_SENT, TEXT_REPLY, EMAIL_SENT, EMAIL_REPLY, MAIL_SENT, MAIL_DELIVERED, MAIL_RETURNED, RVM_DROPPED, INBOUND_FORM, INBOUND_CALL, APPOINTMENT_SET, OFFER_SENT, CONTRACT_SENT, CONTRACT_SIGNED, DEAL_CLOSED, STATUS_CHANGED, LEAD_ASSIGNED, LEAD_PROMOTED, COMPLIANCE_CHECKED, DRIP_ENROLLED, DRIP_CANCELLED, NOTE_ADDED, CALLBACK_SCHEDULED, CALLBACK_COMPLETED, CALLBACK_MISSED, QR_SCANNED |
| 12 | `activity_channel` | OUTBOUND_COLD, INBOUND_WEBSITE, INBOUND_CALL, DRIP_SMS, DRIP_EMAIL, DRIP_RVM, DIRECT_MAIL, MANUAL_EMAIL, MANUAL_SMS, GOOGLE_ADS, ORGANIC, REFERRAL |
| 13 | `activity_outcome` | NO_ANSWER, VOICEMAIL, BUSY, DISCONNECTED, CONNECTED, WRONG_NUMBER, WARM, FOLLOW_UP, OFFER_REQUESTED, APPT_SET, NOT_INTERESTED, DO_NOT_CALL, CONTRACTED, CLOSED, FELL_THROUGH, CANCELLED |
| 14 | `channel_type` | INBOUND, OUTBOUND, PREDICTIVE, REFERRAL |
| 15 | `campaign_status` | ACTIVE, PAUSED, COMPLETE |
| 16 | `task_status` | PENDING, COMPLETED, CANCELLED |
| 17 | `task_type` | CALLBACK, FOLLOW_UP, RESEARCH, SEND_OFFER, SITE_VISIT, GENERAL |

### Tables by Domain (34)

#### Signal Domain

| # | Table | PK | Purpose | Created |
|---|-------|----|---------|---------|
| 1 | `properties` | `dominion_lead_id` (UUID) | Permanent property identity. APN + county = unique. | Phase 1 (migration 0000) |
| 2 | `distress_events` | `event_id` (UUID) | Append-only distress signal store. Fingerprint-deduped. | Phase 1 (migration 0000) |

#### Scoring Domain

| # | Table | PK | Purpose | Created |
|---|-------|----|---------|---------|
| 3 | `scoring_model_configs` | `version` (VARCHAR) | Versioned scoring model configuration. | Phase 1 (migration 0000) |
| 4 | `scoring_records` | `score_id` (UUID) | Append-only scoring history. | Phase 1 (migration 0000) |
| 5 | `pending_scoring` | `dominion_lead_id` (UUID) | DB-backed fallback queue for scoring when Redis is unavailable. | Phase 1 (migration 0001) |
| 6 | `signal_accumulation` | `dominion_lead_id` (UUID) | Rolling signal counts and trajectory metrics. | Phase 1 (migration 0000) |

#### Promotion Domain

| # | Table | PK | Purpose | Created |
|---|-------|----|---------|---------|
| 7 | `promoted_leads` | `promotion_id` (UUID) | Deterministic promotion records with score snapshots. | Phase 1 (migration 0000) |
| 8 | `outcome_reservoir` | `dominion_lead_id` (UUID) | Sentinel outcome tracking (promoted → closed pipeline). | Phase 1 (migration 0000) |

#### Workflow Domain (CRM)

| # | Table | PK | Purpose | Created |
|---|-------|----|---------|---------|
| 9 | `lead_instances` | `lead_instance_id` (UUID) | Temporal acquisition lifecycle. Optimistic locking via `version`. | Phase 2 (migration 0001) |
| 10 | `dispositions` | `id` (UUID) | Call attempt outcome log. | Phase 2 (migration 0002) |
| 11 | `tasks` | `id` (UUID) | Workflow tasks: callbacks, follow-ups, site visits. | Phase 3 (migration 0005) |

#### Auth & Audit

| # | Table | PK | Purpose | Created |
|---|-------|----|---------|---------|
| 12 | `users` | `user_id` (VARCHAR) | System users with RBAC roles. | Phase 1 (migration 0000) |
| 13 | `sessions` | `id` (UUID) | Refresh-token session store. | Phase 2 (migration 0010) |
| 14 | `audit_log` | `log_id` (UUID) | System-wide audit trail for all domain actions. | Phase 1 (migration 0000) |

#### Analytics & Attribution

| # | Table | PK | Purpose | Created |
|---|-------|----|---------|---------|
| 15 | `activity_log` | `activity_id` (UUID) | Append-only universal event substrate for analytics. | Phase 2 (migration 0003) |
| 16 | `deals` | `deal_id` (UUID) | Closed-deal records for attribution and model calibration. | Phase 3 (migration 0004) |
| 17 | `marketing_channels` | `channel_id` (UUID) | Marketing channel definitions. | Phase 3 (migration 0004) |
| 18 | `campaigns` | `campaign_id` (UUID) | Marketing campaign records. | Phase 3 (migration 0004) |
| 19 | `campaign_spend_entries` | `spend_id` (UUID) | Per-day campaign spend tracking. | Phase 3 (migration 0004) |
| 20 | `lead_source_attribution` | `attribution_id` (UUID) | Multi-touch attribution with UTM tracking. | Phase 3 (migration 0004) |

#### Communication

| # | Table | PK | Purpose | Created |
|---|-------|----|---------|---------|
| 21 | `call_logs` | `id` (UUID) | Twilio call records with recording links. | Phase 2 (migration 0003) |
| 22 | `sms_logs` | `id` (UUID) | SMS message records. | Phase 2 (migration 0003) |

#### Inbound

| # | Table | PK | Purpose | Created |
|---|-------|----|---------|---------|
| 23 | `inbound_leads` | `id` (UUID) | Website form submissions and inbound inquiries. | Phase 2 (migration 0002) |

#### Market & Adapter Monitoring

| # | Table | PK | Purpose | Created |
|---|-------|----|---------|---------|
| 24 | `market_configs` | `market_id` (UUID) | Per-county market configuration. | Phase 3 (migration 0007) |
| 25 | `adapter_run_history` | `run_id` (UUID) | Adapter execution audit trail. | Phase 3 (migration 0007) |

#### Intelligence & Pipeline

| # | Table | PK | Purpose | Created |
|---|-------|----|---------|---------|
| 26 | `property_contacts` | `id` (UUID) | Skip-trace multi-contact records per property. | Phase 3 (migration 0005) |
| 27 | `tags` | `id` (UUID) | Admin-managed tag definitions with display color. | Phase 3 (migration 0005) |
| 28 | `lead_instance_tags` | `id` (UUID) | Many-to-many junction: tags on lead instances. | Phase 3 (migration 0005) |
| 29 | `saved_filters` | `id` (UUID) | Smart list presets for the leads view. | Phase 3 (migration 0005) |

#### Comp Engine

| # | Table | PK | Purpose | Created |
|---|-------|----|---------|---------|
| 30 | `comp_reports` | `id` (UUID) | Comparable sales analysis reports (BatchData). | Phase 3 (migration 0011) |

#### Offers

| # | Table | PK | Purpose | Created |
|---|-------|----|---------|---------|
| 31 | `offers` | `id` (UUID) | Purchase offer tracking with counter-offer support. | Phase 3 (migration 0018) |

#### Config & Operational

| # | Table | PK | Purpose | Created |
|---|-------|----|---------|---------|
| 32 | `system_settings` | `key` (VARCHAR) | Key-value system configuration store. | Phase 1 (migration 0000) |
| 33 | `feature_flags` | `flag_key` (VARCHAR) | Runtime feature toggles. | Phase 2 (migration 0006) |
| 34 | `error_log` | `error_id` (UUID) | Application error tracking. | Phase 2 (migration 0006) |

---

## Append-Only Triggers (Charter v2.3)

Three tables have database-level triggers that prevent UPDATE and DELETE operations:

| Table | Triggers | Charter Invariant |
|-------|----------|-------------------|
| `distress_events` | `distress_events_no_update`, `distress_events_no_delete` | #1 |
| `scoring_records` | `scoring_records_no_update`, `scoring_records_no_delete` | #2 |
| `activity_log` | `activity_log_no_update`, `activity_log_no_delete` | #3 |

All triggers call `prevent_append_only_mutation()` which raises:
```
Charter violation: UPDATE on append-only table "distress_events" is prohibited
```

These are applied at startup by `src/db/invariants.ts` and also included in the baseline migration.

---

## Migration Files

### Baseline

| File | Description |
|------|-------------|
| `0001_baseline.sql` | Full schema recreation from scratch (all 34 tables, 17 enums, all indexes, all triggers). Fully idempotent. For disaster recovery. |

### Historical Drizzle Migrations (in `src/db/migrations/`)

These are the original migrations that built the schema incrementally. They are kept for historical reference only. The `0001_baseline.sql` in this folder supersedes all of them as a single source of truth.

| File | Description |
|------|-------------|
| `0000_sparkling_black_bolt.sql` | Initial schema: properties, distress_events, scoring_records, signal_accumulation, promoted_leads, outcome_reservoir, scoring_model_configs, system_settings, users, audit_log |
| `0001_charming_wendell_rand.sql` | lead_instances, pending_scoring |
| `0002_smiling_mandarin.sql` | dispositions, inbound_leads |
| `0003_amusing_namora.sql` | call_logs, sms_logs, activity_log |
| `0004_great_venus.sql` | deals, marketing_channels, campaigns, campaign_spend_entries, lead_source_attribution |
| `0005_thin_sheva_callister.sql` | property_contacts, tags, lead_instance_tags, saved_filters, tasks |
| `0006_dizzy_the_executioner.sql` | Additional schema updates |
| `0006_feature_flags_error_log.sql` | feature_flags, error_log |
| `0006_seed_scoring_config.sql` | Scoring config seed data |
| `0007_market_config.sql` | market_configs, adapter_run_history |
| `0008_seed_scoring_config.sql` | Updated scoring config seed |
| `0009_tasks_cadence.sql` | Tasks cadence columns |
| `0010_users_auth.sql` | User auth columns (password_hash, sessions) |
| `0011_comp_reports.sql` | comp_reports table |
| `0012_compliance_columns.sql` | Compliance columns on lead_instances |
| `0013_scoring_config_not_null.sql` | NOT NULL constraints on scoring config |
| `0017_disposition_disconnected.sql` | DISCONNECTED value added to disposition_type |
| `0018_offers_table.sql` | offers table |
| `0019_funnel_stage.sql` | funnel_stage, declined_count columns on lead_instances |

---

## How to Apply a New Migration

1. Write your migration as a new SQL file: `migrations/NNNN_description.sql`
2. Use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` everywhere
3. **Never** use `DROP TABLE` or `DROP COLUMN`
4. Test locally first:
   ```bash
   psql $LOCAL_DATABASE_URL -f migrations/NNNN_description.sql
   ```
5. Apply to production:
   ```bash
   psql $DATABASE_URL -f migrations/NNNN_description.sql
   ```
6. Update the Drizzle schema files in `src/db/schema/` to match
7. Commit both the migration SQL and the schema changes

### Rollback Strategy

Since all migrations are additive-only, rollback means:
- For new columns: they remain (unused columns are harmless)
- For new tables: `DROP TABLE IF EXISTS new_table;` (only if table has no data)
- For new enum values: enum values cannot be removed in PostgreSQL without recreation

### Disaster Recovery

To recreate the entire schema from scratch on a fresh database:
```bash
psql $DATABASE_URL -f migrations/0001_baseline.sql
```
