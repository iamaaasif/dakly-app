CREATE OR REPLACE FUNCTION public.staff_recovery_stores(target_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE targets uuid[]; recipients jsonb;
BEGIN
 SELECT array_agg(s.store_id ORDER BY s.store_id) INTO targets FROM
   (SELECT store_id FROM public.memberships WHERE user_id=target_user AND status='active' ORDER BY store_id LIMIT 101) s;
 IF cardinality(targets)>100 THEN RETURN jsonb_build_object('overflow',true,'stores','[]'::jsonb,'owners','[]'::jsonb); END IF;
 PERFORM id FROM public.stores WHERE id=ANY(targets) ORDER BY id FOR NO KEY UPDATE;
 -- Membership removal can commit while the sorted store locks are queued.
 SELECT array_agg(m.store_id ORDER BY m.store_id) INTO targets FROM public.memberships m
 WHERE m.user_id=target_user AND m.status='active' AND m.store_id=ANY(targets);
 SELECT coalesce(jsonb_agg(r),'[]'::jsonb) INTO recipients FROM (
   SELECT DISTINCT u.id AS "userId", CASE WHEN u.phone_verified_at IS NOT NULL THEN u.phone END AS phone,
     CASE WHEN u.email_verified_at IS NOT NULL THEN u.email::text END AS email
   FROM public.memberships m JOIN public.users u ON u.id=m.user_id
   WHERE m.store_id=ANY(targets) AND m.status='active' AND m.built_in_role='owner'
   ORDER BY u.id LIMIT 1001
 ) r;
 RETURN jsonb_build_object('overflow',jsonb_array_length(recipients)>1000,'stores',coalesce(to_jsonb(targets),'[]'::jsonb),'owners',recipients);
END $$;
