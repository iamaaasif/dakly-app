ALTER TABLE "campaign_recipients" ADD COLUMN "sms_credits" integer;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "settlement_pending_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "settled_at" timestamp with time zone;