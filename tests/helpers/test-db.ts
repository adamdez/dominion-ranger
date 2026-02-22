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
 * Clean all tables in dependency-safe order.
 * Temporarily disables append-only triggers so DELETE can proceed.
 */
export async function cleanupTables() {
  const db = getTestDb();

  await db.execute(sql`ALTER TABLE distress_events DISABLE TRIGGER ALL`);
  await db.execute(sql`ALTER TABLE scoring_records DISABLE TRIGGER ALL`);

  await db.execute(sql`DELETE FROM audit_log`);
  await db.execute(sql`DELETE FROM lead_instances`);
  await db.execute(sql`DELETE FROM outcome_reservoir`);
  await db.execute(sql`DELETE FROM promoted_leads`);
  await db.execute(sql`DELETE FROM scoring_records`);
  await db.execute(sql`DELETE FROM signal_accumulation`);
  await db.execute(sql`DELETE FROM distress_events`);
  await db.execute(sql`DELETE FROM system_settings`);
  await db.execute(sql`DELETE FROM users`);
  await db.execute(sql`DELETE FROM properties`);

  await db.execute(sql`ALTER TABLE distress_events ENABLE TRIGGER ALL`);
  await db.execute(sql`ALTER TABLE scoring_records ENABLE TRIGGER ALL`);
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
