ALTER TABLE "campaign_recipients" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "dispatch_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "opt_out_link_code" text;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "sms_credits" integer;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "send_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "settlement_pending_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "settled_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "campaigns_send_work_idx" ON "campaigns" USING btree ("store_id","status","started_at","id") WHERE ("campaigns"."status" = 'sending' and "campaigns"."short_link_base" is not null) or ("campaigns"."status" = 'cancelled' and "campaigns"."settlement_pending_at" is not null);--> statement-breakpoint
-- Only IDs cross RLS. The worker reads and locks each campaign in its store.
CREATE FUNCTION campaign_send_work_stores(as_of timestamptz, after_store uuid, store_limit integer)
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
      SELECT candidate.store_id
      FROM (
        (SELECT c.store_id FROM public.campaigns c
          WHERE c.status = 'scheduled' AND c.scheduled_for <= as_of
            AND c.store_id >= floor.store_id
          ORDER BY c.store_id LIMIT 1)
        UNION ALL
        (SELECT c.store_id FROM public.campaigns c
          WHERE ((c.status = 'sending' AND c.short_link_base IS NOT NULL)
            OR (c.status = 'cancelled' AND c.settlement_pending_at IS NOT NULL))
            AND c.store_id >= floor.store_id
          ORDER BY c.store_id LIMIT 1)
      ) AS candidate
      ORDER BY candidate.store_id LIMIT 1
    ) AS next_store
    WHERE page.position < greatest(0, least(coalesce(store_limit, 0), 100))
  )
  SELECT page.store_id FROM page WHERE page.position > 0 ORDER BY page.position
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION campaign_send_work_stores(timestamptz, uuid, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION campaign_send_work_stores(timestamptz, uuid, integer) TO dakly_app;
