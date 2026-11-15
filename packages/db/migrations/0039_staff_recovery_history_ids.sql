-- History cursors use application-generated UUID v7, like account and staff events.
DROP FUNCTION public.record_staff_recovery_history(uuid,uuid[]);
--> statement-breakpoint
CREATE FUNCTION public.record_staff_recovery_history(recovery_audit uuid, target_stores uuid[], history_ids uuid[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
 INSERT INTO public.staff_recovery_history(id,store_id,audit_id,user_id,reason_type,created_at)
 SELECT h.id,m.store_id,a.id,a.target_id,a.action_details->>'reasonType',a.created_at
 FROM public.staff_audit_log a JOIN public.memberships m ON m.user_id=a.target_id AND m.status='active'
 JOIN unnest(target_stores,history_ids) h(store_id,id) ON h.store_id=m.store_id
 WHERE a.id=recovery_audit AND a.action='account.recovered'
$$;
REVOKE ALL ON FUNCTION public.record_staff_recovery_history(uuid,uuid[],uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_staff_recovery_history(uuid,uuid[],uuid[]) TO dakly_app;
