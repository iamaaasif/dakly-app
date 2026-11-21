CREATE TABLE "kill_switches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"feature" text NOT NULL,
	"store_id" uuid,
	"reason" text NOT NULL,
	"paused_by_staff_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kill_switches_feature" CHECK ("kill_switches"."feature" in ('ai_replies', 'campaign_sending', 'social_posting')),
	CONSTRAINT "kill_switches_reason_length" CHECK (char_length("kill_switches"."reason") >= 10)
);
--> statement-breakpoint
ALTER TABLE "kill_switches" ADD CONSTRAINT "kill_switches_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kill_switches" ADD CONSTRAINT "kill_switches_paused_by_staff_id_staff_users_id_fk" FOREIGN KEY ("paused_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kill_switches_global_key" ON "kill_switches" USING btree ("feature") WHERE "kill_switches"."store_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "kill_switches_store_key" ON "kill_switches" USING btree ("feature","store_id") WHERE "kill_switches"."store_id" is not null;--> statement-breakpoint
CREATE INDEX "kill_switches_paused_by_staff_id_idx" ON "kill_switches" USING btree ("paused_by_staff_id");--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "kill_switches" TO dakly_app;
