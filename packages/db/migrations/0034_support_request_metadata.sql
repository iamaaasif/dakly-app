CREATE FUNCTION support_grant_store(staff_id uuid,grant_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$ SELECT store_id FROM public.support_grants WHERE id=grant_id AND staff_user_id=staff_id $$;
CREATE FUNCTION support_request_metadata(staff_id uuid,before_id uuid) RETURNS TABLE(id uuid,"staffName" text,scopes text[],access text,status text,reason text,"durationMinutes" integer,"requestedAt" text,"expiresAt" text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
 SELECT g.id,u.name,g.scopes,g.access,CASE WHEN (g.status='requested' AND g.requested_at<=clock_timestamp()-interval '30 minutes') OR (g.status='approved' AND g.expires_at<=clock_timestamp()) THEN 'expired' ELSE g.status END,g.reason,g.duration_minutes,to_char(g.requested_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),to_char(g.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') FROM public.support_grants g JOIN public.staff_users u ON u.id=g.staff_user_id WHERE g.staff_user_id=staff_id AND (before_id IS NULL OR g.id<before_id) ORDER BY g.id DESC LIMIT 50
$$;
CREATE OR REPLACE FUNCTION support_store_targets(search text) RETURNS TABLE(id uuid,name text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
 IF search ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN QUERY SELECT s.id,s.name FROM public.stores s WHERE s.id=search::uuid;
 ELSE RETURN QUERY SELECT s.id,s.name FROM public.stores s WHERE s.slug=search LIMIT 1;
 END IF;
END $$;
REVOKE ALL ON FUNCTION support_grant_store(uuid,uuid), support_request_metadata(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION support_grant_store(uuid,uuid), support_request_metadata(uuid,uuid) TO dakly_app;
DROP FUNCTION support_staff_grants(uuid);
CREATE INDEX support_grants_staff_id_idx ON support_grants(staff_user_id,id);
CREATE INDEX support_grants_store_id_idx ON support_grants(store_id,id);
