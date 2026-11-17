ALTER TABLE "automations" ADD COLUMN "pause_reason" text;--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "balance_paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_pause_reason" CHECK ("automations"."pause_reason" in ('manual', 'balance'));