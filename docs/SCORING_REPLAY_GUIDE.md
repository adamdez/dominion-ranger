# Scoring Replay Guide

This guide covers how to replay scoring for verification, how to change scoring configuration without corrupting history, and what the key scoring parameters mean.

## Replay Scoring for One Property

```typescript
import { replayPropertyScoring } from './src/modules/scoring/replay.js';

const result = await replayPropertyScoring(dominionLeadId);
console.log(result.compositeScore, result.motivationScore, result.dealScore);
```

This will:
1. Recalculate signal accumulation metrics for the property
2. Re-score using the current active scoring config
3. Append a new scoring record (existing records are never modified)

## Replay Scoring for All Properties

```typescript
import { replayAllScoring } from './src/modules/scoring/replay.js';

const stats = await replayAllScoring({
  onProgress: (processed, total) => console.log(`${processed}/${total}`),
});
console.log(`Processed: ${stats.processed}, Errors: ${stats.errors}`);
```

This iterates over every property that has at least one distress event and re-scores each one. The config cache is invalidated before replay begins to ensure the latest config is used.

## Verify Determinism (Score, Delete, Replay, Compare)

The Charter requires that given the same events and same config, the system produces identical scores. To verify:

```typescript
import { scoreProperty, invalidateConfigCache } from './src/modules/scoring/service.js';
import { db } from './src/db/connection.js';
import { sql } from 'drizzle-orm';

// Step 1: Score the property
const original = await scoreProperty(dominionLeadId);

// Step 2: Delete the scoring records (temporarily disable trigger)
await db.execute(sql`ALTER TABLE scoring_records DISABLE TRIGGER scoring_records_no_delete`);
await db.execute(sql`DELETE FROM scoring_records WHERE dominion_lead_id = ${dominionLeadId}`);
await db.execute(sql`ALTER TABLE scoring_records ENABLE TRIGGER scoring_records_no_delete`);

// Step 3: Replay
invalidateConfigCache();
const replayed = await scoreProperty(dominionLeadId);

// Step 4: Compare
console.assert(
  Math.abs(original.compositeScore - replayed.compositeScore) < 0.0001,
  'Determinism violation: scores differ',
);
```

**Important:** Never disable triggers in production outside of controlled replay operations.

## Change Scoring Config Without Corrupting History

The scoring system is designed so that config changes never affect existing records:

1. **Create a new config version** — insert a new row into `scoring_model_configs` with a new version string (e.g., "v2.0")
2. **Deactivate the old version** — set `active = false` on the previous version
3. **Activate the new version** — set `active = true` on the new version
4. **Replay scoring** — run `replayAllScoring()` to generate new scores under the new config

```sql
-- Deactivate old
UPDATE scoring_model_configs SET active = false WHERE version = 'v1.0';

-- Insert new version with adjusted weights
INSERT INTO scoring_model_configs (version, confirmed_weights, predictive_weights, ...)
VALUES ('v2.0', '...', '...', ...);

UPDATE scoring_model_configs SET active = true WHERE version = 'v2.0';
```

After replay:
- All v1.0 scoring records still exist, unchanged, with `score_model_version = 'v1.0'`
- New v2.0 records are appended with `score_model_version = 'v2.0'`
- The latest score (used for promotion) is always the most recent `created_at`

## Equity Multiplier Ranges

The equity multiplier adjusts the composite score based on the property's estimated equity. Higher-equity properties are more valuable acquisition targets.

| Equity Range | Multiplier | Rationale |
|-------------|-----------|-----------|
| $0 - $25,000 | 0.70 | Low equity reduces deal viability |
| $25,000 - $75,000 | 0.85 | Moderate equity, some margin |
| $75,000 - $200,000 | 1.00 | Baseline equity range |
| $200,000+ | 1.15 | High equity amplifies score |
| Unknown/null | 1.00 | No data, use baseline |

These ranges are configurable via the `equity_multiplier_config` JSONB column in `scoring_model_configs`.

## Composite Score Weights

The composite score is a weighted combination of the motivation score and deal score:

```
composite = (motivation * motivation_weight + deal * deal_weight) * equity_multiplier
```

Default weights (configurable via `composite_weights` in `scoring_model_configs`):
- `motivation_weight`: 0.65 (distress signal intensity is primary driver)
- `deal_weight`: 0.35 (property economics secondary but important)

## Negative-Stack Suppression

Suppression prevents certain properties from receiving any score, regardless of distress signals. A suppressed property always receives a composite score of 0 and is blocked from promotion.

Suppression is checked **before** any scoring logic runs. Conditions are defined in `suppression_config`:

- **mortgage_statuses**: Array of mortgage status values that trigger suppression (e.g., if you want to suppress FREE_AND_CLEAR properties)
- **max_ownership_months**: Properties owned for fewer than this many months are suppressed (filters out recent purchases)

When a property is suppressed:
- `compositeScore` = 0
- `motivationScore` = 0
- `dealScore` = 0
- `suppressed` = true
- `suppressionReason` contains the explanation
- A scoring record is still appended (for audit trail)
- Promotion evaluation immediately returns null

Suppression config is empty by default (`mortgage_statuses: [], custom_flags: []`), meaning no properties are suppressed unless explicitly configured.
