ALTER TABLE "social_comments" ADD COLUMN "author_external_id" text;--> statement-breakpoint
ALTER TABLE "social_comments" ADD COLUMN "automation_claimed_at" timestamp with time zone;