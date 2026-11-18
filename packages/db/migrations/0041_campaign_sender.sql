CREATE INDEX "campaigns_start_due_by_store_idx" ON "campaigns" USING btree ("store_id","scheduled_for","id") WHERE "campaigns"."status" = 'scheduled';--> statement-breakpoint
-- The sweep reads store IDs across RLS. Each store's start update runs under its own RLS scope.
CREATE FUNCTION campaign_due_stores(p_as_of timestamptz, p_after uuid, p_limit integer)
  RETURNS TABLE(store_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT c.store_id
  FROM public.campaigns c
  WHERE c.status = 'scheduled' AND c.scheduled_for <= p_as_of
    AND (p_after IS NULL OR c.store_id > p_after)
  GROUP BY c.store_id
  ORDER BY c.store_id
  LIMIT greatest(0, least(coalesce(p_limit, 0), 100))
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION campaign_due_stores(timestamptz, uuid, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION campaign_due_stores(timestamptz, uuid, integer) TO dakly_app;
