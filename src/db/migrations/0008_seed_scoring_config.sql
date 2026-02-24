-- Migration 0008: Seed scoring_model_configs v1.0.0 with complete configuration
-- This migration is IDEMPOTENT — safe to run multiple times
-- CRITICAL: The scoring engine will fail if ANY of these columns are empty {}

INSERT INTO scoring_model_configs (
  version, confirmed_weights, predictive_weights, decay_config,
  promotion_threshold, tier_thresholds, confidence_config,
  equity_multiplier_config, deal_score_weights, composite_weights,
  suppression_config, active
) 
SELECT 
  '1.0.0',
  '{"NOTICE_OF_DEFAULT":25,"LIS_PENDENS":20,"TAX_DELINQUENCY":15,"PROBATE":30,"BANKRUPTCY":20,"HOA_LIEN":10,"CODE_ENFORCEMENT":8,"NOTICE_OF_TRUSTEE_SALE":25,"TAX_LIEN":12,"MECHANIC_LIEN":8,"JUDGMENT_LIEN":10,"SHERIFF_SALE":30}'::jsonb,
  '{"PREDICTIVE_EQUITY_DECLINE":5,"PREDICTIVE_PAYMENT_STRESS":8,"PREDICTIVE_OWNERSHIP_FATIGUE":6,"PREDICTIVE_VACANCY_SIGNAL":7,"PREDICTIVE_LISTING_WITHDRAWAL":10,"PREDICTIVE_DIVORCE_FILING":12,"PREDICTIVE_CODE_VIOLATION":5,"PREDICTIVE_DEFERRED_MAINTENANCE":4,"PREDICTIVE_ABSENTEE_DISTRESS":6,"PREDICTIVE_MARKET_STRESS":3}'::jsonb,
  '{"halfLifeDays":180,"minWeight":0.1,"maxAgeDays":730}'::jsonb,
  50,
  '{"A":80,"B":60,"C":40}'::jsonb,
  '{"minEvents":1,"recencyBoostDays":30,"recencyBoostMultiplier":1.2,"multiSourceBonus":5,"minSourcesForBonus":2}'::jsonb,
  '{"ranges":[{"min":0,"max":20,"multiplier":0.7},{"min":20,"max":50,"multiplier":1.0},{"min":50,"max":80,"multiplier":1.3},{"min":80,"multiplier":1.5}],"default_multiplier":1.0}'::jsonb,
  '{"equity_weight":0.3,"ownership_weight":0.2,"absentee_weight":15,"mortgage_weight":0.1,"equity_thresholds":{"low":20,"mid":50,"high":80},"ownership_thresholds":{"short_months":24,"long_months":120},"mortgage_severity":{"CURRENT":0,"DELINQUENT":10,"DEFAULT":20,"FORECLOSURE":25,"UNKNOWN":5},"equity_factors":{"high":100,"mid":70,"low":40,"floor":10},"ownership_factors":{"long":80,"short":40,"floor":10}}'::jsonb,
  '{"motivationWeight":0.6,"dealWeight":0.4}'::jsonb,
  '{"mortgage_statuses":["FORECLOSURE_COMPLETE"],"custom_flags":["DNC","LITIGANT","OPT_OUT"]}'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM scoring_model_configs WHERE version = '1.0.0'
);

-- If config exists but has empty columns (from a bad migration), fix them
UPDATE scoring_model_configs SET
  confirmed_weights = '{"NOTICE_OF_DEFAULT":25,"LIS_PENDENS":20,"TAX_DELINQUENCY":15,"PROBATE":30,"BANKRUPTCY":20,"HOA_LIEN":10,"CODE_ENFORCEMENT":8,"NOTICE_OF_TRUSTEE_SALE":25,"TAX_LIEN":12,"MECHANIC_LIEN":8,"JUDGMENT_LIEN":10,"SHERIFF_SALE":30}'::jsonb
WHERE version = '1.0.0' AND (confirmed_weights IS NULL OR confirmed_weights = '{}'::jsonb);

UPDATE scoring_model_configs SET
  predictive_weights = '{"PREDICTIVE_EQUITY_DECLINE":5,"PREDICTIVE_PAYMENT_STRESS":8,"PREDICTIVE_OWNERSHIP_FATIGUE":6,"PREDICTIVE_VACANCY_SIGNAL":7,"PREDICTIVE_LISTING_WITHDRAWAL":10,"PREDICTIVE_DIVORCE_FILING":12,"PREDICTIVE_CODE_VIOLATION":5,"PREDICTIVE_DEFERRED_MAINTENANCE":4,"PREDICTIVE_ABSENTEE_DISTRESS":6,"PREDICTIVE_MARKET_STRESS":3}'::jsonb
WHERE version = '1.0.0' AND (predictive_weights IS NULL OR predictive_weights = '{}'::jsonb);

UPDATE scoring_model_configs SET
  decay_config = '{"halfLifeDays":180,"minWeight":0.1,"maxAgeDays":730}'::jsonb
WHERE version = '1.0.0' AND (decay_config IS NULL OR decay_config = '{}'::jsonb);

UPDATE scoring_model_configs SET
  tier_thresholds = '{"A":80,"B":60,"C":40}'::jsonb
WHERE version = '1.0.0' AND (tier_thresholds IS NULL OR tier_thresholds = '{}'::jsonb);

UPDATE scoring_model_configs SET
  confidence_config = '{"minEvents":1,"recencyBoostDays":30,"recencyBoostMultiplier":1.2,"multiSourceBonus":5,"minSourcesForBonus":2}'::jsonb
WHERE version = '1.0.0' AND (confidence_config IS NULL OR confidence_config = '{}'::jsonb);

UPDATE scoring_model_configs SET
  equity_multiplier_config = '{"ranges":[{"min":0,"max":20,"multiplier":0.7},{"min":20,"max":50,"multiplier":1.0},{"min":50,"max":80,"multiplier":1.3},{"min":80,"multiplier":1.5}],"default_multiplier":1.0}'::jsonb
WHERE version = '1.0.0' AND (equity_multiplier_config IS NULL OR equity_multiplier_config = '{}'::jsonb OR NOT (equity_multiplier_config ? 'ranges'));

UPDATE scoring_model_configs SET
  deal_score_weights = '{"equity_weight":0.3,"ownership_weight":0.2,"absentee_weight":15,"mortgage_weight":0.1,"equity_thresholds":{"low":20,"mid":50,"high":80},"ownership_thresholds":{"short_months":24,"long_months":120},"mortgage_severity":{"CURRENT":0,"DELINQUENT":10,"DEFAULT":20,"FORECLOSURE":25,"UNKNOWN":5},"equity_factors":{"high":100,"mid":70,"low":40,"floor":10},"ownership_factors":{"long":80,"short":40,"floor":10}}'::jsonb
WHERE version = '1.0.0' AND (deal_score_weights IS NULL OR deal_score_weights = '{}'::jsonb OR NOT (deal_score_weights ? 'equity_thresholds'));

UPDATE scoring_model_configs SET
  composite_weights = '{"motivationWeight":0.6,"dealWeight":0.4}'::jsonb
WHERE version = '1.0.0' AND (composite_weights IS NULL OR composite_weights = '{}'::jsonb);

UPDATE scoring_model_configs SET
  suppression_config = '{"mortgage_statuses":["FORECLOSURE_COMPLETE"],"custom_flags":["DNC","LITIGANT","OPT_OUT"]}'::jsonb
WHERE version = '1.0.0' AND (suppression_config IS NULL OR suppression_config = '{}'::jsonb);
