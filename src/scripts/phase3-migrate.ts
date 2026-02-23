/**
 * Phase 3 migration script.
 * Creates new tables for property contacts, tags, tasks, saved filters,
 * and adds deal_stage to lead_instances.
 *
 * Idempotent — safe to run multiple times.
 */
import 'dotenv/config';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL not set');

async function run() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    // 1. Enums
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE task_status AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE task_type AS ENUM ('CALLBACK', 'FOLLOW_UP', 'RESEARCH', 'SEND_OFFER', 'SITE_VISIT', 'GENERAL');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // 2. property_contacts
    await client.query(`
      CREATE TABLE IF NOT EXISTS property_contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dominion_lead_id UUID NOT NULL REFERENCES properties(dominion_lead_id) ON DELETE CASCADE,
        contact_name VARCHAR(256),
        contact_type VARCHAR(32) NOT NULL DEFAULT 'OWNER',
        phone VARCHAR(20),
        phone_type VARCHAR(16),
        phone_status VARCHAR(16) DEFAULT 'UNKNOWN',
        email VARCHAR(256),
        dnd_calls BOOLEAN DEFAULT false,
        dnd_sms BOOLEAN DEFAULT false,
        dnd_email BOOLEAN DEFAULT false,
        source VARCHAR(32),
        is_primary BOOLEAN DEFAULT false,
        is_owner_match BOOLEAN DEFAULT false,
        raw_data JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_property_contacts_lead ON property_contacts(dominion_lead_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_property_contacts_phone ON property_contacts(phone);`);

    // 3. tags
    await client.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(64) NOT NULL,
        color VARCHAR(7) DEFAULT '#6B7280',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name ON tags(name);`);

    // 4. lead_instance_tags
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_instance_tags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_instance_id UUID NOT NULL,
        tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        applied_by VARCHAR(128),
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_tags_unique ON lead_instance_tags(lead_instance_id, tag_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lead_tags_lead ON lead_instance_tags(lead_instance_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lead_tags_tag ON lead_instance_tags(tag_id);`);

    // 5. tasks
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(256) NOT NULL,
        description TEXT,
        task_type task_type NOT NULL DEFAULT 'GENERAL',
        status task_status NOT NULL DEFAULT 'PENDING',
        lead_instance_id UUID,
        dominion_lead_id UUID,
        assigned_to VARCHAR(128),
        created_by VARCHAR(128),
        due_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks(lead_instance_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);`);

    // 6. saved_filters
    await client.query(`
      CREATE TABLE IF NOT EXISTS saved_filters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(128) NOT NULL,
        description VARCHAR(512),
        filter_config JSONB NOT NULL,
        is_default BOOLEAN DEFAULT false,
        created_by VARCHAR(128),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 7. Add deal_stage to lead_instances
    await client.query(`ALTER TABLE lead_instances ADD COLUMN IF NOT EXISTS deal_stage VARCHAR(32) DEFAULT 'NEW_LEAD';`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lead_instances_deal_stage ON lead_instances(deal_stage);`);

    // 8. Seed default tags
    await client.query(`
      INSERT INTO tags (name, color) VALUES
        ('Hot Lead', '#EF4444'),
        ('Callback', '#F59E0B'),
        ('Lowball Offer', '#8B5CF6'),
        ('Title Issue', '#EC4899'),
        ('Vacant', '#10B981'),
        ('Zombie', '#6B7280'),
        ('Not Interested', '#374151')
      ON CONFLICT (name) DO NOTHING;
    `);

    // 9. Seed default saved filters
    await client.query(`
      INSERT INTO saved_filters (name, description, filter_config, is_default) VALUES
        ('Hot Leads', 'Dial-ready and in-conversation leads with high scores', '{"statuses": ["DIAL_READY","IN_CONVERSATION"], "minScore": 80}', true),
        ('Needs Skip Trace', 'Promoted/assigned leads without phone data', '{"hasPhone": false, "statuses": ["PROMOTED","ASSIGNED"]}', true),
        ('Callbacks Due', 'Leads with pending callback tasks', '{"hasPendingTask": true, "taskType": "CALLBACK"}', true),
        ('Dead/Closed', 'Terminal leads', '{"statuses": ["DEAD","CLOSED"]}', true),
        ('High Equity', 'Leads with 50%+ estimated equity', '{"minEquity": 50}', true)
      ON CONFLICT DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('Phase 3 migration complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
