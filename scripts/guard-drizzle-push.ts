#!/usr/bin/env npx tsx
/**
 * Guard: Blocks drizzle-kit push when DATABASE_URL points to production (Neon).
 * Run this before any drizzle-kit push. CI runs it to prevent accidental production wipes.
 *
 * Exit 0 = safe to push (local/test DB)
 * Exit 1 = BLOCKED (production/Neon detected)
 */
const url = process.env.DATABASE_URL ?? '';

const isProduction =
  url.includes('neon.tech') ||
  url.includes('pooler') ||
  url.includes('neon-');

if (isProduction) {
  console.error('');
  console.error('╔══════════════════════════════════════════════════════════════╗');
  console.error('║  BLOCKED: drizzle-kit push would destroy PRODUCTION data.    ║');
  console.error('║  DATABASE_URL points to Neon or non-local database.          ║');
  console.error('║                                                              ║');
  console.error('║  Use additive SQL migrations instead:                        ║');
  console.error('║    npx tsx src/scripts/run-migration.ts <migration.sql>      ║');
  console.error('╚══════════════════════════════════════════════════════════════╝');
  console.error('');
  process.exit(1);
}

process.exit(0);
