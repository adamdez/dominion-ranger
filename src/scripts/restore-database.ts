#!/usr/bin/env tsx
/**
 * Dominion Ranger — Database Restore Script (Pure Node.js — no psql needed)
 *
 * Restores data from a JSON backup file created by backup-database.ts.
 * Works on Windows — does NOT require PostgreSQL client tools installed.
 *
 * Usage:
 *   npx tsx src/scripts/restore-database.ts backups/backup-2026-02-25.json
 *   npx tsx src/scripts/restore-database.ts backups/backup-2026-02-25.json --confirm
 *   npx tsx src/scripts/restore-database.ts backups/backup-2026-02-25.json --confirm --table=properties
 *
 * Without --confirm, it shows what would be restored but doesn't execute.
 */
import 'dotenv/config';
import pg from 'pg';
import { existsSync, readFileSync, statSync } from 'node:fs';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const args = process.argv.slice(2);
const backupFile = args.find(a => !a.startsWith('--'));
const confirmed = args.includes('--confirm');
const tableArg = args.find(a => a.startsWith('--table='));
const onlyTable = tableArg ? tableArg.split('=')[1] : null;

if (!backupFile) {
  console.error('Usage: npx tsx src/scripts/restore-database.ts <backup.json> [--confirm] [--table=name]');
  process.exit(1);
}

if (!existsSync(backupFile)) {
  console.error(`❌ Backup file not found: ${backupFile}`);
  process.exit(1);
}

const size = statSync(backupFile).size;
const backup = JSON.parse(readFileSync(backupFile, 'utf-8')) as Record<string, { count: number; rows: Record<string, unknown>[] }>;

console.log(`📦 Restore from: ${backupFile} (${(size / 1024 / 1024).toFixed(1)} MB)`);
console.log('');

const tablesToRestore = onlyTable ? [onlyTable] : Object.keys(backup);
for (const table of tablesToRestore) {
  const data = backup[table];
  if (!data) { console.log(`   ${table}: not in backup`); continue; }
  console.log(`   ${table}: ${data.count} rows (${data.rows.length} exportable)`);
}

if (!confirmed) {
  console.log('\n⚠️  DRY RUN — add --confirm to actually restore');
  console.log('   This will INSERT rows with ON CONFLICT DO NOTHING (safe for existing data).');
  process.exit(0);
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

  for (const table of tablesToRestore) {
    const data = backup[table];
    if (!data || data.rows.length === 0) continue;

    const columns = Object.keys(data.rows[0]);
    const colList = columns.map(c => `"${c}"`).join(', ');

    let inserted = 0;
    let skipped = 0;

    for (const row of data.rows) {
      const values = columns.map((_, i) => `$${i + 1}`).join(', ');
      const params = columns.map(c => row[c]);

      try {
        const result = await pool.query(
          `INSERT INTO "${table}" (${colList}) VALUES (${values}) ON CONFLICT DO NOTHING`,
          params,
        );
        if (result.rowCount && result.rowCount > 0) inserted++;
        else skipped++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Log but continue — some rows may have constraint issues
        if (skipped === 0) console.error(`   ${table}: error on row — ${msg}`);
        skipped++;
      }
    }

    console.log(`   ${table}: ${inserted} inserted, ${skipped} skipped (already existed or error)`);
  }

  console.log('\n✅ Restore complete');
  await pool.end();
}

main().catch(err => {
  console.error('❌ Restore failed:', err);
  process.exit(1);
});
