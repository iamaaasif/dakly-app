CREATE INDEX "notifications_snoozed_until_idx" ON "notifications" USING btree ("snoozed_until") WHERE "notifications"."status" = 'snoozed';--> statement-breakpoint
-- The wake sweep runs across stores without turning RLS off: this names the stores with a card
-- to wake, and the wake itself runs per store as dakly_app.
CREATE FUNCTION stores_with_snoozes_due(p_as_of timestamptz) RETURNS TABLE(store_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT n.store_id FROM notifications n
  WHERE n.status = 'snoozed' AND n.snoozed_until <= p_as_of
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION stores_with_snoozes_due(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION stores_with_snoozes_due(timestamptz) TO dakly_app;
