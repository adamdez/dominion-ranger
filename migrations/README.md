# Dominion Ranger — Migration Strategy

## Source of Truth
`migrations/0001_baseline.sql` is the **single source of truth** for the database schema.
It contains all 34 tables, 17 enums, 93 indexes, and 6 append-only triggers.
Every statement uses `IF NOT EXISTS` / `OR REPLACE` so it's fully idempotent.

## NEVER DO THIS
```bash
npx drizzle-kit push    # DROPS ALL TABLES — destroys all data
npx drizzle-kit push --force  # Same thing with less warning
```

## How to Make Schema Changes

1. Write a new SQL file: `migrations/NNNN_description.sql`
2. Use `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, etc. for idempotency
3. Test locally: `npx tsx src/scripts/run-migration.ts NNNN_description.sql`
4. Update `migrations/0001_baseline.sql` to include the new change
5. Commit both files

## How to Set Up a Fresh Database
```bash
npx tsx src/scripts/run-migration.ts 0001_baseline.sql
npx tsx src/db/seeds/run.ts
npx tsx scripts/apply-invariants.ts
```

## How CI Uses Migrations (GitHub Actions — Ubuntu runner)
- Integration tests: `psql $DATABASE_URL -f migrations/0001_baseline.sql` (psql available on Ubuntu CI runners)
- Migration validation: runs all numbered migration files in order

## Legacy
The `src/db/migrations/` directory contains old drizzle-kit generated files.
These are kept for reference but are NOT the source of truth.
The `drizzle.config.ts` now points to `./migrations` as the output directory.
