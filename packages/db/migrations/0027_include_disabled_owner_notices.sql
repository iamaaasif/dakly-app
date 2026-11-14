CREATE OR REPLACE FUNCTION account_store_owner_contacts(p_user_id uuid, p_after uuid, p_limit integer)
RETURNS TABLE (user_id uuid, phone text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT DISTINCT u.id, CASE WHEN u.phone_verified_at IS NOT NULL THEN u.phone END,
    CASE WHEN u.email_verified_at IS NOT NULL THEN u.email::text END
  FROM memberships person
  JOIN memberships owner ON owner.store_id = person.store_id AND owner.built_in_role = 'owner' AND owner.status = 'active'
  JOIN users u ON u.id = owner.user_id
  WHERE person.user_id = p_user_id AND person.status = 'active'
    AND (p_after IS NULL OR u.id > p_after)
  ORDER BY u.id LIMIT LEAST(GREATEST(p_limit,1),1001)
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION account_store_owner_contacts(uuid, uuid, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION account_store_owner_contacts(uuid, uuid, integer) TO dakly_app;
