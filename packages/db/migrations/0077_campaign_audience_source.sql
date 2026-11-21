ALTER TABLE "campaigns" ADD COLUMN "source_campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "source_outcome" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_source_campaign_id_store_fk" FOREIGN KEY ("store_id","source_campaign_id") REFERENCES "public"."campaigns"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaigns_source_campaign_id_idx" ON "campaigns" USING btree ("source_campaign_id");--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_source" CHECK (("campaigns"."source_campaign_id" is null) = ("campaigns"."source_outcome" is null));--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_source_outcome" CHECK ("campaigns"."source_outcome" in ('resend_unread', 'follow_up_unordered'));