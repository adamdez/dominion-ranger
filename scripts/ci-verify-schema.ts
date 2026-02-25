import 'dotenv/config';
import pg from 'pg';

const REQUIRED_TABLES = [
  'properties',
  'distress_events',
  'scoring_records',
  'scoring_model_configs',
  'system_settings',
  'lead_instances',
  'promoted_leads',
  'users',
  'sessions',
  'audit_log',
  'activity_log',
  'call_logs',
  'sms_logs',
  'signal_accumulation',
  'pending_scoring',
  'outcome_reservoir',
  'dispositions',
  'inbound_leads',
  'market_configs',
  'adapter_run_history',
  'feature_flags',
  'error_log',
  'property_contacts',
  'tags',
  'lead_instance_tags',
  'tasks',
  'saved_filters',
  'comp_reports',
  'offers',
  'deals',
  'marketing_campaigns',
  'marketing_touchpoints',
];

async function main() {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('ERROR: No database URL set');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: url, max: 1 });

  try {
    const result = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const existing = new Set(result.rows.map((r) => r.tablename));

    const missing: string[] = [];
    for (const table of REQUIRED_TABLES) {
      if (!existing.has(table)) {
        missing.push(table);
      }
    }

    if (missing.length > 0) {
      console.error(`SCHEMA VERIFICATION FAILED — ${missing.length} table(s) missing:`);
      for (const t of missing) {
        console.error(`  - ${t}`);
      }
      process.exit(1);
    }

    console.log(`Schema verification passed: ${REQUIRED_TABLES.length} required tables present`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Schema verification error:', err);
  process.exit(1);
});
