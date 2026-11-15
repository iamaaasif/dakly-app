CREATE FUNCTION public.locked_account_store_owner_contacts(target_user uuid)
RETURNS TABLE (user_id uuid, phone text, email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
 -- The caller holds the account row lock, which also serializes new memberships.
 PERFORM s.id FROM public.stores s JOIN public.memberships m ON m.store_id=s.id
 WHERE m.user_id=target_user AND m.status='active' ORDER BY s.id FOR NO KEY UPDATE OF s;
 -- A removal or transfer can commit while a store lock is queued; use a fresh snapshot.
 RETURN QUERY SELECT c.user_id,c.phone,c.email
 FROM public.account_store_owner_contacts(target_user,null::uuid,1001) c;
END $$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.locked_account_store_owner_contacts(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.locked_account_store_owner_contacts(uuid) TO dakly_app;
