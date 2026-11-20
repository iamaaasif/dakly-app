ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_status";--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "approval_segment_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "approval_cursor" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "approval_checked_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "approval_estimated_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "approval_progress_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "approval_failure_code" text;--> statement-breakpoint
CREATE INDEX "campaigns_approving_idx" ON "campaigns" USING btree ("approval_progress_at","id") WHERE "campaigns"."status" = 'approving';--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_approval_failure_code" CHECK ("campaigns"."approval_failure_code" in ('WALLET_BALANCE_TOO_LOW', 'CAMPAIGN_NO_RECIPIENTS', 'CAMPAIGN_SEND_TIME_PASSED'));--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_status" CHECK ("campaigns"."status" in ('draft', 'waiting_approval', 'approving', 'scheduled', 'sending', 'paused', 'sent', 'cancelled', 'failed'));