ALTER TABLE "imports" ADD COLUMN "last_progress_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "requeue_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "imports_importing_idx" ON "imports" USING btree ("store_id") WHERE "imports"."status" = 'importing';--> statement-breakpoint
-- The stuck-import sweep runs across stores without turning RLS off: this names the stores with an
-- import that made no progress since the cutoff, and the sweep itself runs per store as dakly_app.
CREATE FUNCTION stores_with_stuck_imports(p_before timestamptz) RETURNS TABLE(store_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT i.store_id FROM public.imports i
  WHERE i.status = 'importing' AND coalesce(i.last_progress_at, i.started_at) < p_before
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION stores_with_stuck_imports(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION stores_with_stuck_imports(timestamptz) TO dakly_app;
