ALTER TABLE "campaign_recipients" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "campaigns_unsettled_idx" ON "campaigns" USING btree ("store_id","settlement_pending_at","id") WHERE "campaigns"."status" = 'cancelled' and "campaigns"."settlement_pending_at" is not null;--> statement-breakpoint
-- Only store IDs cross RLS. The worker locks each cancellation in its own store.
CREATE FUNCTION campaign_cancelled_stores(after_store uuid, store_limit integer)
  RETURNS TABLE(store_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH RECURSIVE page(store_id, position) AS (
    SELECT after_store, 0
    UNION ALL
    SELECT next_store.store_id, page.position + 1
    FROM page
    CROSS JOIN LATERAL (
      SELECT CASE WHEN page.store_id IS NULL THEN '00000000-0000-0000-0000-000000000000'::uuid
        ELSE (SELECT s.id FROM public.stores s WHERE s.id > page.store_id ORDER BY s.id LIMIT 1)
      END AS store_id
    ) AS floor
    CROSS JOIN LATERAL (
      SELECT c.store_id
      FROM public.campaigns c
      WHERE c.status = 'cancelled' AND c.settlement_pending_at IS NOT NULL
        AND c.store_id >= floor.store_id
      ORDER BY c.store_id
      LIMIT 1
    ) AS next_store
    WHERE page.position < greatest(0, least(coalesce(store_limit, 0), 100))
  )
  SELECT page.store_id FROM page WHERE page.position > 0 ORDER BY page.position
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION campaign_cancelled_stores(uuid, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION campaign_cancelled_stores(uuid, integer) TO dakly_app;
