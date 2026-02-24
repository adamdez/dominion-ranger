-- Phase E: Tighten schema nullability for scoring config JSONB columns
-- Code crashes if these are null; ensure defaults and NOT NULL

UPDATE scoring_model_configs
SET equity_multiplier_config = '{"ranges":[{"min":0,"max":100,"multiplier":1.0}],"default_multiplier":1.0}'::jsonb
WHERE equity_multiplier_config IS NULL;

UPDATE scoring_model_configs
SET deal_score_weights = '{"equity_weight":0.3,"ownership_weight":0.2,"mortgage_weight":0.1}'::jsonb
WHERE deal_score_weights IS NULL;

UPDATE scoring_model_configs
SET composite_weights = '{"motivationWeight":0.6,"dealWeight":0.4}'::jsonb
WHERE composite_weights IS NULL;

UPDATE scoring_model_configs
SET suppression_config = '{"mortgage_statuses":[],"custom_flags":[]}'::jsonb
WHERE suppression_config IS NULL;

ALTER TABLE scoring_model_configs ALTER COLUMN equity_multiplier_config SET DEFAULT '{}'::jsonb;
ALTER TABLE scoring_model_configs ALTER COLUMN deal_score_weights SET DEFAULT '{}'::jsonb;
ALTER TABLE scoring_model_configs ALTER COLUMN composite_weights SET DEFAULT '{}'::jsonb;
ALTER TABLE scoring_model_configs ALTER COLUMN suppression_config SET DEFAULT '{}'::jsonb;

-- Only set NOT NULL if no rows would violate (all nulls have been updated)
ALTER TABLE scoring_model_configs ALTER COLUMN equity_multiplier_config SET NOT NULL;
ALTER TABLE scoring_model_configs ALTER COLUMN deal_score_weights SET NOT NULL;
ALTER TABLE scoring_model_configs ALTER COLUMN composite_weights SET NOT NULL;
ALTER TABLE scoring_model_configs ALTER COLUMN suppression_config SET NOT NULL;
