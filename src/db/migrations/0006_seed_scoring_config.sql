-- Migration 0006: Seed scoring config + activity_log append-only
-- Idempotent: uses WHERE NOT EXISTS and CREATE OR REPLACE

-- Seed default scoring model config if none exists
INSERT INTO scoring_model_configs (
  version, confirmed_weights, predictive_weights, decay_config,
  promotion_threshold, tier_thresholds, confidence_config,
  equity_multiplier_config, deal_score_weights, composite_weights,
  suppression_config, active
) SELECT
  '1.0.0',
  '{"NOTICE_OF_DEFAULT":{"base_weight":25,"half_life_days":180,"severity":1.2},"LIS_PENDENS":{"base_weight":20,"half_life_days":180,"severity":1.1},"TAX_DELINQUENCY":{"base_weight":15,"half_life_days":270,"severity":1.0},"PROBATE":{"base_weight":30,"half_life_days":365,"severity":1.3},"BANKRUPTCY":{"base_weight":20,"half_life_days":270,"severity":1.1},"HOA_LIEN":{"base_weight":10,"half_life_days":180,"severity":0.8},"CODE_ENFORCEMENT":{"base_weight":8,"half_life_days":180,"severity":0.7},"NOTICE_OF_TRUSTEE_SALE":{"base_weight":25,"half_life_days":120,"severity":1.3},"TAX_LIEN":{"base_weight":12,"half_life_days":270,"severity":0.9},"MECHANIC_LIEN":{"base_weight":8,"half_life_days":180,"severity":0.7},"JUDGMENT_LIEN":{"base_weight":10,"half_life_days":180,"severity":0.8}}'::jsonb,
  '{"PREDICTIVE_EQUITY_DECLINE":{"base_weight":5,"half_life_days":180,"severity":0.5},"PREDICTIVE_PAYMENT_STRESS":{"base_weight":8,"half_life_days":180,"severity":0.6},"PREDICTIVE_OWNERSHIP_FATIGUE":{"base_weight":6,"half_life_days":365,"severity":0.5},"PREDICTIVE_VACANCY_SIGNAL":{"base_weight":7,"half_life_days":180,"severity":0.6},"PREDICTIVE_LISTING_WITHDRAWAL":{"base_weight":10,"half_life_days":90,"severity":0.8},"PREDICTIVE_DIVORCE_FILING":{"base_weight":12,"half_life_days":180,"severity":0.9},"PREDICTIVE_CODE_VIOLATION":{"base_weight":5,"half_life_days":180,"severity":0.5},"PREDICTIVE_DEFERRED_MAINTENANCE":{"base_weight":4,"half_life_days":365,"severity":0.4},"PREDICTIVE_ABSENTEE_DISTRESS":{"base_weight":6,"half_life_days":365,"severity":0.5},"PREDICTIVE_MARKET_STRESS":{"base_weight":3,"half_life_days":180,"severity":0.3}}'::jsonb,
  '{"function":"exponential","floor":0.1}'::jsonb,
  50,
  '{"A":80,"B":60,"C":40}'::jsonb,
  '{"min_signals_for_high":5,"diversity_bonus":0.1,"confirmed_presence_bonus":0.15,"source_count_weight":0.05}'::jsonb,
  '{"ranges":[{"min":0,"max":20,"multiplier":0.5},{"min":20,"max":40,"multiplier":0.8},{"min":40,"max":60,"multiplier":1.0},{"min":60,"max":80,"multiplier":1.2},{"min":80,"multiplier":1.5}],"default_multiplier":1.0}'::jsonb,
  '{"equity_weight":0.3,"ownership_weight":0.2,"absentee_weight":15,"mortgage_weight":0.1,"equity_thresholds":{"low":20,"mid":50,"high":80},"ownership_thresholds":{"short_months":24,"long_months":120},"mortgage_severity":{"CURRENT":0,"DELINQUENT":10,"DEFAULT":20,"FORECLOSURE":25,"UNKNOWN":5},"equity_factors":{"high":100,"mid":70,"low":40,"floor":10},"ownership_factors":{"long":80,"short":40,"floor":10}}'::jsonb,
  '{"motivation_weight":0.6,"deal_weight":0.4}'::jsonb,
  '{"mortgage_statuses":["FORECLOSURE_COMPLETE"],"custom_flags":["DNC","LITIGANT","OPT_OUT"]}'::jsonb,
  true
WHERE NOT EXISTS (SELECT 1 FROM scoring_model_configs WHERE active = true);

-- Apply append-only trigger to activity_log (matches distress_events/scoring_records pattern)
CREATE OR REPLACE FUNCTION prevent_append_only_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Charter violation: % on append-only table "%" is prohibited',
    TG_OP, TG_TABLE_NAME;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS activity_log_no_update ON activity_log;
CREATE TRIGGER activity_log_no_update
  BEFORE UPDATE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

DROP TRIGGER IF EXISTS activity_log_no_delete ON activity_log;
CREATE TRIGGER activity_log_no_delete
  BEFORE DELETE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();
