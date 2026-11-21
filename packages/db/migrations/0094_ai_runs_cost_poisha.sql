ALTER TABLE "ai_runs" ADD COLUMN "cost_poisha" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Runs saved before this column use the launch rate of ৳122 per US dollar.
UPDATE "ai_runs" SET "cost_poisha" = round("cost_micro_usd" * 12200 / 1000000.0);
