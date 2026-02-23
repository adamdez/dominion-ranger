-- Phase 2.5: Rollup aggregation tables
-- These are materialized aggregations rebuilt nightly from activity_log + deals.
-- All are idempotent (UPSERT on rebuild) and deterministic (Charter invariant).

CREATE TABLE IF NOT EXISTS "daily_metrics" (
	"date" date PRIMARY KEY NOT NULL,
	"dials" integer DEFAULT 0,
	"connections" integer DEFAULT 0,
	"conversations" integer DEFAULT 0,
	"appointments" integer DEFAULT 0,
	"offers" integer DEFAULT 0,
	"contracts" integer DEFAULT 0,
	"deals" integer DEFAULT 0,
	"revenue_cents" integer DEFAULT 0,
	"inbound_leads" integer DEFAULT 0,
	"stale_leads" integer DEFAULT 0,
	"total_spend_cents" integer DEFAULT 0,
	"new_promoted_leads" integer DEFAULT 0,
	"pipeline_value_cents" integer DEFAULT 0,
	"avg_composite_score" real,
	"speed_to_contact_median_min" real,
	"total_talk_time_seconds" integer DEFAULT 0,
	"cost_per_deal_cents" integer
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weekly_funnel_metrics" (
	"week_start" date NOT NULL,
	"stage" varchar(32) NOT NULL,
	"count" integer DEFAULT 0,
	"conversion_rate" real,
	CONSTRAINT "weekly_funnel_metrics_week_start_stage_pk" PRIMARY KEY("week_start","stage")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_weekly_metrics" (
	"week_start" date NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"dials" integer DEFAULT 0,
	"connections" integer DEFAULT 0,
	"conversations" integer DEFAULT 0,
	"appointments" integer DEFAULT 0,
	"offers" integer DEFAULT 0,
	"deals" integer DEFAULT 0,
	"revenue_cents" integer DEFAULT 0,
	"avg_call_duration_seconds" integer,
	"callback_compliance_pct" real,
	"offer_followthrough_pct" real,
	CONSTRAINT "agent_weekly_metrics_week_start_user_id_pk" PRIMARY KEY("week_start","user_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_performance_metrics" (
	"period_start" date NOT NULL,
	"channel_id" uuid NOT NULL,
	"spend_cents" integer DEFAULT 0,
	"leads" integer DEFAULT 0,
	"conversations" integer DEFAULT 0,
	"deals" integer DEFAULT 0,
	"revenue_cents" integer DEFAULT 0,
	"roas" real,
	"cost_per_deal" real,
	"cost_per_lead" real,
	"cost_per_conversation" real,
	CONSTRAINT "channel_performance_metrics_period_start_channel_id_pk" PRIMARY KEY("period_start","channel_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scoring_performance_metrics" (
	"period_start" date NOT NULL,
	"tier" varchar(2) NOT NULL,
	"promoted" integer DEFAULT 0,
	"contacted" integer DEFAULT 0,
	"closed" integer DEFAULT 0,
	"conversion_rate" real,
	"avg_fee_cents" integer,
	CONSTRAINT "scoring_performance_metrics_period_start_tier_pk" PRIMARY KEY("period_start","tier")
);
