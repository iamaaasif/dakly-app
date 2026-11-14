ALTER TABLE "staff_recovery_history" DROP CONSTRAINT "staff_recovery_history_reason";--> statement-breakpoint
ALTER TABLE "staff_recovery_history" DROP CONSTRAINT "staff_recovery_history_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "staff_recovery_history_store_audit_key";--> statement-breakpoint
DROP INDEX "staff_recovery_history_store_id_idx";--> statement-breakpoint
DROP INDEX "staff_recovery_history_user_id_idx";--> statement-breakpoint
ALTER TABLE "staff_recovery_history" DROP CONSTRAINT "staff_recovery_history_pkey";--> statement-breakpoint
ALTER TABLE "staff_recovery_history" ADD CONSTRAINT "staff_recovery_history_store_id_audit_id_pk" PRIMARY KEY("store_id","audit_id");--> statement-breakpoint
ALTER TABLE "staff_recovery_history" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "staff_recovery_history" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "staff_recovery_history" DROP COLUMN "reason_type";--> statement-breakpoint
ALTER TABLE "staff_recovery_history" DROP COLUMN "created_at";--> statement-breakpoint
DROP FUNCTION public.record_staff_recovery_history(uuid,uuid[],uuid[]);
CREATE FUNCTION public.record_staff_recovery_history(recovery_audit uuid, target_stores uuid[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
 INSERT INTO public.staff_recovery_history(store_id,audit_id)
 SELECT m.store_id,a.id
 FROM public.staff_audit_log a JOIN public.memberships m ON m.user_id=a.target_id AND m.status='active'
 WHERE a.id=recovery_audit AND a.action='account.recovered' AND a.target_type='user' AND a.staff_user_id IS NOT NULL
 AND a.action_details->>'reasonType' IN ('lost_phone','lost_authenticator','lost_email') AND m.store_id=ANY(target_stores)
$$;
REVOKE ALL ON FUNCTION public.record_staff_recovery_history(uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_staff_recovery_history(uuid,uuid[]) TO dakly_app;
