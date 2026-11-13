-- Retention must finish rollups for suspended and closing stores before dropping shared months.
CREATE FUNCTION public.maintenance_store_ids(p_after uuid, p_limit integer)
RETURNS TABLE(store_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT s.id FROM public.stores s
  WHERE p_after IS NULL OR s.id > p_after
  ORDER BY s.id
  LIMIT greatest(1, least(coalesce(p_limit, 100), 1000))
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.maintenance_store_ids(uuid, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.maintenance_store_ids(uuid, integer) TO dakly_app;
