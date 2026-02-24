-- Phase 4A: Offer Builder & Tracking
CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Associations
  dominion_lead_id UUID NOT NULL REFERENCES properties(dominion_lead_id),
  property_id UUID NOT NULL,
  lead_instance_id UUID REFERENCES lead_instances(lead_instance_id),
  created_by TEXT NOT NULL REFERENCES users(user_id),

  -- Property snapshot (frozen at offer time)
  property_address TEXT NOT NULL,
  property_city TEXT,
  property_state TEXT,
  property_zip TEXT,
  property_county TEXT,
  owner_name TEXT,

  -- Offer terms
  offer_amount_cents BIGINT NOT NULL,
  earnest_money_cents BIGINT NOT NULL DEFAULT 100000,
  closing_days INTEGER NOT NULL DEFAULT 21,
  inspection_days INTEGER NOT NULL DEFAULT 10,
  offer_expiry_days INTEGER NOT NULL DEFAULT 7,
  contingencies TEXT[] DEFAULT ARRAY['inspection', 'title', 'financing'],
  additional_terms TEXT,

  -- Comp justification (optional)
  comp_report_id UUID,
  arv_cents BIGINT,
  rehab_estimate_cents BIGINT,
  max_offer_cents BIGINT,
  assignment_fee_cents BIGINT DEFAULT 1000000,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'sent', 'viewed', 'countered',
    'accepted', 'rejected', 'expired', 'withdrawn'
  )),

  -- Counter offer tracking
  counter_amount_cents BIGINT,
  counter_notes TEXT,

  -- Dates
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  -- PDF
  pdf_url TEXT,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offers_property ON offers(property_id);
CREATE INDEX IF NOT EXISTS idx_offers_dominion_lead ON offers(dominion_lead_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status) WHERE status NOT IN ('expired', 'rejected', 'withdrawn');
CREATE INDEX IF NOT EXISTS idx_offers_created_by ON offers(created_by);
CREATE INDEX IF NOT EXISTS idx_offers_expires ON offers(expires_at) WHERE status = 'sent';
