ALTER TABLE "subscriptions" ADD COLUMN "last_payment_intent_id" uuid;--> statement-breakpoint
CREATE FUNCTION due_subscription_renewals(p_now timestamptz, p_after uuid, p_limit integer) RETURNS TABLE(store_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT s.store_id FROM subscriptions s
  WHERE ((s.status IN ('trialing', 'active') AND s.current_period_end <= p_now)
      OR (s.status = 'past_due' AND s.next_renewal_attempt_at <= p_now))
    AND (p_after IS NULL OR s.store_id > p_after)
  ORDER BY s.store_id LIMIT p_limit
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION due_subscription_renewals(timestamptz, uuid, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION due_subscription_renewals(timestamptz, uuid, integer) TO dakly_app;
