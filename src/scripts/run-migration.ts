/**
 * Run a specific SQL migration file directly against the database.
 * Usage: npx tsx src/scripts/run-migration.ts <filename.sql>
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../db/connection.js';
import { sql } from 'drizzle-orm';

const fileName = process.argv[2];
if (!fileName) {
  console.error('Usage: npx tsx src/scripts/run-migration.ts <filename.sql>');
  process.exit(1);
}

const filePath = join('src', 'db', 'migrations', fileName);
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
