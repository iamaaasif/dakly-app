ALTER TABLE "automation_runs" DROP CONSTRAINT "automation_runs_exit_reason";--> statement-breakpoint
ALTER TABLE "automation_run_steps" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "automation_run_steps" ADD CONSTRAINT "automation_run_steps_category" CHECK ("automation_run_steps"."category" in ('transactional', 'marketing'));--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_exit_reason" CHECK ("automation_runs"."exit_reason" in ('version_stopped', 'archived', 'goal', 'exit_condition', 'workflow_filter'));