ALTER TABLE "campaign_recipients" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "sms_credits" integer;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "send_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "short_link_base" text;--> statement-breakpoint
CREATE INDEX "campaigns_sending_idx" ON "campaigns" USING btree ("store_id","started_at","id") WHERE "campaigns"."status" = 'sending';--> statement-breakpoint
-- Campaigns that started before this column was filled get their approval time, so the sweep
-- orders every store's campaigns by when they started.
UPDATE campaigns SET started_at = approved_at
  WHERE status IN ('sending', 'paused', 'sent') AND started_at IS NULL;--> statement-breakpoint
-- The batch scheduler sees only store IDs. Each campaign read runs under store RLS.
CREATE FUNCTION campaign_sending_stores(after_store uuid, store_limit integer)
  RETURNS TABLE(store_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT c.store_id
  FROM public.campaigns c
  WHERE c.status = 'sending'
    AND (after_store IS NULL OR c.store_id > after_store)
  GROUP BY c.store_id
  ORDER BY c.store_id
  LIMIT greatest(0, least(coalesce(store_limit, 0), 100))
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION campaign_sending_stores(uuid, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION campaign_sending_stores(uuid, integer) TO dakly_app;
