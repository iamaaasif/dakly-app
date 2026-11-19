ALTER TABLE "campaign_recipients" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "sms_credits" integer;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "send_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "short_link_base" text;--> statement-breakpoint
CREATE INDEX "campaigns_sending_idx" ON "campaigns" USING btree ("store_id","started_at","id") WHERE "campaigns"."status" = 'sending';--> statement-breakpoint
-- The batch scheduler sees one sending campaign per store. Work is done under store RLS.
CREATE FUNCTION sending_campaigns(after_store uuid, store_limit integer)
  RETURNS TABLE(store_id uuid, campaign_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT ON (c.store_id) c.store_id, c.id
  FROM public.campaigns c
  WHERE c.status = 'sending'
    AND (after_store IS NULL OR c.store_id > after_store)
  ORDER BY c.store_id, c.started_at, c.id
  LIMIT greatest(0, least(coalesce(store_limit, 0), 100))
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION sending_campaigns(uuid, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sending_campaigns(uuid, integer) TO dakly_app;
