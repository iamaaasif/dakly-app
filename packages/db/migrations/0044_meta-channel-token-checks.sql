CREATE FUNCTION meta_channel_connections_due(p_before timestamptz, p_after uuid)
RETURNS TABLE(store_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT connection.store_id
  FROM public.channel_connections AS connection
  WHERE connection.status = 'active'
    AND connection.kind IN ('facebook_page', 'instagram')
    AND connection.access_token_ciphertext IS NOT NULL
    AND connection.key_version IS NOT NULL
    AND (connection.token_expires_at IS NULL OR connection.token_expires_at <= p_before)
    AND (p_after IS NULL OR connection.store_id > p_after)
  ORDER BY connection.store_id
  LIMIT 100
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION meta_channel_connections_due(timestamptz, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION meta_channel_connections_due(timestamptz, uuid) TO dakly_app;--> statement-breakpoint
DROP FUNCTION channel_connections_expiring_before(timestamptz);
