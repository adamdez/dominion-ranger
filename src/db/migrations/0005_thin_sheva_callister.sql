CREATE TYPE "public"."activity_channel" AS ENUM('OUTBOUND_COLD', 'INBOUND_WEBSITE', 'INBOUND_CALL', 'DRIP_SMS', 'DRIP_EMAIL', 'DRIP_RVM', 'DIRECT_MAIL', 'MANUAL_EMAIL', 'MANUAL_SMS', 'GOOGLE_ADS', 'ORGANIC', 'REFERRAL');--> statement-breakpoint
CREATE TYPE "public"."activity_outcome" AS ENUM('NO_ANSWER', 'VOICEMAIL', 'BUSY', 'DISCONNECTED', 'CONNECTED', 'WRONG_NUMBER', 'WARM', 'FOLLOW_UP', 'OFFER_REQUESTED', 'APPT_SET', 'NOT_INTERESTED', 'DO_NOT_CALL', 'CONTRACTED', 'CLOSED', 'FELL_THROUGH', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('CALL_PLACED', 'CALL_CONNECTED', 'TEXT_SENT', 'TEXT_REPLY', 'EMAIL_SENT', 'EMAIL_REPLY', 'MAIL_SENT', 'MAIL_DELIVERED', 'MAIL_RETURNED', 'RVM_DROPPED', 'INBOUND_FORM', 'INBOUND_CALL', 'APPOINTMENT_SET', 'OFFER_SENT', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'DEAL_CLOSED', 'STATUS_CHANGED', 'LEAD_ASSIGNED', 'LEAD_PROMOTED', 'COMPLIANCE_CHECKED', 'DRIP_ENROLLED', 'DRIP_CANCELLED', 'NOTE_ADDED', 'CALLBACK_SCHEDULED', 'CALLBACK_COMPLETED', 'CALLBACK_MISSED', 'QR_SCANNED');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('ACTIVE', 'PAUSED', 'COMPLETE');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('INBOUND', 'OUTBOUND', 'PREDICTIVE', 'REFERRAL');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('PENDING', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('CALLBACK', 'FOLLOW_UP', 'RESEARCH', 'SEND_OFFER', 'SITE_VISIT', 'GENERAL');--> statement-breakpoint
CREATE TABLE "call_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_sid" varchar(64),
	"dominion_lead_id" uuid NOT NULL,
	"lead_instance_id" uuid,
	"user_id" varchar(128) NOT NULL,
	"direction" varchar(16) DEFAULT 'OUTBOUND' NOT NULL,
	"to_phone" varchar(20) NOT NULL,
	"from_phone" varchar(20) NOT NULL,
	"status" varchar(24) DEFAULT 'initiated' NOT NULL,
	"duration_seconds" integer,
	"recording_url" text,
	"recording_sid" varchar(64),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "call_logs_call_sid_unique" UNIQUE("call_sid")
);
--> statement-breakpoint
CREATE TABLE "inbound_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dominion_lead_id" uuid,
	"lead_instance_id" uuid,
	"submitted_name" varchar(256),
	"submitted_phone" varchar(32),
	"submitted_email" varchar(256),
	"submitted_address" text,
	"submitted_city" varchar(128),
	"submitted_state" varchar(2),
	"submitted_zip" varchar(10),
	"submitted_message" text,
	"source" varchar(64) NOT NULL,
	"source_detail" varchar(128),
	"utm_source" varchar(128),
	"utm_medium" varchar(128),
	"utm_campaign" varchar(256),
	"utm_content" varchar(256),
	"utm_term" varchar(256),
	"matched_existing" boolean DEFAULT false,
	"match_confidence" numeric(3, 2),
	"auto_reply_sent" boolean DEFAULT false,
	"first_contact_at" timestamp with time zone,
	"time_to_contact_seconds" integer,
	"outcome" varchar(32),
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_sid" varchar(64),
	"dominion_lead_id" uuid,
	"lead_instance_id" uuid,
	"user_id" varchar(128),
	"direction" varchar(16) DEFAULT 'OUTBOUND' NOT NULL,
	"to_phone" varchar(20) NOT NULL,
	"from_phone" varchar(20) NOT NULL,
	"body" text NOT NULL,
	"status" varchar(24) DEFAULT 'queued',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_logs_message_sid_unique" UNIQUE("message_sid")
);
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"activity_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dominion_lead_id" uuid NOT NULL,
	"lead_instance_id" uuid,
	"user_id" varchar(128),
	"activity_type" "activity_type" NOT NULL,
	"channel" "activity_channel" NOT NULL,
	"outcome" "activity_outcome",
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cost_cents" integer,
	"revenue_cents" integer,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"deal_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_instance_id" uuid NOT NULL,
	"dominion_lead_id" uuid NOT NULL,
	"agent_user_id" varchar(128),
	"property_address" text,
	"purchase_price_cents" integer,
	"assignment_fee_cents" integer NOT NULL,
	"gross_revenue_cents" integer NOT NULL,
	"buyer_purchase_price_cents" integer,
	"estimated_arv_cents" integer,
	"buyer_name" varchar(256),
	"buyer_company" varchar(256),
	"lead_source" varchar(64),
	"lead_source_detail" varchar(256),
	"primary_distress_signals" jsonb,
	"composite_score_at_close" numeric(5, 2),
	"days_to_close" integer,
	"total_touches" integer,
	"contract_date" date,
	"close_date" date,
	"status" varchar(32) DEFAULT 'CLOSED' NOT NULL,
	"fell_through_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_spend_entries" (
	"spend_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"spend_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"campaign_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"budget_cents" integer,
	"campaign_status" "campaign_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_source_attribution" (
	"attribution_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_instance_id" uuid NOT NULL,
	"channel_id" uuid,
	"campaign_id" uuid,
	"attribution_type" varchar(16) DEFAULT 'LAST_TOUCH' NOT NULL,
	"utm_source" varchar(128),
	"utm_medium" varchar(128),
	"utm_campaign" varchar(256),
	"utm_content" varchar(256),
	"utm_term" varchar(256),
	"mail_variant_id" uuid,
	"tracking_phone" varchar(32),
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_channels" (
	"channel_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"channel_type" "channel_type" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dominion_lead_id" uuid NOT NULL,
	"contact_name" varchar(256),
	"contact_type" varchar(32) DEFAULT 'OWNER' NOT NULL,
	"phone" varchar(20),
	"phone_type" varchar(16),
	"phone_status" varchar(16) DEFAULT 'UNKNOWN',
	"email" varchar(256),
	"dnd_calls" boolean DEFAULT false,
	"dnd_sms" boolean DEFAULT false,
	"dnd_email" boolean DEFAULT false,
	"source" varchar(32),
	"is_primary" boolean DEFAULT false,
	"is_owner_match" boolean DEFAULT false,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_instance_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_instance_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"applied_by" varchar(128),
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"color" varchar(7) DEFAULT '#6B7280',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(256) NOT NULL,
	"description" text,
	"task_type" "task_type" DEFAULT 'GENERAL' NOT NULL,
	"status" "task_status" DEFAULT 'PENDING' NOT NULL,
	"lead_instance_id" uuid,
	"dominion_lead_id" uuid,
	"assigned_to" varchar(128),
	"created_by" varchar(128),
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" varchar(512),
	"filter_config" jsonb NOT NULL,
	"is_default" boolean DEFAULT false,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_instances" ADD COLUMN "deal_stage" varchar(32) DEFAULT 'NEW_LEAD';--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "phone_type" varchar(16);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "phone_2" varchar(20);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "phone_2_type" varchar(16);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "phone_3" varchar(20);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "phone_3_type" varchar(16);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "email_2" varchar(256);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "skip_trace_tier" varchar(16);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "skip_traced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "skip_trace_source" varchar(32);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "skip_trace_raw" jsonb;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_dominion_lead_id_properties_dominion_lead_id_fk" FOREIGN KEY ("dominion_lead_id") REFERENCES "public"."properties"("dominion_lead_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_lead_instance_id_lead_instances_lead_instance_id_fk" FOREIGN KEY ("lead_instance_id") REFERENCES "public"."lead_instances"("lead_instance_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_lead_instance_id_lead_instances_lead_instance_id_fk" FOREIGN KEY ("lead_instance_id") REFERENCES "public"."lead_instances"("lead_instance_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_dominion_lead_id_properties_dominion_lead_id_fk" FOREIGN KEY ("dominion_lead_id") REFERENCES "public"."properties"("dominion_lead_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_spend_entries" ADD CONSTRAINT "campaign_spend_entries_campaign_id_campaigns_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("campaign_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_channel_id_marketing_channels_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."marketing_channels"("channel_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_source_attribution" ADD CONSTRAINT "lead_source_attribution_lead_instance_id_lead_instances_lead_instance_id_fk" FOREIGN KEY ("lead_instance_id") REFERENCES "public"."lead_instances"("lead_instance_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_source_attribution" ADD CONSTRAINT "lead_source_attribution_channel_id_marketing_channels_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."marketing_channels"("channel_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_source_attribution" ADD CONSTRAINT "lead_source_attribution_campaign_id_campaigns_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("campaign_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_contacts" ADD CONSTRAINT "property_contacts_dominion_lead_id_properties_dominion_lead_id_fk" FOREIGN KEY ("dominion_lead_id") REFERENCES "public"."properties"("dominion_lead_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_instance_tags" ADD CONSTRAINT "lead_instance_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_call_logs_lead" ON "call_logs" USING btree ("dominion_lead_id");--> statement-breakpoint
CREATE INDEX "idx_call_logs_user" ON "call_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_call_logs_sid" ON "call_logs" USING btree ("call_sid");--> statement-breakpoint
CREATE INDEX "idx_call_logs_started" ON "call_logs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_inbound_leads_dominion_lead_id" ON "inbound_leads" USING btree ("dominion_lead_id");--> statement-breakpoint
CREATE INDEX "idx_inbound_leads_source" ON "inbound_leads" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_inbound_leads_submitted_at" ON "inbound_leads" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "idx_sms_logs_lead" ON "sms_logs" USING btree ("dominion_lead_id");--> statement-breakpoint
CREATE INDEX "idx_sms_logs_sid" ON "sms_logs" USING btree ("message_sid");--> statement-breakpoint
CREATE INDEX "idx_activity_log_dominion_lead_id" ON "activity_log" USING btree ("dominion_lead_id");--> statement-breakpoint
CREATE INDEX "idx_activity_log_lead_instance_id" ON "activity_log" USING btree ("lead_instance_id");--> statement-breakpoint
CREATE INDEX "idx_activity_log_user_id" ON "activity_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_activity_log_activity_type" ON "activity_log" USING btree ("activity_type");--> statement-breakpoint
CREATE INDEX "idx_activity_log_channel" ON "activity_log" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "idx_activity_log_occurred_at" ON "activity_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "idx_activity_log_lead_type" ON "activity_log" USING btree ("dominion_lead_id","activity_type");--> statement-breakpoint
CREATE INDEX "idx_deals_lead_instance_id" ON "deals" USING btree ("lead_instance_id");--> statement-breakpoint
CREATE INDEX "idx_deals_dominion_lead_id" ON "deals" USING btree ("dominion_lead_id");--> statement-breakpoint
CREATE INDEX "idx_deals_agent_user_id" ON "deals" USING btree ("agent_user_id");--> statement-breakpoint
CREATE INDEX "idx_deals_status" ON "deals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_deals_close_date" ON "deals" USING btree ("close_date");--> statement-breakpoint
CREATE INDEX "idx_campaign_spend_campaign_id" ON "campaign_spend_entries" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_campaign_spend_date" ON "campaign_spend_entries" USING btree ("spend_date");--> statement-breakpoint
CREATE INDEX "idx_campaigns_channel_id" ON "campaigns" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_campaigns_status" ON "campaigns" USING btree ("campaign_status");--> statement-breakpoint
CREATE INDEX "idx_attribution_lead_instance_id" ON "lead_source_attribution" USING btree ("lead_instance_id");--> statement-breakpoint
CREATE INDEX "idx_attribution_channel_id" ON "lead_source_attribution" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_attribution_campaign_id" ON "lead_source_attribution" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_attribution_captured_at" ON "lead_source_attribution" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX "idx_marketing_channels_channel_type" ON "marketing_channels" USING btree ("channel_type");--> statement-breakpoint
CREATE INDEX "idx_marketing_channels_active" ON "marketing_channels" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_property_contacts_lead" ON "property_contacts" USING btree ("dominion_lead_id");--> statement-breakpoint
CREATE INDEX "idx_property_contacts_phone" ON "property_contacts" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_lead_tags_unique" ON "lead_instance_tags" USING btree ("lead_instance_id","tag_id");--> statement-breakpoint
CREATE INDEX "idx_lead_tags_lead" ON "lead_instance_tags" USING btree ("lead_instance_id");--> statement-breakpoint
CREATE INDEX "idx_lead_tags_tag" ON "lead_instance_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tags_name" ON "tags" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_tasks_lead" ON "tasks" USING btree ("lead_instance_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_assigned" ON "tasks" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "idx_tasks_due" ON "tasks" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "idx_tasks_status" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_lead_instances_deal_stage" ON "lead_instances" USING btree ("deal_stage");