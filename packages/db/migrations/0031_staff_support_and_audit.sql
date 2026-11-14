CREATE TABLE "staff_audit_exports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"staff_session_id" uuid NOT NULL,
	"staff_name" text NOT NULL,
	"filter" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_id" uuid,
	"leased_until" timestamp with time zone,
	"contents" text,
	"error" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_user_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"staff_session_id" uuid NOT NULL,
	"handoff_hash" "bytea" NOT NULL,
	"token_hash" "bytea",
	"handoff_expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_audit_log" DROP CONSTRAINT "staff_audit_log_actor";--> statement-breakpoint
ALTER TABLE "staff_audit_log" ADD COLUMN "actor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "support_grants" ADD COLUMN "duration_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "support_grants" ADD COLUMN "staff_session_id" uuid;--> statement-breakpoint
ALTER TABLE "staff_audit_exports" ADD CONSTRAINT "staff_audit_exports_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_audit_exports" ADD CONSTRAINT "staff_audit_exports_staff_session_id_staff_sessions_id_fk" FOREIGN KEY ("staff_session_id") REFERENCES "public"."staff_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_user_links" ADD CONSTRAINT "staff_user_links_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_user_links" ADD CONSTRAINT "staff_user_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_grant_id_support_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."support_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_staff_session_id_staff_sessions_id_fk" FOREIGN KEY ("staff_session_id") REFERENCES "public"."staff_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_audit_exports_staff_idx" ON "staff_audit_exports" USING btree ("staff_user_id");--> statement-breakpoint
CREATE INDEX "staff_audit_exports_session_idx" ON "staff_audit_exports" USING btree ("staff_session_id");--> statement-breakpoint
CREATE INDEX "staff_audit_exports_pending_idx" ON "staff_audit_exports" USING btree ("status","leased_until");--> statement-breakpoint
CREATE INDEX "staff_audit_exports_expiry_idx" ON "staff_audit_exports" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_user_links_identity_key" ON "staff_user_links" USING btree ("staff_user_id","user_id");--> statement-breakpoint
CREATE INDEX "staff_user_links_user_idx" ON "staff_user_links" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "support_sessions_handoff_key" ON "support_sessions" USING btree ("handoff_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "support_sessions_token_key" ON "support_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "support_sessions_store_idx" ON "support_sessions" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "support_sessions_grant_idx" ON "support_sessions" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "support_sessions_staff_idx" ON "support_sessions" USING btree ("staff_user_id");--> statement-breakpoint
CREATE INDEX "support_sessions_parent_idx" ON "support_sessions" USING btree ("staff_session_id");--> statement-breakpoint
ALTER TABLE "support_grants" ADD CONSTRAINT "support_grants_staff_session_id_staff_sessions_id_fk" FOREIGN KEY ("staff_session_id") REFERENCES "public"."staff_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_grants_staff_session_id_idx" ON "support_grants" USING btree ("staff_session_id");--> statement-breakpoint
ALTER TABLE "staff_audit_log" ADD CONSTRAINT "staff_audit_log_actor" CHECK (num_nonnulls("staff_audit_log"."staff_user_id", "staff_audit_log"."operator_identity", "staff_audit_log"."actor_user_id") = 1);--> statement-breakpoint
ALTER TABLE support_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_isolation ON support_sessions USING (store_id = current_setting('app.store_id', true)::uuid) WITH CHECK (store_id = current_setting('app.store_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE ON support_sessions, staff_audit_exports TO dakly_app;
GRANT DELETE ON staff_audit_exports TO dakly_app;
GRANT SELECT ON staff_user_links TO dakly_app;
REVOKE UPDATE, DELETE, TRUNCATE ON staff_audit_log, staff_audit_log_days, staff_user_links FROM dakly_app;
REVOKE INSERT ON staff_audit_log_days FROM dakly_app;
CREATE INDEX staff_audit_log_order_idx ON staff_audit_log(created_at, id);
CREATE INDEX staff_audit_log_action_idx ON staff_audit_log(action, created_at, id);
--> statement-breakpoint
CREATE FUNCTION preserve_staff_user_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE contact record; identity record;
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    FOR contact IN SELECT DISTINCT kind, value FROM (
      SELECT 'phone' AS kind, x->>'phone' AS value FROM unnest(ARRAY[to_jsonb(OLD),to_jsonb(NEW)]) x WHERE x->>'phoneVerifiedAt' IS NOT NULL OR x->>'phone_verified_at' IS NOT NULL
      UNION ALL SELECT 'email', lower(x->>'email') FROM unnest(ARRAY[to_jsonb(OLD),to_jsonb(NEW)]) x WHERE x->>'email_verified_at' IS NOT NULL
    ) c WHERE value IS NOT NULL ORDER BY kind,value LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('staff-identity:' || contact.kind || ':' || contact.value, 0));
      INSERT INTO public.staff_user_links(id,staff_user_id,user_id)
      SELECT gen_random_uuid(), c.staff_user_id, NEW.id FROM public.staff_identity_contacts c
      WHERE c.kind=contact.kind AND c.value=contact.value ON CONFLICT DO NOTHING;
    END LOOP;
    RETURN NEW;
  END IF;
  FOR contact IN SELECT DISTINCT x->>'kind' AS kind, x->>'value' AS value, (x->>'staff_user_id')::uuid AS staff_id
      FROM unnest(ARRAY[to_jsonb(OLD),to_jsonb(NEW)]) x WHERE x->>'value' IS NOT NULL ORDER BY kind,value LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('staff-identity:' || contact.kind || ':' || contact.value, 0));
    INSERT INTO public.staff_user_links(id,staff_user_id,user_id)
    SELECT gen_random_uuid(),contact.staff_id,u.id FROM public.users u
    WHERE (contact.kind='phone' AND u.phone=contact.value AND u.phone_verified_at IS NOT NULL)
       OR (contact.kind='email' AND u.email=contact.value AND u.email_verified_at IS NOT NULL)
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN COALESCE(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION preserve_staff_user_identity() FROM PUBLIC;
CREATE TRIGGER users_staff_identity BEFORE INSERT OR UPDATE OF phone,email,phone_verified_at,email_verified_at ON users FOR EACH ROW EXECUTE FUNCTION preserve_staff_user_identity();
CREATE TRIGGER contacts_staff_identity AFTER INSERT OR UPDATE OR DELETE ON staff_identity_contacts FOR EACH ROW EXECUTE FUNCTION preserve_staff_user_identity();
-- Backfill once; runtime checks use the unique association index.
INSERT INTO staff_user_links(id,staff_user_id,user_id)
SELECT gen_random_uuid(),c.staff_user_id,u.id FROM staff_identity_contacts c JOIN users u
ON (c.kind='phone' AND u.phone=c.value AND u.phone_verified_at IS NOT NULL)
OR (c.kind='email' AND u.email=c.value AND u.email_verified_at IS NOT NULL) ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION staff_conflicts_with_store(staff_id uuid, target_store uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT EXISTS(SELECT 1 FROM public.staff_user_links l JOIN public.memberships m ON m.user_id=l.user_id WHERE l.staff_user_id=staff_id AND m.store_id=target_store AND m.status='active')
$$;
CREATE FUNCTION support_session_store(proof bytea, handoff boolean) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT store_id FROM public.support_sessions WHERE (handoff AND handoff_hash=proof AND consumed_at IS NULL AND handoff_expires_at>clock_timestamp()) OR (NOT handoff AND token_hash=proof) LIMIT 1
$$;
CREATE FUNCTION support_staff_grants(staff_id uuid) RETURNS TABLE(store_id uuid,id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT g.store_id,g.id FROM public.support_grants g WHERE g.staff_user_id=staff_id ORDER BY g.requested_at DESC LIMIT 50
$$;
CREATE FUNCTION support_store_targets(search text) RETURNS TABLE(id uuid,name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT s.id,s.name FROM public.stores s WHERE s.id::text=search OR s.slug=search ORDER BY s.id LIMIT 1
$$;
REVOKE ALL ON FUNCTION staff_conflicts_with_store(uuid,uuid), support_session_store(bytea,boolean), support_staff_grants(uuid), support_store_targets(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION staff_conflicts_with_store(uuid,uuid), support_session_store(bytea,boolean), support_staff_grants(uuid), support_store_targets(text) TO dakly_app;
--> statement-breakpoint
-- Writers only share their own UTC-day lock; sealing never blocks a different day's writers.
CREATE FUNCTION stamp_staff_audit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE bucket date; stamped timestamptz;
BEGIN
 LOOP
  bucket := (clock_timestamp() AT TIME ZONE 'UTC')::date;
  PERFORM pg_advisory_xact_lock_shared(41202, bucket - DATE '2000-01-01');
  stamped := clock_timestamp();
  EXIT WHEN (stamped AT TIME ZONE 'UTC')::date=bucket;
 END LOOP;
 NEW.created_at := stamped;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION stamp_staff_audit() FROM PUBLIC;
CREATE TRIGGER staff_audit_timestamp BEFORE INSERT ON staff_audit_log FOR EACH ROW EXECUTE FUNCTION stamp_staff_audit();
--> statement-breakpoint
-- pg_catalog.sha256 avoids an additional extension. JSON array field order is the v1 format.
CREATE FUNCTION staff_audit_day_hash(target_day date, previous bytea) RETURNS TABLE(hash bytea,row_count integer) LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE item record; current_hash bytea; total integer:=0;
BEGIN
 current_hash := sha256(convert_to('dakly-staff-audit-v1:' || target_day::text || ':' || coalesce(encode(previous,'hex'),''),'UTF8'));
 FOR item IN SELECT jsonb_build_array(id,staff_user_id,actor_user_id,operator_identity,action,store_id,target_type,target_id,reason,action_details,host(ip),to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text AS canonical
 FROM public.staff_audit_log WHERE created_at >= target_day::timestamp AT TIME ZONE 'UTC' AND created_at < (target_day+1)::timestamp AT TIME ZONE 'UTC' ORDER BY created_at,id LOOP
  current_hash := sha256(current_hash || convert_to(item.canonical,'UTF8')); total:=total+1;
 END LOOP;
 RETURN QUERY SELECT current_hash,total;
END $$;
REVOKE ALL ON FUNCTION staff_audit_day_hash(date,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION staff_audit_day_hash(date,bytea) TO dakly_app;
CREATE FUNCTION seal_staff_audit_day() RETURNS date LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE target_day date; previous bytea; result record;
BEGIN
 -- Serialize sealers, never ordinary inserts. One call seals at most one day.
 PERFORM pg_advisory_xact_lock(41203,0);
 SELECT day+1,hash INTO target_day,previous FROM public.staff_audit_log_days ORDER BY day DESC LIMIT 1;
 IF target_day IS NULL THEN SELECT (min(created_at) AT TIME ZONE 'UTC')::date INTO target_day FROM public.staff_audit_log; END IF;
 IF target_day IS NULL OR target_day >= (clock_timestamp() AT TIME ZONE 'UTC')::date THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(41202,target_day - DATE '2000-01-01');
 SELECT * INTO result FROM public.staff_audit_day_hash(target_day,previous);
 INSERT INTO public.staff_audit_log_days(day,row_count,previous_hash,hash,sealed_at) VALUES(target_day,result.row_count,previous,result.hash,clock_timestamp());
 RETURN target_day;
END $$;
REVOKE ALL ON FUNCTION seal_staff_audit_day() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seal_staff_audit_day() TO dakly_app;
