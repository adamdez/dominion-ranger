import { sql } from 'drizzle-orm';
import { db } from './connection.js';
import { logger } from '../config/logger.js';

/**
 * Apply database-level append-only invariants required by Charter v2.3.
 *
 * Creates triggers that prevent UPDATE and DELETE on:
 *   - distress_events  (Charter invariant #1)
 *   - scoring_records  (Charter invariant #2)
 *
 * Idempotent: safe to call on every startup.
 */
export async function applyAppendOnlyInvariants(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION prevent_append_only_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Charter violation: % on append-only table "%" is prohibited',
          TG_OP, TG_TABLE_NAME;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
  } catch {
    // Function may already exist from a concurrent test process
  }

  const triggers = [
    { table: 'distress_events', name: 'distress_events_no_update', op: 'UPDATE' },
    { table: 'distress_events', name: 'distress_events_no_delete', op: 'DELETE' },
    { table: 'scoring_records', name: 'scoring_records_no_update', op: 'UPDATE' },
    { table: 'scoring_records', name: 'scoring_records_no_delete', op: 'DELETE' },
  ];

  for (const t of triggers) {
    try {
      await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${t.name} ON ${t.table}`));
      await db.execute(sql.raw(
        `CREATE TRIGGER ${t.name} BEFORE ${t.op} ON ${t.table} FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation()`,
      ));
    } catch {
      // Trigger may already exist from a concurrent process
    }
  }

  logger.info('Append-only invariants applied to distress_events and scoring_records');
}
