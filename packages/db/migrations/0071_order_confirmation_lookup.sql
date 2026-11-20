-- A customer opens the link without a session, so the store is found from the token alone.
CREATE FUNCTION order_confirmation_for_token(p_token_hash bytea)
  RETURNS TABLE(store_id uuid, confirmation_id uuid, order_id uuid, used_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id, order_id, used_at FROM order_confirmations WHERE token_hash = p_token_hash
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION order_confirmation_for_token(bytea) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION order_confirmation_for_token(bytea) TO dakly_app;
