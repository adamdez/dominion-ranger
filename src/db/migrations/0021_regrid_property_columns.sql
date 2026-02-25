-- Regrid parcel enrichment columns on properties
ALTER TABLE properties ADD COLUMN IF NOT EXISTS zoning TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS land_use TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS legal_description TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS acreage NUMERIC(10,4);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS regrid_data JSONB;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS regrid_enriched_at TIMESTAMPTZ;
