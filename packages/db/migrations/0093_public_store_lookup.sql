-- A buyer opens the order link without a session, so the store is found from the slug alone.
-- Only an active shop is returned, and only its id and name.
CREATE FUNCTION public_store_for_slug(p_slug text)
  RETURNS TABLE(store_id uuid, store_name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT id, name FROM stores WHERE slug = p_slug AND status = 'active'
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public_store_for_slug(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public_store_for_slug(text) TO dakly_app;
