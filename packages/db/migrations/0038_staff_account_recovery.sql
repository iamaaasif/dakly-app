CREATE TABLE "staff_recovery_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_recovery_history_reason" CHECK ("staff_recovery_history"."reason_type" in ('lost_phone', 'lost_authenticator', 'lost_email'))
);
--> statement-breakpoint
ALTER TABLE "staff_recovery_history" ADD CONSTRAINT "staff_recovery_history_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_recovery_history" ADD CONSTRAINT "staff_recovery_history_audit_id_staff_audit_log_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."staff_audit_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_recovery_history" ADD CONSTRAINT "staff_recovery_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_recovery_history_store_audit_key" ON "staff_recovery_history" USING btree ("store_id","audit_id");--> statement-breakpoint
CREATE INDEX "staff_recovery_history_store_id_idx" ON "staff_recovery_history" USING btree ("store_id","id");--> statement-breakpoint
CREATE INDEX "staff_recovery_history_audit_id_idx" ON "staff_recovery_history" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "staff_recovery_history_user_id_idx" ON "staff_recovery_history" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE staff_recovery_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_recovery_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staff_recovery_history USING (store_id = nullif(current_setting('app.store_id', true), '')::uuid);
GRANT SELECT ON staff_recovery_history TO dakly_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON staff_recovery_history FROM dakly_app;
--> statement-breakpoint
CREATE FUNCTION public.staff_recovery_stores(target_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE targets uuid[]; recipients jsonb;
BEGIN
 SELECT array_agg(s.store_id ORDER BY s.store_id) INTO targets FROM
   (SELECT store_id FROM public.memberships WHERE user_id=target_user AND status='active' ORDER BY store_id LIMIT 101) s;
 IF cardinality(targets)>100 THEN RETURN jsonb_build_object('overflow',true,'stores','[]'::jsonb,'owners','[]'::jsonb); END IF;
 PERFORM id FROM public.stores WHERE id=ANY(targets) ORDER BY id FOR NO KEY UPDATE;
 SELECT coalesce(jsonb_agg(r),'[]'::jsonb) INTO recipients FROM (
   SELECT DISTINCT u.id AS "userId", CASE WHEN u.phone_verified_at IS NOT NULL THEN u.phone END AS phone,
     CASE WHEN u.email_verified_at IS NOT NULL THEN u.email::text END AS email
   FROM public.memberships m JOIN public.users u ON u.id=m.user_id
   WHERE m.store_id=ANY(targets) AND m.status='active' AND m.built_in_role='owner'
   ORDER BY u.id LIMIT 1001
 ) r;
 RETURN jsonb_build_object('overflow',jsonb_array_length(recipients)>1000,'stores',coalesce(to_jsonb(targets),'[]'::jsonb),'owners',recipients);
END $$;
CREATE FUNCTION public.record_staff_recovery_history(recovery_audit uuid, target_stores uuid[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
 INSERT INTO public.staff_recovery_history(id,store_id,audit_id,user_id,reason_type,created_at)
 SELECT gen_random_uuid(),m.store_id,a.id,a.target_id,a.action_details->>'reasonType',a.created_at
 FROM public.staff_audit_log a JOIN public.memberships m ON m.user_id=a.target_id AND m.status='active'
 WHERE a.id=recovery_audit AND a.action='account.recovered' AND m.store_id=ANY(target_stores)
$$;
REVOKE ALL ON FUNCTION public.staff_recovery_stores(uuid),public.record_staff_recovery_history(uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_recovery_stores(uuid),public.record_staff_recovery_history(uuid,uuid[]) TO dakly_app;
