-- The relay needs each row's attempts to report the tenth failure. A new returned column
-- changes the return type, so the function is dropped and created again with 0027's body.
DROP FUNCTION claim_outbox_events(integer);--> statement-breakpoint
CREATE FUNCTION claim_outbox_events(p_limit integer) RETURNS TABLE(id uuid, store_id uuid, type text, payload jsonb, occurred_at timestamptz, attempts smallint)
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE outbox_events o SET claimed_at = now(), attempts = o.attempts + 1
  WHERE o.id IN (
    SELECT e.id FROM outbox_events e
    WHERE e.published_at IS NULL AND e.attempts < 10
      AND (e.claimed_at IS NULL OR e.claimed_at < now() - interval '1 minute')
    ORDER BY e.id LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING o.id, o.store_id, o.type, o.payload, o.occurred_at, o.attempts
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION claim_outbox_events(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION claim_outbox_events(integer) TO dakly_app;
