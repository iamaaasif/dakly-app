CREATE INDEX "webhook_events_recovery_idx" ON "webhook_events" USING btree ("provider","status","received_at","id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.purge_webhook_events(p_before timestamptz) RETURNS integer
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH batch AS (
    SELECT id FROM public.webhook_events
    WHERE received_at < p_before AND status <> 'received'
    ORDER BY received_at
    LIMIT 5000
    FOR UPDATE SKIP LOCKED
  ), gone AS (
    DELETE FROM public.webhook_events AS event USING batch WHERE event.id = batch.id
    RETURNING 1
  )
  SELECT count(*)::integer FROM gone
$$;
