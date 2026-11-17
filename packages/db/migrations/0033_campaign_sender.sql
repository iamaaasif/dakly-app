ALTER TABLE "campaign_recipients" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "sms_credits" integer;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "send_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "campaigns_sending_idx" ON "campaigns" USING btree ("id") WHERE "campaigns"."status" = 'sending';--> statement-breakpoint
-- The sender's sweep runs across stores without turning RLS off: this names the campaigns that
-- are sending, and each one's recipients are claimed per store as dakly_app.
CREATE FUNCTION sending_campaigns() RETURNS TABLE(store_id uuid, campaign_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT c.store_id, c.id FROM public.campaigns c WHERE c.status = 'sending'
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION sending_campaigns() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION sending_campaigns() TO dakly_app;
