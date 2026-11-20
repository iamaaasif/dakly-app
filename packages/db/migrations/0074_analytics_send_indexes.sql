ALTER TABLE "automation_runs" DROP CONSTRAINT "automation_runs_exit_reason";--> statement-breakpoint
CREATE INDEX "automation_run_steps_store_sent_at_idx" ON "automation_run_steps" USING btree ("store_id","sent_at");--> statement-breakpoint
CREATE INDEX "campaign_recipients_store_sent_at_idx" ON "campaign_recipients" USING btree ("store_id","sent_at");--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_exit_reason" CHECK ("automation_runs"."exit_reason" in ('version_stopped', 'archived', 'goal', 'exit_condition', 'workflow_filter', 'not_reachable'));