ALTER TABLE "tracked_links" DROP CONSTRAINT "tracked_links_kind";--> statement-breakpoint
ALTER TABLE "automation_run_steps" ADD COLUMN "rendered_text" text;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "trigger_order_id" uuid;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_trigger_order_id_orders_id_fk" FOREIGN KEY ("trigger_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_order_confirm_source" CHECK ("tracked_links"."kind" <> 'order_confirm' or ("tracked_links"."source_type" = 'order' and "tracked_links"."source_id" is not null));--> statement-breakpoint
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_kind" CHECK ("tracked_links"."kind" in ('redirect', 'sms_opt_out', 'order_confirm'));