import 'dotenv/config';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Set DATABASE_URL');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

const statements = [
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority VARCHAR(10) NOT NULL DEFAULT 'NORMAL'`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source VARCHAR(64) NOT NULL DEFAULT 'MANUAL'`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cadence_rule VARCHAR(64)`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attempt_number INT DEFAULT 1`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_assigned_due_pending ON tasks(assigned_to, due_at) WHERE status = 'PENDING'`,
];

async function main() {
  const client = await pool.connect();
  try {
    for (const stmt of statements) {
      await client.query(stmt);
      console.log(`OK: ${stmt.slice(0, 60)}...`);
    }
    console.log('\nMigration 0009 applied successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
