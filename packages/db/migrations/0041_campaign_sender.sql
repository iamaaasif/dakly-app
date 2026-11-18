CREATE INDEX "campaigns_start_due_by_store_idx" ON "campaigns" USING btree ("store_id","scheduled_for","id") WHERE "campaigns"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "campaigns_sending_idx" ON "campaigns" USING btree ("store_id",coalesce("started_at", "approved_at"),"id") WHERE "campaigns"."status" = 'sending';--> statement-breakpoint
-- The sender's sweep runs across stores without turning RLS off: this names one sending
-- campaign per store, the earliest started, and its recipients are claimed per store as
-- dakly_app. A store's next campaign is named once that one stops sending.
CREATE FUNCTION sending_campaigns() RETURNS TABLE(store_id uuid, campaign_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT ON (c.store_id) c.store_id, c.id FROM public.campaigns c
  WHERE c.status = 'sending'
  ORDER BY c.store_id, coalesce(c.started_at, c.approved_at), c.id
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION sending_campaigns() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sending_campaigns() TO dakly_app;--> statement-breakpoint
-- Seek past each store's index range after finding its first due campaign.
-- The scheduler only needs store ids; campaign reads and writes stay under store RLS.
CREATE FUNCTION campaign_due_stores(p_as_of timestamptz, p_after uuid, p_limit integer)
  RETURNS TABLE(store_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH RECURSIVE due(store_id, visit) AS (
    (
      SELECT c.store_id, 1
      FROM public.campaigns c
      WHERE p_limit > 0 AND c.status = 'scheduled' AND c.scheduled_for <= p_as_of
        AND c.store_id > coalesce(p_after, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY c.store_id, c.scheduled_for, c.id
      LIMIT 1
    )
    UNION ALL
    SELECT next.store_id, due.visit + 1
    FROM due JOIN LATERAL (
      SELECT c.store_id FROM public.campaigns c
      WHERE c.status = 'scheduled' AND c.scheduled_for <= p_as_of
        AND c.store_id > due.store_id
      ORDER BY c.store_id, c.scheduled_for, c.id
      LIMIT 1
    ) next ON true
    WHERE due.visit < least(p_limit, 100)
  )
  SELECT due.store_id FROM due ORDER BY due.visit
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION campaign_due_stores(timestamptz, uuid, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION campaign_due_stores(timestamptz, uuid, integer) TO dakly_app;
