ALTER TABLE "scoring_model_configs" ADD COLUMN "equity_multiplier_config" jsonb;--> statement-breakpoint
ALTER TABLE "scoring_model_configs" ADD COLUMN "deal_score_weights" jsonb;--> statement-breakpoint
ALTER TABLE "scoring_model_configs" ADD COLUMN "suppression_config" jsonb;--> statement-breakpoint
ALTER TABLE "scoring_records" ADD COLUMN "motivation_score" numeric(7, 4);--> statement-breakpoint
ALTER TABLE "scoring_records" ADD COLUMN "deal_score" numeric(7, 4);