CREATE FUNCTION public.post_publish_due_stores(p_before timestamptz, p_after uuid, p_limit integer)
RETURNS TABLE(store_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT t.store_id
  FROM public.post_targets t
  WHERE t.status IN ('scheduled', 'publishing')
    AND t.scheduled_for <= p_before
    AND (p_after IS NULL OR t.store_id > p_after)
  ORDER BY t.store_id
  LIMIT greatest(1, least(coalesce(p_limit, 100), 1000))
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.post_publish_due_stores(timestamptz, uuid, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.post_publish_due_stores(timestamptz, uuid, integer) TO dakly_app;
