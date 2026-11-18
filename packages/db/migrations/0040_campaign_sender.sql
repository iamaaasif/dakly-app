ALTER TABLE "campaign_recipients" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "sms_credits" integer;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "send_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "campaigns_sending_idx" ON "campaigns" USING btree ("store_id","started_at","id") WHERE "campaigns"."status" = 'sending';--> statement-breakpoint
-- Campaigns that started before this column was filled get their approval time, so the sweep
-- orders every store's campaigns by when they started.
UPDATE campaigns SET started_at = approved_at
  WHERE status IN ('sending', 'paused', 'sent') AND started_at IS NULL;--> statement-breakpoint
-- The sender's sweep runs across stores without turning RLS off: this names one sending
-- campaign per store, the earliest started, and its recipients are claimed per store as
-- dakly_app. A store's next campaign is named once that one stops sending.
CREATE FUNCTION sending_campaigns() RETURNS TABLE(store_id uuid, campaign_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT ON (c.store_id) c.store_id, c.id FROM public.campaigns c
  WHERE c.status = 'sending'
  ORDER BY c.store_id, c.started_at, c.id
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION sending_campaigns() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sending_campaigns() TO dakly_app;
