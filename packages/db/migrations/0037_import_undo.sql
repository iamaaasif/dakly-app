ALTER TABLE "consents" DROP CONSTRAINT "consents_status";--> statement-breakpoint
ALTER TABLE "consents" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "undo_finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_import_id_store_fk" FOREIGN KEY ("store_id","import_id") REFERENCES "public"."imports"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consents_store_id_import_id_idx" ON "consents" USING btree ("store_id","import_id","id");--> statement-breakpoint
CREATE INDEX "imports_pending_undo_idx" ON "imports" USING btree ("store_id","last_progress_at","id") WHERE "imports"."status" = 'undone' and "imports"."undo_finished_at" is null;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_status" CHECK ("consents"."status" in ('granted', 'withdrawn', 'not_answered'));--> statement-breakpoint
-- Accepted undo work must survive worker failures even after its seven-day acceptance window.
CREATE OR REPLACE FUNCTION stores_with_stuck_imports(p_before timestamptz) RETURNS TABLE(store_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT i.store_id FROM public.imports i
  WHERE (i.status = 'importing' AND coalesce(i.last_progress_at, i.started_at) < p_before)
     OR (i.status = 'undone' AND i.undo_finished_at IS NULL
         AND coalesce(i.last_progress_at, i.finished_at) < p_before)
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION stores_with_stuck_imports(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION stores_with_stuck_imports(timestamptz) TO dakly_app;
