-- The daily maintenance job deletes expired rows in bounded batches. The age check lives in each
-- function, so no caller can remove a fresh row, and the app role still has no DELETE right.
-- It replaces purge_published_outbox_events(), which deleted every expired row in one statement.
DROP FUNCTION public.purge_published_outbox_events(timestamptz);
--> statement-breakpoint
-- ctid = any(array(...)) runs the picker once; "in (select ... limit)" can run it again per row.
CREATE FUNCTION public.purge_published_outbox_batch(p_limit integer)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE deleted_count integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 5000' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.outbox_events WHERE ctid = ANY(ARRAY(
    SELECT ctid FROM public.outbox_events
    WHERE published_at < now() - interval '7 days'
    LIMIT p_limit FOR UPDATE SKIP LOCKED));
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.purge_published_outbox_batch(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.purge_published_outbox_batch(integer) TO dakly_app;
--> statement-breakpoint
-- Billing periods are monthly or yearly, so a period that started 13 months ago has closed and
-- been invoiced. Invoice lines and store_daily_metrics keep the totals.
CREATE FUNCTION public.purge_expired_usage_events(p_limit integer)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE deleted_count integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 5000' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.usage_events WHERE ctid = ANY(ARRAY(
    SELECT ctid FROM public.usage_events
    WHERE period_start < (now() AT TIME ZONE 'UTC')::date - interval '13 months'
    LIMIT p_limit FOR UPDATE SKIP LOCKED));
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.purge_expired_usage_events(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.purge_expired_usage_events(integer) TO dakly_app;
