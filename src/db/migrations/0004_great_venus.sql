CREATE TYPE "public"."disposition_type" AS ENUM('NO_ANSWER', 'LEFT_VOICEMAIL', 'CALLBACK_REQUESTED', 'NOT_INTERESTED', 'WRONG_NUMBER', 'DO_NOT_CALL', 'INTERESTED', 'APPOINTMENT_SET');--> statement-breakpoint
CREATE TABLE "dispositions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_instance_id" uuid NOT NULL,
	"disposition" "disposition_type" NOT NULL,
	"notes" text,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dispositions" ADD CONSTRAINT "dispositions_lead_instance_id_lead_instances_lead_instance_id_fk" FOREIGN KEY ("lead_instance_id") REFERENCES "public"."lead_instances"("lead_instance_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositions" ADD CONSTRAINT "dispositions_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dispositions_lead_instance_id" ON "dispositions" USING btree ("lead_instance_id");--> statement-breakpoint
CREATE INDEX "idx_dispositions_created_at" ON "dispositions" USING btree ("created_at");