-- Add funnel_stage to lead_instances
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'lead_instances' AND column_name = 'funnel_stage'
  ) THEN
    ALTER TABLE lead_instances ADD COLUMN funnel_stage TEXT NOT NULL DEFAULT 'prospect';
  END IF;
END $$;

-- Add check constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE constraint_name = 'lead_instances_funnel_stage_check'
  ) THEN
    ALTER TABLE lead_instances ADD CONSTRAINT lead_instances_funnel_stage_check 
      CHECK (funnel_stage IN ('prospect', 'lead', 'paid_lead', 'negotiation', 'disposition', 'declined'));
  END IF;
END $$;

-- Track decline history
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'lead_instances' AND column_name = 'declined_count'
  ) THEN
    ALTER TABLE lead_instances ADD COLUMN declined_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'lead_instances' AND column_name = 'declined_at'
  ) THEN
    ALTER TABLE lead_instances ADD COLUMN declined_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'lead_instances' AND column_name = 'previous_funnel_stage'
  ) THEN
    ALTER TABLE lead_instances ADD COLUMN previous_funnel_stage TEXT;
  END IF;
END $$;

-- Index for querying by funnel stage
CREATE INDEX IF NOT EXISTS idx_lead_instances_funnel_stage ON lead_instances(funnel_stage);
