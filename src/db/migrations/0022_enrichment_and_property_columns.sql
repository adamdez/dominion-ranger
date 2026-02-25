-- Enrichment and property attribute columns (BatchData/Regrid outputs)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS enrichment_data JSONB;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS bedrooms INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS bathrooms NUMERIC(3,1);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS sqft INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS year_built INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS lot_sqft INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS last_sale_date DATE;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS last_sale_price_cents BIGINT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS assessed_value_cents BIGINT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS market_value_cents BIGINT;
