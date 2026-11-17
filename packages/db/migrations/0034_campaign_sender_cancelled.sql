ALTER TABLE "campaigns" ADD COLUMN "settled_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "campaigns_unsettled_idx" ON "campaigns" USING btree ("store_id","started_at","id") WHERE "campaigns"."status" = 'cancelled' and "campaigns"."started_at" is not null and "campaigns"."settled_at" is null;--> statement-breakpoint
-- A cancelled campaign stays named until its reservation is settled, so the sender fails its
-- recipients left in sending, never resending them, and then settles. Still one campaign per
-- store, the earliest started.
CREATE OR REPLACE FUNCTION sending_campaigns() RETURNS TABLE(store_id uuid, campaign_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT ON (c.store_id) c.store_id, c.id FROM public.campaigns c
  WHERE c.status = 'sending'
    OR (c.status = 'cancelled' AND c.started_at IS NOT NULL AND c.settled_at IS NULL)
  ORDER BY c.store_id, c.started_at, c.id
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION sending_campaigns() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sending_campaigns() TO dakly_app;
