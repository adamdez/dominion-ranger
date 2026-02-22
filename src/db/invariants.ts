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

  await db.execute(sql`
    DROP TRIGGER IF EXISTS distress_events_no_update ON distress_events
  `);
  await db.execute(sql`
    CREATE TRIGGER distress_events_no_update
      BEFORE UPDATE ON distress_events
      FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation()
  `);

  await db.execute(sql`
    DROP TRIGGER IF EXISTS distress_events_no_delete ON distress_events
  `);
  await db.execute(sql`
    CREATE TRIGGER distress_events_no_delete
      BEFORE DELETE ON distress_events
      FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation()
  `);

  await db.execute(sql`
    DROP TRIGGER IF EXISTS scoring_records_no_update ON scoring_records
  `);
  await db.execute(sql`
    CREATE TRIGGER scoring_records_no_update
      BEFORE UPDATE ON scoring_records
      FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation()
  `);

  await db.execute(sql`
    DROP TRIGGER IF EXISTS scoring_records_no_delete ON scoring_records
  `);
  await db.execute(sql`
    CREATE TRIGGER scoring_records_no_delete
      BEFORE DELETE ON scoring_records
      FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation()
  `);

  logger.info('Append-only invariants applied to distress_events and scoring_records');
}
