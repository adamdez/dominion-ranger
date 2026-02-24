# Scoring & Promotion Audit Report
**Date:** February 24, 2026
**Branch:** `audit/charter-compliance-scoring`
**Auditor:** Claude (Charter v2.3 Compliance)

---

## CRITICAL FINDING: Production Database Empty

All core tables have **zero rows**: `properties`, `distress_events`, `scoring_records`,
`scoring_model_configs`, `promoted_leads`, `signal_accumulation`, `lead_instances`.

The MCP Postgres connection targets a database with no seeded data. This means:
- No scoring config is active in production
- `scoreProperty()` will throw `ValidationError('No active scoring model configuration found')`
- No properties to score, promote, or assign

**Recommendation:** Run `seedScoringModel()` from `src/db/seeds/scoring-model-v1.ts` and
re-import CSV data before going operational.

---

## AUDIT 1: Scoring Config Health

### 1A: Schema Structure — PASS

The `scoring_model_configs` table has all required columns:

| Column | Type | Nullable | Status |
|--------|------|----------|--------|
| `version` (PK) | varchar(32) | NO | OK |
| `confirmed_weights` | jsonb | NO | OK |
| `predictive_weights` | jsonb | NO | OK |
| `decay_config` | jsonb | NO | OK |
| `promotion_threshold` | numeric(7,4) | NO | OK |
| `tier_thresholds` | jsonb | NO | OK |
| `confidence_config` | jsonb | NO | OK |
| `equity_multiplier_config` | jsonb | **YES** | CONCERN |
| `deal_score_weights` | jsonb | **YES** | CONCERN |
| `composite_weights` | jsonb | **YES** | CONCERN |
| `suppression_config` | jsonb | **YES** | CONCERN |
| `active` | boolean | NO | OK |
| `created_at` | timestamptz | NO | OK |

**Finding:** 4 JSONB columns are nullable (`equity_multiplier_config`, `deal_score_weights`,
`composite_weights`, `suppression_config`). The scoring engine throws `ValidationError` if
any of the first three are null (lines 149-153 of `scoring/service.ts`). These columns should
be `NOT NULL` in the schema to enforce at the DB level what the code already requires.

### 1B: Seed Config Completeness — PASS

The v1.0 seed in `src/db/seeds/scoring-model-v1.ts` populates ALL columns:
- `confirmedWeights`: 11 event types with base_weight and half_life_days
- `predictiveWeights`: 10 event types with base_weight and half_life_days
- `equityMultiplierConfig`: 4 ranges with min/max/multiplier + default_multiplier
- `tierThresholds`: `{ A: 80, B: 60, C: 40 }`
- `promotionThreshold`: `40.0000`
- `compositeWeights`: `{ motivation_weight: 0.65, deal_weight: 0.35 }`
- `suppressionConfig`: `{ mortgage_statuses: [], custom_flags: [] }` (empty — no suppression active)

### 1C: Event Type Coverage — PASS

All 21 event types defined in the `event_type` enum have corresponding weight entries:
- 11 confirmed types → all present in `confirmedWeights`
- 10 predictive types → all present in `predictiveWeights`

No unscored signal gaps.

### 1D: Suppression Config — CONCERN

`suppressionConfig.mortgage_statuses` is an empty array `[]`. This means **no properties are
suppressed by mortgage status**. The `max_ownership_months` field is absent (not set), and
`custom_flags` is also empty. The suppression engine is effectively disabled.

**Recommendation:** Consider whether properties with `FREE_AND_CLEAR` mortgage status or very
short ownership (<6 months, likely flippers) should be suppressed.

---

## AUDIT 2: Score Distribution

**Cannot analyze — database has 0 scoring_records.**

### Calibration Assessment (Code-Level)

Based on the tier thresholds in the seed config:
- **Tier A:** composite >= 80
- **Tier B:** composite >= 60
- **Tier C:** composite >= 40
- **Promotion threshold:** 40

With `compositeWeights = { motivation: 0.65, deal: 0.35 }` and `equityMultiplier` range of
0.7–1.15, the theoretical max composite is ~115 (if both motivation and deal are 100 with
1.15x equity multiplier, clamped to 100).

The tier distribution will depend heavily on:
1. How many events each property has (more events → higher motivation score)
2. Property economics (equity, ownership duration, absentee status, mortgage)
3. Event freshness (decay reduces old signals)

**Recommendation:** After data import, run this query to assess calibration:

```sql
SELECT
  CASE
    WHEN composite_score::numeric >= 80 THEN 'Tier A'
    WHEN composite_score::numeric >= 60 THEN 'Tier B'
    WHEN composite_score::numeric >= 40 THEN 'Tier C'
    ELSE 'Below threshold'
  END as tier,
  count(*),
  round(100.0 * count(*) / (SELECT count(*) FROM scoring_records), 1) as pct
FROM scoring_records
GROUP BY 1
ORDER BY 1;
```

If >80% of scored properties are Tier A, use percentile-based calibration:

```sql
SELECT
  round(percentile_cont(0.85) WITHIN GROUP (ORDER BY composite_score::numeric), 0) as tier_a,
  round(percentile_cont(0.60) WITHIN GROUP (ORDER BY composite_score::numeric), 0) as tier_b,
  round(percentile_cont(0.35) WITHIN GROUP (ORDER BY composite_score::numeric), 0) as tier_c
FROM scoring_records;
```

---

## AUDIT 3: Deterministic Replay

### 3A: Non-Deterministic Input Scan

| Location | Code | Verdict |
|----------|------|---------|
| `scoring/service.ts:101` | `Date.now()` in config cache TTL | **SAFE** — operational, not scoring logic |
| `scoring/service.ts:156` | `options?.asOf ?? new Date()` | **ACCEPTABLE** — `asOf` param is injectable for replay; regular scoring uses wall-clock time, but the timestamp is recorded in `lastScoredAt` |
| `promotion/service.ts:37` | `new Date(Date.now() - 24*60*60*1000)` | **CONCERN** — 24h idempotency window uses wall-clock; replay at different times produces different promotion counts |
| `lib/dates.ts:4` | `daysBetween(from, to = new Date())` | **SAFE** — scoring always passes explicit `to` parameter |
| All files | `Math.random()` | **NOT FOUND** — PASS |
| All files | `fetch()` in scoring path | **NOT FOUND** — PASS |

### 3B: Replay Infrastructure — PASS

The `scoreProperty()` function accepts `options?.asOf` which:
1. Is used as the reference point for all time-decay calculations
2. Is stored in `lastScoredAt` in the scoring record
3. Enables exact replay by passing the same date

The `replayPropertyScoring()` in `scoring/replay.ts` properly calls
`scoreProperty(dominionLeadId, options)` and passes through `asOf`.

### 3C: Replay-Blocking Issue — Promotion Idempotency Window

`evaluateForPromotion()` uses `Date.now()` to compute the 24h dedup window (line 37).
This means:
- If you replay promotions >24h after the original, ALL properties will be re-promoted
  (creating duplicate promotion records)
- If you replay within 24h, duplicates are correctly blocked

This is not a scoring determinism issue (scores are deterministic), but a **promotion
replay issue**. The `evaluateForPromotion()` function should accept an `asOf` parameter
for the dedup check to be fully replayable.

### 3D: Existing Tests — PASS

- `tests/integration/scoring-replay.test.ts`: Correctly tests delete-and-replay with
  fixed `asOf = new Date('2026-02-15T12:00:00Z')`. Uses `toBeCloseTo(value, 4)` for
  floating-point tolerance. Validates composite, motivation, deal, equity multiplier,
  and confidence scores.

- `tests/integration/scoring-invariants.test.ts`: Tests append-only triggers and version
  preservation. All sound.

### 3E: scoreInputsSnapshot Audit — CONCERN

`storeScoringRecord()` stores:
```javascript
scoreInputsSnapshot: {
  eventCount, uniqueTypes, uniqueSources,
  hasConfirmedEvent, equityMultiplier,
  suppressed, suppressionReason,
}
```

**Missing from snapshot:** The property data used for deal score calculation
(equityEstimate, ownershipDurationMonths, absenteeOwner, mortgageStatus). Without these,
you cannot fully audit WHY a deal score was computed as a specific value. The signal
contributions capture motivation score inputs well, but deal score inputs are invisible.

---

## AUDIT 4: Promotion Health

### 4A: Suppression Enforcement — STRUCTURAL CONCERN

The properties table has **no `dnc_flag` or `litigant_flag` columns**. A grep for these
fields across the entire `src/` directory returns zero matches.

DNC/litigant checking occurs in the **Workflow domain** (`runComplianceGating()` in
`workflow/service.ts`), not in the Scoring or Promotion domains. This is architecturally
correct per Charter domain boundaries:
- **Scoring domain** checks `suppressionConfig` (mortgage status, ownership duration)
- **Workflow domain** checks DNC + litigant via `checkDnc()` and `checkLitigator()`

Therefore the SQL query from the spec (`WHERE p.dnc_flag = true`) is N/A — these columns
don't exist. The compliance gate is enforced at ASSIGNED → COMPLIANCE_PENDING → DIAL_READY,
not at promotion time.

### 4B: Promotion Idempotency — PASS

`evaluateForPromotion()` checks for existing promotion within 24h for the same model version:

```typescript
const [existing] = await db
  .select({ promotionId: promotedLeads.promotionId })
  .from(promotedLeads)
  .where(and(
    eq(promotedLeads.dominionLeadId, dominionLeadId),
    eq(promotedLeads.scoreModelVersion, scoringResult.modelVersion),
    gte(promotedLeads.promotedAt, oneDayAgo),
  ))
  .limit(1);
```

If a promotion exists, it returns `null` (blocked).

### 4C: Tier Assignment — PASS

`assignTier()` correctly implements threshold cascade:
- score >= A threshold → Tier A
- score >= B threshold → Tier B
- else → Tier C

Matches the seed config: A=80, B=60, C=40.

### 4D: Existing Promotion Replay Test — PASS

`tests/integration/promotion-replay.test.ts` creates 5 properties with varying signal
levels, scores them with fixed `asOf`, promotes, then replays promotions from stored
scores. Verifies same set of properties promoted with same tiers. Sound test.

---

## AUDIT 5: Signal Accumulation Integrity

**Cannot verify with live data — 0 rows in all tables.**

### Schema Review — PASS

`signal_accumulation` tracks:
- `total_signal_count`, `signal_count_7d`, `signal_count_30d`
- `signal_acceleration_rate`, `signal_density_score`
- PK on `dominion_lead_id` (1:1 with property)
- Indexes on density and total count

### Code Review — PASS

`recalculateSignalAccumulation()` is called before scoring in the replay path. The scoring
engine reads `signalAccumulation` for acceleration and density bonuses. Calculation is
inline (no external dependencies).

**Recommendation:** After data import, run drift check:

```sql
SELECT sa.dominion_lead_id,
  sa.total_signal_count as accumulated,
  de.actual as counted,
  sa.total_signal_count - de.actual as drift
FROM signal_accumulation sa
JOIN (SELECT dominion_lead_id, count(*) as actual FROM distress_events GROUP BY 1) de
  ON sa.dominion_lead_id = de.dominion_lead_id
WHERE sa.total_signal_count != de.actual
LIMIT 20;
```

---

## AUDIT 6: Null Safety

### `.toFixed()` Calls — 22 Total

| File | Lines | Risk |
|------|-------|------|
| `scoring/service.ts` | 288-292 (logging) | **SAFE** — local numeric variables always populated |
| `scoring/service.ts` | 402-405, 417-418 (storage) | **SAFE** — `result.*` fields are always numbers from computation |
| `promotion/service.ts` | 107-108 (DB insert) | **SAFE** — `scoringResult.*` typed as `number` |
| `promotion/service.ts` | 121 (logging) | **SAFE** — same |
| `promotion/service.ts` | 185, 188 (signal summary) | **LOW RISK** — `c.finalContribution` and `result.timeDecayFactor` are always numbers from scoring |
| `signals/service.ts` | 68-69, 78-79, 86 | **SAFE** — local computation results |
| `distress-events/service.ts` | 54 | **SAFE** — `reliability` is a computed number |
| Scripts (reimport, backfill, scoring route) | Various | **SAFE** — elapsed time calculations |

### Unsafe Property Access — NONE FOUND

All nullable score field accesses use null-coalescing:
- `promotion/replay.ts:26-36`: `parseFloat(latestScore.motivationScore ?? '0')`
- `scoring/service.ts:234`: `signals?.signalAccelerationRate ?? '0'`

No unguarded `.property` access on potentially null score values found.

---

## Summary Table

| Check | Result | Severity |
|-------|--------|----------|
| Scoring config schema | All columns present | PASS |
| Config JSONB nullable columns | 4 columns nullable but code requires them | LOW |
| Event type weight coverage | 21/21 covered | PASS |
| Suppression config | Empty — no active suppression | INFO |
| Score distribution | No data to analyze | BLOCKED |
| Deterministic replay (scoring) | `asOf` injectable, timestamp recorded | PASS |
| Deterministic replay (promotion) | 24h window uses `Date.now()` | MEDIUM |
| `Math.random()` in scoring | Not found | PASS |
| External API in scoring | Not found | PASS |
| `scoreInputsSnapshot` completeness | Missing deal score inputs (property data) | LOW |
| DNC/litigant in promotion | N/A — handled by Workflow domain | INFO |
| Promotion idempotency | 24h + model version dedup | PASS |
| Promotion tier logic | Correct threshold cascade | PASS |
| Signal accumulation integrity | No data to verify | BLOCKED |
| `.toFixed()` null safety | All 22 calls on guaranteed-numeric values | PASS |
| Append-only triggers | distress_events + scoring_records + activity_log | PASS |
| Production database state | **All tables empty — 0 rows** | CRITICAL |

---

## Recommended Fixes (Priority Order)

1. **CRITICAL:** Seed the production database with scoring model config and import property data. Without this, the entire scoring/promotion pipeline is inoperable.

2. **MEDIUM:** Make `evaluateForPromotion()` accept an optional `asOf` parameter for the 24h idempotency check, enabling fully deterministic promotion replay.

3. **LOW:** Change `equity_multiplier_config`, `deal_score_weights`, `composite_weights` columns to `NOT NULL` in the schema, matching the code's runtime requirements.

4. **LOW:** Expand `scoreInputsSnapshot` to include property deal score inputs (`equityEstimate`, `ownershipDurationMonths`, `absenteeOwner`, `mortgageStatus`) for full audit trail.

5. **INFO:** Review whether `suppressionConfig` should include mortgage statuses like `FREE_AND_CLEAR` or ownership duration minimums to filter non-distressed properties.

6. **INFO:** After data import, run distribution analysis to verify tier calibration targets (A: 5-15%, B: 15-25%, C: 25-35%, D: 30-50%).
