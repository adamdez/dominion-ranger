-- Comp Reports table — Phase 4B: Comparable Sales Engine
CREATE TABLE IF NOT EXISTS comp_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dominion_lead_id UUID NOT NULL REFERENCES properties(dominion_lead_id),

  -- Subject property snapshot
  subject_address TEXT NOT NULL,
  subject_city TEXT,
  subject_state TEXT,
  subject_zip TEXT,
  subject_beds INTEGER,
  subject_baths NUMERIC(3,1),
  subject_sqft INTEGER,
  subject_lot_sqft INTEGER,
  subject_year_built INTEGER,
  subject_property_type TEXT,

  -- Valuation results
  estimated_value_cents BIGINT,
  estimated_value_low_cents BIGINT,
  estimated_value_high_cents BIGINT,
  confidence_score NUMERIC(5,2),

  -- Comp data (cached from BatchData)
  comps JSONB NOT NULL DEFAULT '[]',
  comp_count INTEGER NOT NULL DEFAULT 0,
  avg_price_per_sqft_cents BIGINT,
  median_sale_price_cents BIGINT,

  -- Wholesale calculations
  arv_cents BIGINT,
  max_offer_cents BIGINT,
  rehab_estimate_cents BIGINT DEFAULT 0,
  assignment_fee_cents BIGINT DEFAULT 500000,

  -- Search parameters used
  search_radius_miles NUMERIC(4,2) DEFAULT 0.5,
  search_months INTEGER DEFAULT 6,

  -- Metadata
  batchdata_request_id TEXT,
  raw_response JSONB,
  generated_by TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comp_reports_dominion_lead_id
  ON comp_reports(dominion_lead_id);

CREATE INDEX IF NOT EXISTS idx_comp_reports_created_at
  ON comp_reports(created_at DESC);

-- Feature flag for comp engine
INSERT INTO feature_flags (flag_key, enabled, description)
VALUES ('comp_engine', false, 'Enable BatchData comp engine for comparable sales')
ON CONFLICT (flag_key) DO NOTHING;
