-- Charter Section VIII: Compliance columns for DNC, Litigant, Opt-out
-- Enables property-level compliance flags (agent-set) and wiring to dial queue

ALTER TABLE properties ADD COLUMN IF NOT EXISTS dnc_flag BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS litigant_flag BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS opt_out_flag BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_properties_dnc_flag ON properties (dnc_flag) WHERE dnc_flag = true;
CREATE INDEX IF NOT EXISTS idx_properties_litigant_flag ON properties (litigant_flag) WHERE litigant_flag = true;
CREATE INDEX IF NOT EXISTS idx_properties_opt_out_flag ON properties (opt_out_flag) WHERE opt_out_flag = true;
