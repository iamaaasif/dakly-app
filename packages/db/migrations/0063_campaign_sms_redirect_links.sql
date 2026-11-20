ALTER TABLE "campaign_recipients" ADD COLUMN "redirect_link_codes" text[];--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "wrapped_sms_approved_at" timestamp with time zone;