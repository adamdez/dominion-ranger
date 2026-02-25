import { sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';

let schemaEnsured = false;

async function ensureErrorLogSchema(): Promise<void> {
  if (schemaEnsured) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS error_log (
      error_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      error_type VARCHAR(64) NOT NULL DEFAULT 'SYSTEM_ERROR',
      message TEXT,
      stack TEXT,
      error_message TEXT,
      error_stack TEXT,
      context JSONB DEFAULT '{}'::jsonb,
      resolved BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await db.execute(sql`ALTER TABLE error_log ADD COLUMN IF NOT EXISTS error_message TEXT`);
  await db.execute(sql`ALTER TABLE error_log ADD COLUMN IF NOT EXISTS error_stack TEXT`);
  await db.execute(sql`ALTER TABLE error_log ADD COLUMN IF NOT EXISTS context JSONB DEFAULT '{}'::jsonb`);
  await db.execute(sql`ALTER TABLE error_log ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()`);
  await db.execute(sql`ALTER TABLE error_log ADD COLUMN IF NOT EXISTS message TEXT`);
  await db.execute(sql`ALTER TABLE error_log ADD COLUMN IF NOT EXISTS stack TEXT`);
  await db.execute(sql`ALTER TABLE error_log ADD COLUMN IF NOT EXISTS error_type VARCHAR(64) DEFAULT 'SYSTEM_ERROR'`);
  await db.execute(sql`ALTER TABLE error_log ADD COLUMN IF NOT EXISTS resolved BOOLEAN DEFAULT false`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log(created_at DESC)`);

  schemaEnsured = true;
}

export async function logSystemError(error: Error, context: string): Promise<void> {
  try {
    await ensureErrorLogSchema();

    await db.execute(sql`
      INSERT INTO error_log (error_type, message, stack, error_message, error_stack, context, created_at)
      VALUES (
        'SYSTEM_ERROR',
        ${error.message},
        ${error.stack ?? null},
        ${error.message},
        ${error.stack ?? null},
        ${JSON.stringify({ context })}::jsonb,
        now()
      )
    `);
  } catch {
    // Avoid recursive failures inside the global error handler.
  }
}

export async function getRecentSystemErrors(limit = 50) {
  await ensureErrorLogSchema();

  const result = await db.execute(sql`
    SELECT
      error_id AS "errorId",
      COALESCE(error_message, message, 'Unknown error') AS "errorMessage",
      COALESCE(error_stack, stack) AS "errorStack",
      context,
      created_at AS "createdAt"
    FROM error_log
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);

  return ((result as unknown as { rows?: Record<string, unknown>[] }).rows ?? []) as Array<{
    errorId: string;
    errorMessage: string;
    errorStack: string | null;
    context: Record<string, unknown> | null;
    createdAt: string;
  }>;
}
