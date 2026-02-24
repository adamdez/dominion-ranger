# Audit Remediation Report

**Date:** February 24, 2026  
**Branch:** fix/audit-remediation  
**Addresses:** PRs #21, #22, #23 findings

---

## Fixes Applied

### CRITICAL

| # | Fix | Status |
|---|-----|--------|
| 1 | Auth migration `0010_users_auth.sql` applied | ✅ sessions table + password_hash, phone, etc. on users |
| 2 | `checkDnc()` now reads: properties.dnc_flag, property_contacts.dnd_calls | ✅ Real DB checks, no stub |
| 3 | `checkLitigator()` now reads: properties.litigant_flag | ✅ Real DB checks, no stub |
| 4 | Database still empty | ⚠️ Requires `npm run system:recover spokane.csv` (or equivalent) by Adam |

### HIGH

| # | Fix | Status |
|---|-----|--------|
| 5 | `checkSuppression()` now reads custom_flags from scoring_model_configs.suppression_config | ✅ DNC, LITIGANT, OPT_OUT suppression |
| 6 | property_contacts.dnd_calls wired into DNC check | ✅ Any contact with dnd_calls=true blocks |
| 7 | `evaluateForPromotion()` accepts optional `asOf` parameter for replay | ✅ |
| 8 | 4 JSONB columns (equity_multiplier_config, deal_score_weights, composite_weights, suppression_config) set to NOT NULL | ✅ Migration 0013 |
| 9 | Dial queue filters out dnc_flag, litigant_flag, opt_out_flag properties | ✅ JOIN + WHERE clause |
| 10 | Compliance flag API: POST /api/leads/:dominionLeadId/compliance-flag | ✅ Agents can set DNC/LITIGANT/OPT_OUT |

### Schema

| Migration | Description |
|-----------|-------------|
| 0010_users_auth.sql | Applied — sessions, password_hash, etc. |
| 0011_comp_reports.sql | Applied — comp_reports table |
| 0012_compliance_columns.sql | Applied — dnc_flag, litigant_flag, opt_out_flag on properties |
| 0013_scoring_config_not_null.sql | Applied — NOT NULL on 4 JSONB columns |

### Scoring Calibration

- **Distribution:** N/A — scoring_records has 0 rows (database empty)
- **Recommendation:** Run data import, then re-run calibration analysis
- **Status:** PENDING — no data to analyze. When data exists:
  ```sql
  SELECT 
    round(percentile_cont(0.88) WITHIN GROUP (ORDER BY composite_score::numeric), 0) as suggested_tier_a,
    round(percentile_cont(0.65) WITHIN GROUP (ORDER BY composite_score::numeric), 0) as suggested_tier_b,
    round(percentile_cont(0.35) WITHIN GROUP (ORDER BY composite_score::numeric), 0) as suggested_tier_c
  FROM scoring_records;
  ```

---

## New Tests

| File | Tests | Status |
|------|-------|--------|
| tests/invariants/compliance-real.test.ts | 7 | ✅ All pass |
| tests/integration/workflow-concurrency.test.ts | 3 | ✅ All pass (fixed signal_accumulation cleanup) |

### Compliance Test Coverage

- DNC: property.dnc_flag → isOnDnc=true
- DNC: property_contacts.dnd_calls=true → isOnDnc=true
- DNC: no flags → isOnDnc=false
- Litigant: property.litigant_flag → isLitigator=true
- Litigant: no flag → isLitigator=false
- Integration: DNC-flagged property blocks DIAL_READY
- Integration: litigant-flagged property blocks DIAL_READY

---

## Remaining for Adam

1. **Run `npm run db:migrate`** — if using Drizzle migrate (migrations 0012, 0013 are new; 0010, 0011 were run via run-migration script)
2. **Run `npm run seed:admin`** — create admin user with password
3. **Run data import** — e.g. `npm run system:recover spokane.csv` or equivalent to load properties/events
4. **Change admin password** on first login
5. **Review scoring threshold recommendations** — when data exists, run the percentile query above

---

## Compliance API Usage

```bash
# Set a property as DNC (blocks from dial queue)
POST /api/leads/:dominionLeadId/compliance-flag
Body: { "flag": "DNC", "value": true }

# Set a property as litigator
POST /api/leads/:dominionLeadId/compliance-flag
Body: { "flag": "LITIGANT", "value": true }

# Remove opt-out flag
POST /api/leads/:dominionLeadId/compliance-flag
Body: { "flag": "OPT_OUT", "value": false }
```

Requires `workflow.write` permission.

---

## Charter Section VIII Compliance

> Before dial eligibility: DNC scrub, Litigant suppression, Opt-out enforcement, Negative-stack suppression. No exceptions.

| Requirement | Implementation |
|-------------|----------------|
| DNC scrub | checkDnc() reads property.dnc_flag + property_contacts.dnd_calls |
| Litigant suppression | checkLitigator() reads property.litigant_flag |
| Opt-out enforcement | property.opt_out_flag; checkSuppression() in scoring; dial queue filter |
| Negative-stack suppression | checkSuppression() reads mortgage_statuses + custom_flags from config |
| All compliance actions logged | logAudit() on every check; compliance.flag_set/flag_removed on API |
