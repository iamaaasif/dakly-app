CREATE INDEX "imports_importing_idx" ON "imports" USING btree ("store_id") WHERE "imports"."status" = 'importing';--> statement-breakpoint
-- The stuck-import sweep runs across stores without turning RLS off: this names the stores with an
-- import whose run stopped, and the failing itself runs per store as dakly_app.
CREATE FUNCTION stores_with_stuck_imports(p_before timestamptz) RETURNS TABLE(store_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT i.store_id FROM public.imports i
  WHERE i.status = 'importing' AND coalesce(i.claimed_at, i.started_at) < p_before
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION stores_with_stuck_imports(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION stores_with_stuck_imports(timestamptz) TO dakly_app;
