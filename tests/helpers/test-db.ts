import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import * as schema from '../../src/db/schema/index.js';

let pool: pg.Pool | null = null;
let testDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Get a Drizzle database instance pointing to the test database.
 *
 * Uses TEST_DATABASE_URL, falling back to DATABASE_URL.
 * Throws if neither is set.
 */
export function getTestDb() {
  if (testDb) return testDb;

  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'No database URL available for integration tests. ' +
      'Set TEST_DATABASE_URL or DATABASE_URL.',
    );
  }

  pool = new pg.Pool({ connectionString: url, max: 5 });
  testDb = drizzle(pool, { schema });
  return testDb;
}

/**
 * Safely execute a SQL statement, ignoring errors from missing tables/triggers.
 */
async function safeExec(db: ReturnType<typeof getTestDb>, statement: ReturnType<typeof sql>) {
  try {
    await db.execute(statement);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (
      msg.includes('does not exist') ||
      msg.includes('undefined_table') ||
      msg.includes('violates foreign key constraint')
    ) {
      return;
    }
    throw err;
  }
}

/**
 * Clean all tables in dependency-safe order.
 * Temporarily disables append-only triggers so DELETE can proceed.
 * Tolerates missing tables (schema not fully migrated).
 */
export async function cleanupTables() {
  const db = getTestDb();

  await safeExec(db, sql`ALTER TABLE distress_events DISABLE TRIGGER USER`);
  await safeExec(db, sql`ALTER TABLE scoring_records DISABLE TRIGGER USER`);

  await safeExec(db, sql`DELETE FROM dispositions`);
  await safeExec(db, sql`DELETE FROM audit_log`);
  await safeExec(db, sql`DELETE FROM lead_instances`);
  await safeExec(db, sql`DELETE FROM outcome_reservoir`);
  await safeExec(db, sql`DELETE FROM promoted_leads`);
  await safeExec(db, sql`DELETE FROM scoring_records`);
  await safeExec(db, sql`DELETE FROM signal_accumulation`);
  await safeExec(db, sql`DELETE FROM distress_events`);
  await safeExec(db, sql`DELETE FROM scoring_model_configs`);
  await safeExec(db, sql`DELETE FROM system_settings`);
  await safeExec(db, sql`DELETE FROM users`);
  await safeExec(db, sql`DELETE FROM properties`);

  await safeExec(db, sql`ALTER TABLE distress_events ENABLE TRIGGER USER`);
  await safeExec(db, sql`ALTER TABLE scoring_records ENABLE TRIGGER USER`);
}

/**
 * Close the test database connection pool.
 */
export async function closeTestDb() {
  if (pool) {
    await pool.end();
  }
  pool = null;
  testDb = null;
}

export function isTestDbAvailable(): boolean {
  return !!(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
}
