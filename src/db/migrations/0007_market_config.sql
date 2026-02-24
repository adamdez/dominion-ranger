-- Market configuration for multi-county support
CREATE TABLE IF NOT EXISTS market_configs (
  market_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  county VARCHAR(128) NOT NULL,
  state VARCHAR(2) NOT NULL,
  fips_code VARCHAR(10),
  county_recorder_url TEXT,
  active BOOLEAN DEFAULT true,
  adapter_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(county, state)
);

INSERT INTO market_configs (county, state, fips_code, county_recorder_url, adapter_config) VALUES
('SPOKANE', 'WA', '53063', 'https://recording.spokanecounty.org/recorder/web/loginPOST.jsp?guest=true', '{"regrid_geoid": "53063"}'),
('KOOTENAI', 'ID', '16055', 'https://www.kcgov.us/370/Research-Recorders-Public-Records', '{"regrid_geoid": "16055"}')
ON CONFLICT (county, state) DO NOTHING;

-- Adapter run history for monitoring
CREATE TABLE IF NOT EXISTS adapter_run_history (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_name VARCHAR(64) NOT NULL,
  market_id UUID REFERENCES market_configs(market_id),
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  records_processed INT DEFAULT 0,
  events_created INT DEFAULT 0,
  events_deduplicated INT DEFAULT 0,
  errors INT DEFAULT 0,
  error_details JSONB,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INT
);

CREATE INDEX IF NOT EXISTS idx_adapter_run_adapter ON adapter_run_history(adapter_name);
CREATE INDEX IF NOT EXISTS idx_adapter_run_started ON adapter_run_history(started_at DESC);

-- Add SHERIFF_SALE event type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SHERIFF_SALE' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'event_type')) THEN
    ALTER TYPE event_type ADD VALUE 'SHERIFF_SALE';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
