CREATE FUNCTION public.user_store_page(target_user uuid, after_store uuid, page_limit integer)
RETURNS TABLE (store_id uuid, store_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
 SELECT s.id,s.name FROM public.memberships m JOIN public.stores s ON s.id=m.store_id
 WHERE m.user_id=target_user AND m.status='active' AND (after_store IS NULL OR m.store_id>after_store)
 ORDER BY m.store_id LIMIT LEAST(GREATEST(page_limit,1),51)
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.user_store_page(uuid,uuid,integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.user_store_page(uuid,uuid,integer) TO dakly_app;
--> statement-breakpoint
CREATE FUNCTION public.user_store_context(target_user uuid, selected_store uuid)
RETURNS TABLE (has_memberships boolean, store_id uuid, store_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.memberships WHERE user_id=target_user AND status='active'),chosen.id,chosen.name
 FROM (SELECT 1) singleton LEFT JOIN (
   SELECT s.id,s.name FROM public.memberships m JOIN public.stores s ON s.id=m.store_id
   WHERE m.user_id=target_user AND m.status='active' AND m.store_id=selected_store
 ) chosen ON true
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.user_store_context(uuid,uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.user_store_context(uuid,uuid) TO dakly_app;
