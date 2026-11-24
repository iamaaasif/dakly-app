ALTER TABLE "ai_agent_settings" ALTER COLUMN "debounce_seconds" SET DEFAULT 3;--> statement-breakpoint
-- Nothing in the app sets this value, so every store still on the old default moves to the new one.
UPDATE "ai_agent_settings" SET "debounce_seconds" = 3 WHERE "debounce_seconds" = 8;
