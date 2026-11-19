CREATE INDEX "contacts_birthday_idx" ON "contacts" USING btree ("store_id","birthday_month","birthday_day","id") WHERE "contacts"."deleted_at" is null and "contacts"."birthday_month" is not null;--> statement-breakpoint
CREATE INDEX "outbox_events_automation_preview_idx" ON "outbox_events" USING btree ("store_id","type","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE type in ('consent.changed', 'contact.tag_added', 'contact.birthday');--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_birthday_contact_day_key" ON "outbox_events" USING btree ("store_id",(payload->>'contactId'),(payload->>'day')) WHERE type = 'contact.birthday';--> statement-breakpoint
-- The app role can only insert into the outbox. Give it just the preview fields
-- for the store set by TenantDatabase and the three workflow event types.
CREATE FUNCTION public.automation_trigger_preview(
  p_type text, p_channels text[], p_sources text[],
  p_tag text, p_before timestamptz, p_before_id uuid, p_limit integer
) RETURNS TABLE(id uuid, contact_id uuid, occurred_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT e.id, (e.payload->>'contactId')::uuid, e.occurred_at
  FROM public.outbox_events e
  WHERE e.store_id = NULLIF(current_setting('app.store_id', true), '')::uuid
    AND e.type = p_type
    AND e.type IN ('consent.changed', 'contact.tag_added', 'contact.birthday')
    AND (p_before IS NULL OR (e.occurred_at, e.id) < (p_before, p_before_id))
    AND CASE e.type
      WHEN 'consent.changed' THEN e.payload->>'status' = 'granted'
        AND e.payload->>'source' <> 'import'
        AND (p_channels IS NULL OR e.payload->>'channel' = ANY(p_channels))
        AND (p_sources IS NULL OR e.payload->>'source' = ANY(p_sources))
      WHEN 'contact.tag_added' THEN e.payload->>'tag' = p_tag
      ELSE true
    END
  ORDER BY e.occurred_at DESC, e.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.automation_trigger_preview(text, text[], text[], text, timestamptz, uuid, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.automation_trigger_preview(text, text[], text[], text, timestamptz, uuid, integer) TO dakly_app;
