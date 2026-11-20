ALTER TABLE "campaign_recipients" ADD COLUMN "redirect_link_codes" text[];--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "wrap_sms_links" boolean DEFAULT false NOT NULL;