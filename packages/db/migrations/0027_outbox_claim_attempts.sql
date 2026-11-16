-- A row that failed to relay ten times stays unpublished for a person to look at, instead of
-- being claimed again every minute. Same signature, return type and grants as in 0004.
CREATE OR REPLACE FUNCTION claim_outbox_events(p_limit integer) RETURNS TABLE(id uuid, store_id uuid, type text, payload jsonb, occurred_at timestamptz)
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE outbox_events o SET claimed_at = now(), attempts = o.attempts + 1
  WHERE o.id IN (
    SELECT e.id FROM outbox_events e
    WHERE e.published_at IS NULL AND e.attempts < 10
      AND (e.claimed_at IS NULL OR e.claimed_at < now() - interval '1 minute')
    ORDER BY e.id LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING o.id, o.store_id, o.type, o.payload, o.occurred_at
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION claim_outbox_events(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION claim_outbox_events(integer) TO dakly_app;
