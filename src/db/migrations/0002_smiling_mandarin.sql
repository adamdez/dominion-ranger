CREATE TYPE "public"."lead_instance_status" AS ENUM('PROMOTED', 'ASSIGNED', 'COMPLIANCE_PENDING', 'DIAL_READY', 'DIALING', 'CONTACTED', 'OFFER_SENT', 'CONTRACTED', 'CLOSED', 'DEAD');--> statement-breakpoint
CREATE TABLE "lead_instances" (
	"lead_instance_id" uuid PRIMARY KEY NOT NULL,
	"dominion_lead_id" uuid NOT NULL,
	"promotion_id" uuid,
	"assigned_to" varchar(128),
	"status" "lead_instance_status" DEFAULT 'PROMOTED' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"compliance_cleared" boolean DEFAULT false NOT NULL,
	"dnc_checked_at" timestamp with time zone,
	"litigant_checked_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"dialed_at" timestamp with time zone,
	"contacted_at" timestamp with time zone,
	"offer_sent_at" timestamp with time zone,
	"contracted_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_instances" ADD CONSTRAINT "lead_instances_dominion_lead_id_properties_dominion_lead_id_fk" FOREIGN KEY ("dominion_lead_id") REFERENCES "public"."properties"("dominion_lead_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_instances" ADD CONSTRAINT "lead_instances_promotion_id_promoted_leads_promotion_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promoted_leads"("promotion_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_instances" ADD CONSTRAINT "lead_instances_assigned_to_users_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_lead_instances_dominion_lead_id" ON "lead_instances" USING btree ("dominion_lead_id");--> statement-breakpoint
CREATE INDEX "idx_lead_instances_assigned_to" ON "lead_instances" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "idx_lead_instances_status" ON "lead_instances" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_lead_instances_created_at" ON "lead_instances" USING btree ("created_at");