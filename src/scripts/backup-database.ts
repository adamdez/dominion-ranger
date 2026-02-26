#!/usr/bin/env tsx
/**
 * Dominion Ranger — Database Backup Script (Pure Node.js — no pg_dump needed)
 *
 * Exports core table data as JSON for disaster recovery.
 * Works on Windows — does NOT require PostgreSQL client tools installed.
 *
 * Usage:
 *   npx tsx src/scripts/backup-database.ts
 *   npx tsx src/scripts/backup-database.ts --tables=properties,distress_events
 *
 * Output: ./backups/backup-YYYY-MM-DD-HHMMSS.json
 */
import 'dotenv/config';
import pg from 'pg';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const CORE_TABLES = [
  'properties',
  'distress_events',
  'scoring_records',
  'scoring_model_configs',
  'lead_instances',
  'promoted_leads',
  'activity_log',
  'audit_log',
  'users',
  'feature_flags',
  'system_settings',
  'property_contacts',
  'tags',
  'lead_instance_tags',
  'tasks',
  'offers',
  'deals',
  'call_logs',
  'sms_logs',
  'dispositions',
  'comp_reports',
];

const args = process.argv.slice(2);
const tablesArg = args.find(a => a.startsWith('--tables='));
const tables = tablesArg ? tablesArg.split('=')[1].split(',').map(t => t.trim()) : CORE_TABLES;

const backupDir = join(process.cwd(), 'backups');
if (!existsSync(backupDir)) {
  mkdirSync(backupDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const filename = `backup-${timestamp}.json`;
const filepath = join(backupDir, filename);

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

  console.log('📦 Backing up database...');
  console.log(`   Tables: ${tables.length}`);

  const backup: Record<string, { count: number; rows: unknown[] }> = {};
  let totalRows = 0;

  for (const table of tables) {
    try {
      const countResult = await pool.query(`SELECT count(*)::int AS c FROM "${table}"`);
      const count = countResult.rows[0].c;

      // For very large tables (100k+), just back up the count — full export would be too large
      if (count > 100000) {
        console.log(`   ${table}: ${count.toLocaleString()} rows (count only — too large for JSON backup)`);
        backup[table] = { count, rows: [] };
      } else {
        const dataResult = await pool.query(`SELECT * FROM "${table}" ORDER BY 1 LIMIT 200000`);
        console.log(`   ${table}: ${count.toLocaleString()} rows`);
        backup[table] = { count, rows: dataResult.rows };
        totalRows += count;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Table might not exist — skip gracefully
      if (msg.includes('does not exist')) {
        console.log(`   ${table}: (table does not exist — skipping)`);
      } else {
        console.error(`   ${table}: ERROR — ${msg}`);
      }
    }
  }

  writeFileSync(filepath, JSON.stringify(backup, null, 2));
  const sizeMB = (Buffer.byteLength(JSON.stringify(backup)) / 1024 / 1024).toFixed(1);

  console.log(`\n✅ Backup complete: ${filepath}`);
  console.log(`   Total rows backed up: ${totalRows.toLocaleString()}`);
  console.log(`   File size: ${sizeMB} MB`);

  await pool.end();
}

main().catch(err => {
  console.error('❌ Backup failed:', err);
  process.exit(1);
});
