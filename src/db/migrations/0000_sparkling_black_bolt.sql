CREATE TYPE "public"."event_layer" AS ENUM('predictive', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('NOTICE_OF_DEFAULT', 'LIS_PENDENS', 'TAX_DELINQUENCY', 'PROBATE', 'BANKRUPTCY', 'HOA_LIEN', 'CODE_ENFORCEMENT', 'NOTICE_OF_TRUSTEE_SALE', 'TAX_LIEN', 'MECHANIC_LIEN', 'JUDGMENT_LIEN', 'PREDICTIVE_EQUITY_DECLINE', 'PREDICTIVE_PAYMENT_STRESS', 'PREDICTIVE_OWNERSHIP_FATIGUE', 'PREDICTIVE_VACANCY_SIGNAL', 'PREDICTIVE_LISTING_WITHDRAWAL', 'PREDICTIVE_DIVORCE_FILING', 'PREDICTIVE_CODE_VIOLATION', 'PREDICTIVE_DEFERRED_MAINTENANCE', 'PREDICTIVE_ABSENTEE_DISTRESS', 'PREDICTIVE_MARKET_STRESS');--> statement-breakpoint
CREATE TYPE "public"."freshness_category" AS ENUM('same_day', '1_3_days', '4_7_days', 'stale');--> statement-breakpoint
CREATE TYPE "public"."marketing_tier" AS ENUM('A', 'B', 'C');--> statement-breakpoint
CREATE TYPE "public"."mortgage_status" AS ENUM('CURRENT', 'LATE_30', 'LATE_60', 'LATE_90', 'DEFAULT', 'FORECLOSURE', 'FREE_AND_CLEAR', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."outcome_status" AS ENUM('PROMOTED', 'CLAIMED', 'DIALED', 'OFFER_SENT', 'CONTRACTED', 'CLOSED', 'DEAD', 'LISTED', 'SOLD');--> statement-breakpoint
CREATE TYPE "public"."urgency_level" AS ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'FIELD', 'READONLY');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"log_id" uuid PRIMARY KEY NOT NULL,
	"dominion_lead_id" uuid,
	"user_id" varchar(128),
	"action_type" varchar(64) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "distress_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"dominion_lead_id" uuid NOT NULL,
	"event_type" "event_type" NOT NULL,
	"event_layer" "event_layer" NOT NULL,
	"trigger_event_date" timestamp with time zone,
	"filing_date" timestamp with time zone,
	"recorded_date" timestamp with time zone,
	"source_name" varchar(128) NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"source_url" text,
	"source_legitimacy_notes" text,
	"freshness_category" "freshness_category",
	"reliability_score" numeric(3, 2) NOT NULL,
	"raw_event_payload" jsonb,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outcome_reservoir" (
	"dominion_lead_id" uuid PRIMARY KEY NOT NULL,
	"outcome_status" "outcome_status" DEFAULT 'PROMOTED' NOT NULL,
	"contacted_at" timestamp with time zone,
	"contract_signed_at" timestamp with time zone,
	"deal_closed_at" timestamp with time zone,
	"assignment_fee" numeric(12, 2),
	"days_to_contract" integer,
	"lost_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promoted_leads" (
	"promotion_id" uuid PRIMARY KEY NOT NULL,
	"dominion_lead_id" uuid NOT NULL,
	"composite_score" numeric(7, 4) NOT NULL,
	"confidence_score" numeric(5, 4) NOT NULL,
	"score_model_version" varchar(32) NOT NULL,
	"marketing_tier" "marketing_tier" NOT NULL,
	"urgency_level" "urgency_level" NOT NULL,
	"recommended_action" text,
	"signal_summary" jsonb,
	"promoted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"exported_to_sentinel_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"dominion_lead_id" uuid PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"apn" varchar(64),
	"county" varchar(128),
	"state" varchar(2),
	"standardized_address" text,
	"street_address" varchar(256),
	"city" varchar(128),
	"zip" varchar(10),
	"owner_name" text,
	"owner_first" varchar(128),
	"owner_last" varchar(128),
	"phone" varchar(20),
	"email" varchar(256),
	"mailing_address" text,
	"ownership_duration_months" integer,
	"absentee_owner" boolean DEFAULT false,
	"equity_estimate" numeric(12, 2),
	"mortgage_status" "mortgage_status" DEFAULT 'UNKNOWN',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_property_id_unique" UNIQUE("property_id")
);
--> statement-breakpoint
CREATE TABLE "scoring_model_configs" (
	"version" varchar(32) PRIMARY KEY NOT NULL,
	"confirmed_weights" jsonb NOT NULL,
	"predictive_weights" jsonb NOT NULL,
	"decay_config" jsonb NOT NULL,
	"promotion_threshold" numeric(7, 4) NOT NULL,
	"tier_thresholds" jsonb NOT NULL,
	"confidence_config" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoring_records" (
	"score_id" uuid PRIMARY KEY NOT NULL,
	"dominion_lead_id" uuid NOT NULL,
	"composite_score" numeric(7, 4) NOT NULL,
	"confidence_score" numeric(5, 4) NOT NULL,
	"score_model_version" varchar(32) NOT NULL,
	"score_inputs_snapshot" jsonb NOT NULL,
	"signal_contributions" jsonb NOT NULL,
	"time_decay_factor" numeric(5, 4),
	"score_decay_rate" numeric(5, 4),
	"days_since_trigger" integer,
	"first_detected_at" timestamp with time zone,
	"last_scored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_accumulation" (
	"dominion_lead_id" uuid PRIMARY KEY NOT NULL,
	"first_signal_detected_at" timestamp with time zone NOT NULL,
	"signal_count_7d" integer DEFAULT 0 NOT NULL,
	"signal_count_30d" integer DEFAULT 0 NOT NULL,
	"total_signal_count" integer DEFAULT 0 NOT NULL,
	"signal_acceleration_rate" numeric(7, 4) DEFAULT '0',
	"signal_density_score" numeric(7, 4) DEFAULT '0',
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" varchar(128) PRIMARY KEY NOT NULL,
	"email" varchar(256) NOT NULL,
	"name" varchar(256),
	"role" "user_role" DEFAULT 'READONLY' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "distress_events" ADD CONSTRAINT "distress_events_dominion_lead_id_properties_dominion_lead_id_fk" FOREIGN KEY ("dominion_lead_id") REFERENCES "public"."properties"("dominion_lead_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_reservoir" ADD CONSTRAINT "outcome_reservoir_dominion_lead_id_properties_dominion_lead_id_fk" FOREIGN KEY ("dominion_lead_id") REFERENCES "public"."properties"("dominion_lead_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promoted_leads" ADD CONSTRAINT "promoted_leads_dominion_lead_id_properties_dominion_lead_id_fk" FOREIGN KEY ("dominion_lead_id") REFERENCES "public"."properties"("dominion_lead_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_records" ADD CONSTRAINT "scoring_records_dominion_lead_id_properties_dominion_lead_id_fk" FOREIGN KEY ("dominion_lead_id") REFERENCES "public"."properties"("dominion_lead_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_accumulation" ADD CONSTRAINT "signal_accumulation_dominion_lead_id_properties_dominion_lead_id_fk" FOREIGN KEY ("dominion_lead_id") REFERENCES "public"."properties"("dominion_lead_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_log_dominion_lead_id" ON "audit_log" USING btree ("dominion_lead_id");--> statement-breakpoint
CREATE INDEX "idx_audit_log_action_type" ON "audit_log" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "idx_audit_log_created_at" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_log_user_id" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_distress_events_dominion_lead_id" ON "distress_events" USING btree ("dominion_lead_id");--> statement-breakpoint
CREATE INDEX "idx_distress_events_type" ON "distress_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_distress_events_layer" ON "distress_events" USING btree ("event_layer");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_distress_events_fingerprint" ON "distress_events" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "idx_distress_events_created_at" ON "distress_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_distress_events_lead_created" ON "distress_events" USING btree ("dominion_lead_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_distress_events_type_layer" ON "distress_events" USING btree ("event_type","event_layer");--> statement-breakpoint
CREATE INDEX "idx_outcome_reservoir_status" ON "outcome_reservoir" USING btree ("outcome_status");--> statement-breakpoint
CREATE INDEX "idx_promoted_leads_dominion_lead_id" ON "promoted_leads" USING btree ("dominion_lead_id");--> statement-breakpoint
CREATE INDEX "idx_promoted_leads_promoted_at" ON "promoted_leads" USING btree ("promoted_at");--> statement-breakpoint
CREATE INDEX "idx_promoted_leads_tier" ON "promoted_leads" USING btree ("marketing_tier");--> statement-breakpoint
CREATE INDEX "idx_promoted_leads_urgency" ON "promoted_leads" USING btree ("urgency_level");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_properties_apn_county" ON "properties" USING btree ("apn","county");--> statement-breakpoint
CREATE INDEX "idx_properties_dominion_lead_id" ON "properties" USING btree ("dominion_lead_id");--> statement-breakpoint
CREATE INDEX "idx_properties_state_county" ON "properties" USING btree ("state","county");--> statement-breakpoint
CREATE INDEX "idx_properties_owner_last" ON "properties" USING btree ("owner_last");--> statement-breakpoint
CREATE INDEX "idx_properties_zip" ON "properties" USING btree ("zip");--> statement-breakpoint
CREATE INDEX "idx_scoring_records_dominion_lead_id" ON "scoring_records" USING btree ("dominion_lead_id");--> statement-breakpoint
CREATE INDEX "idx_scoring_records_lead_created_desc" ON "scoring_records" USING btree ("dominion_lead_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_scoring_records_composite" ON "scoring_records" USING btree ("composite_score");--> statement-breakpoint
CREATE INDEX "idx_scoring_records_model_version" ON "scoring_records" USING btree ("score_model_version");--> statement-breakpoint
CREATE INDEX "idx_signal_accumulation_density" ON "signal_accumulation" USING btree ("signal_density_score");--> statement-breakpoint
CREATE INDEX "idx_signal_accumulation_total" ON "signal_accumulation" USING btree ("total_signal_count");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");