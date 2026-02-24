CREATE TABLE "pending_scoring" (
	"dominion_lead_id" uuid PRIMARY KEY NOT NULL,
	"reason" varchar(32) DEFAULT 'event_ingested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pending_scoring" ADD CONSTRAINT "pending_scoring_dominion_lead_id_properties_dominion_lead_id_fk" FOREIGN KEY ("dominion_lead_id") REFERENCES "public"."properties"("dominion_lead_id") ON DELETE cascade ON UPDATE no action;