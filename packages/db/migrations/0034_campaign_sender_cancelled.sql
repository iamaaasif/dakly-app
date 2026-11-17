CREATE INDEX "campaign_recipients_sending_idx" ON "campaign_recipients" USING btree ("campaign_id") WHERE "campaign_recipients"."status" = 'sending';--> statement-breakpoint
-- A cancelled campaign whose recipients are still in sending is named too, so the sender resolves
-- them and settles the reservation once the last one is sent or failed.
CREATE OR REPLACE FUNCTION sending_campaigns() RETURNS TABLE(store_id uuid, campaign_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT c.store_id, c.id FROM public.campaigns c WHERE c.status = 'sending'
  UNION
  SELECT DISTINCT r.store_id, r.campaign_id FROM public.campaign_recipients r
  JOIN public.campaigns c ON c.id = r.campaign_id
  WHERE r.status = 'sending' AND c.status = 'cancelled'
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION sending_campaigns() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sending_campaigns() TO dakly_app;
