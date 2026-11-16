CREATE UNIQUE INDEX "sms_sender_ids_store_id_active_key" ON "sms_sender_ids" USING btree ("store_id") WHERE "sms_sender_ids"."status" <> 'rejected';--> statement-breakpoint
-- Staff review requests from every store without switching row security off (ADR 0005).
CREATE FUNCTION open_sms_sender_ids(after_id uuid, row_limit integer)
RETURNS TABLE (id uuid, store_id uuid, store_name text, sender_name text, status text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT r.id, r.store_id, s.name, r.sender_name, r.status, r.created_at
  FROM public.sms_sender_ids r
  JOIN public.stores s ON s.id=r.store_id
  WHERE r.status IN ('requested', 'in_review') AND (after_id IS NULL OR r.id>after_id)
  ORDER BY r.id
  LIMIT least(row_limit, 101)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION open_sms_sender_ids(uuid, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION open_sms_sender_ids(uuid, integer) TO dakly_app;
