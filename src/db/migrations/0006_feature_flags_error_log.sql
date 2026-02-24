-- Feature flags table
CREATE TABLE IF NOT EXISTS feature_flags (
  flag_key VARCHAR(128) PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default flags
INSERT INTO feature_flags (flag_key, enabled, description) VALUES
  ('twilio_dialer', false, 'Enable browser-based Twilio dialer'),
  ('auto_pipeline', false, 'Auto-score and promote on event ingestion'),
  ('sms_outbound', false, 'Allow sending SMS to leads'),
  ('skip_trace_auto', false, 'Auto skip-trace promoted leads'),
  ('spokane_recorder', false, 'Spokane recorder adapter'),
  ('kootenai_recorder', false, 'Kootenai recorder adapter'),
  ('sheriff_sale_adapter', false, 'Sheriff sale adapter'),
  ('cadence_engine', true, 'Auto-create follow-up tasks from dispositions')
ON CONFLICT (flag_key) DO NOTHING;

-- Error log table
CREATE TABLE IF NOT EXISTS error_log (
  error_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type VARCHAR(64) NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  context JSONB DEFAULT '{}',
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_log_type ON error_log(error_type);
CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log(created_at DESC);
