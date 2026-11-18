ALTER TABLE "automation_run_steps" ADD COLUMN "opt_out_url" text;--> statement-breakpoint
ALTER TABLE "automation_run_steps" ADD COLUMN "destination" text;--> statement-breakpoint
ALTER TABLE "automation_run_steps" ADD COLUMN "first_tried_at" timestamp with time zone;