/**
 * Run a specific SQL migration file directly against the database.
 * Usage: npx tsx src/scripts/run-migration.ts <filename.sql>
 */
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../db/connection.js';
import { sql } from 'drizzle-orm';

const fileName = process.argv[2];
if (!fileName) {
  console.error('Usage: npx tsx src/scripts/run-migration.ts <filename.sql>');
  process.exit(1);
}

// Consolidated migrations/ is source of truth; fall back to legacy src/db/migrations
const migrationsPath = join('migrations', fileName);
const legacyPath = join('src', 'db', 'migrations', fileName);
const filePath = existsSync(migrationsPath) ? migrationsPath : legacyPath;
const sqlContent = readFileSync(filePath, 'utf-8');

console.log(`Running migration: ${filePath}`);

try {
  await db.execute(sql.raw(sqlContent));
  console.log('Migration completed successfully.');
  process.exit(0);
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
}
