ALTER TABLE "automations" ADD COLUMN "pause_reason" text;--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "balance_pause_revision" integer;--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "balance_resumed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "balance_resume_keeps_send" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_pause_reason" CHECK ("automations"."pause_reason" in ('manual', 'balance'));--> statement-breakpoint
-- Workflows paused before pause reasons existed were paused by hand.
UPDATE "automations" SET "pause_reason" = 'manual' WHERE "status" = 'paused';--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_paused_has_reason" CHECK (("automations"."status" = 'paused') = ("automations"."pause_reason" is not null));--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_balance_pause_revision" CHECK ("automations"."pause_reason" is distinct from 'balance'
        or ("automations"."balance_pause_revision" is not null and "automations"."balance_pause_revision" >= 0));