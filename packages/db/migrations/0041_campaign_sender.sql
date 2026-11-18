CREATE INDEX "campaigns_start_due_by_store_idx" ON "campaigns" USING btree ("store_id","scheduled_for","id") WHERE "campaigns"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "campaigns_sending_idx" ON "campaigns" USING btree ("store_id",coalesce("started_at", "approved_at"),"id") WHERE "campaigns"."status" = 'sending';--> statement-breakpoint
CREATE INDEX "campaigns_legacy_start_idx" ON "campaigns" USING btree ("store_id","status","created_at","id") WHERE "campaigns"."started_at" is null and "campaigns"."approved_at" is not null and "campaigns"."status" in ('sending', 'paused', 'sent');--> statement-breakpoint
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
  WITH RECURSIVE scheduled(store_id, scheduled_for, visit, due_count) AS (
    SELECT first_store.store_id, first_store.scheduled_for, 1,
      CASE WHEN first_store.scheduled_for <= p_as_of THEN 1 ELSE 0 END
    FROM (
      (
        SELECT c.store_id, c.scheduled_for FROM public.campaigns c
        WHERE p_limit > 0 AND p_after IS NULL
          AND c.status = 'scheduled'
        ORDER BY c.store_id, c.scheduled_for, c.id
        LIMIT 1
      )
      UNION ALL
      (
        SELECT c.store_id, c.scheduled_for FROM public.campaigns c
        WHERE p_limit > 0 AND p_after IS NOT NULL
          AND c.status = 'scheduled' AND c.store_id > p_after
        ORDER BY c.store_id, c.scheduled_for, c.id
        LIMIT 1
      )
    ) first_store
    UNION ALL
    SELECT next.store_id, next.scheduled_for, scheduled.visit + 1,
      scheduled.due_count + CASE WHEN next.scheduled_for <= p_as_of THEN 1 ELSE 0 END
    FROM scheduled JOIN LATERAL (
      SELECT c.store_id, c.scheduled_for FROM public.campaigns c
      WHERE c.status = 'scheduled' AND c.store_id > scheduled.store_id
      ORDER BY c.store_id, c.scheduled_for, c.id
      LIMIT 1
    ) next ON true
    WHERE scheduled.due_count < least(p_limit, 100)
  )
  SELECT scheduled.store_id FROM scheduled
  WHERE scheduled.scheduled_for <= p_as_of ORDER BY scheduled.visit
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION campaign_due_stores(timestamptz, uuid, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION campaign_due_stores(timestamptz, uuid, integer) TO dakly_app;
