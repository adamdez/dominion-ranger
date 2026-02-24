-- Migration 0008: Seed default scoring model config if none exists
-- Idempotent: uses WHERE NOT EXISTS to prevent duplicates

INSERT INTO scoring_model_configs (
  version, confirmed_weights, predictive_weights, decay_config,
  promotion_threshold, tier_thresholds, confidence_config,
  equity_multiplier_config, deal_score_weights, composite_weights,
  suppression_config, active
) SELECT
  '1.0.0',
  '{"NOTICE_OF_DEFAULT":25,"LIS_PENDENS":20,"TAX_DELINQUENCY":15,"PROBATE":30,"BANKRUPTCY":20,"HOA_LIEN":10,"CODE_ENFORCEMENT":8,"NOTICE_OF_TRUSTEE_SALE":25,"TAX_LIEN":12,"MECHANIC_LIEN":8,"JUDGMENT_LIEN":10}'::jsonb,
  '{"PREDICTIVE_EQUITY_DECLINE":5,"PREDICTIVE_PAYMENT_STRESS":8,"PREDICTIVE_OWNERSHIP_FATIGUE":6,"PREDICTIVE_VACANCY_SIGNAL":7,"PREDICTIVE_LISTING_WITHDRAWAL":10,"PREDICTIVE_DIVORCE_FILING":12,"PREDICTIVE_CODE_VIOLATION":5,"PREDICTIVE_DEFERRED_MAINTENANCE":4,"PREDICTIVE_ABSENTEE_DISTRESS":6,"PREDICTIVE_MARKET_STRESS":3}'::jsonb,
  '{"halfLifeDays":180,"minWeight":0.1}'::jsonb,
  50,
  '{"A":80,"B":60,"C":40}'::jsonb,
  '{"minEvents":1,"recencyBoostDays":30,"recencyBoostMultiplier":1.2}'::jsonb,
  '{"ranges":[{"min":0,"max":20,"multiplier":0.5},{"min":20,"max":40,"multiplier":0.8},{"min":40,"max":60,"multiplier":1.0},{"min":60,"max":80,"multiplier":1.2},{"min":80,"max":100,"multiplier":1.5}],"default_multiplier":1.0}'::jsonb,
  '{"equity_weight":0.3,"ownership_weight":0.2,"absentee_weight":15,"mortgage_weight":0.1,"equity_thresholds":{"low":20,"mid":50,"high":80},"ownership_thresholds":{"short_months":24,"long_months":120},"mortgage_severity":{"CURRENT":0,"DELINQUENT":10,"DEFAULT":20,"FORECLOSURE":25,"UNKNOWN":5},"equity_factors":{"high":100,"mid":70,"low":40,"floor":10},"ownership_factors":{"long":80,"short":40,"floor":10}}'::jsonb,
  '{"motivationWeight":0.6,"dealWeight":0.4}'::jsonb,
  '{"mortgage_statuses":["FORECLOSURE_COMPLETE"],"custom_flags":["DNC","LITIGANT","OPT_OUT"]}'::jsonb,
  true
WHERE NOT EXISTS (SELECT 1 FROM scoring_model_configs WHERE active = true);

-- Enforce append-only on activity_log (same pattern as distress_events/scoring_records)
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
