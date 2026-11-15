CREATE TABLE staff_user_links (
  id uuid PRIMARY KEY NOT NULL,
  staff_user_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE support_sessions (
  id uuid PRIMARY KEY NOT NULL,
  store_id uuid NOT NULL,
  grant_id uuid NOT NULL,
  staff_user_id uuid NOT NULL,
  staff_session_id uuid NOT NULL,
  handoff_hash bytea NOT NULL,
  token_hash bytea,
  handoff_expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE staff_audit_exports (
  id uuid PRIMARY KEY NOT NULL,
  staff_user_id uuid NOT NULL,
  staff_session_id uuid NOT NULL,
  staff_name text NOT NULL,
  filter jsonb NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  progress integer DEFAULT 0 NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  lease_id uuid,
  leased_until timestamp with time zone,
  contents text,
  error text,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE staff_audit_log ALTER COLUMN staff_user_id DROP NOT NULL ;
--> statement-breakpoint
ALTER TABLE staff_audit_log ADD COLUMN operator_identity text;
--> statement-breakpoint
ALTER TABLE staff_audit_log ADD COLUMN actor_user_id uuid;
--> statement-breakpoint
ALTER TABLE support_grants ADD COLUMN duration_minutes integer DEFAULT 30 NOT NULL;
--> statement-breakpoint
ALTER TABLE staff_user_links ADD CONSTRAINT staff_user_links_staff_user_id_staff_users_id_fk FOREIGN KEY (staff_user_id) REFERENCES public.staff_users (id);
--> statement-breakpoint
ALTER TABLE staff_user_links ADD CONSTRAINT staff_user_links_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users (id);
--> statement-breakpoint
ALTER TABLE support_sessions ADD CONSTRAINT support_sessions_store_id_stores_id_fk FOREIGN KEY (store_id) REFERENCES public.stores (id);
--> statement-breakpoint
ALTER TABLE support_sessions ADD CONSTRAINT support_sessions_grant_id_support_grants_id_fk FOREIGN KEY (grant_id) REFERENCES public.support_grants (id);
--> statement-breakpoint
ALTER TABLE support_sessions ADD CONSTRAINT support_sessions_staff_user_id_staff_users_id_fk FOREIGN KEY (staff_user_id) REFERENCES public.staff_users (id);
--> statement-breakpoint
ALTER TABLE support_sessions ADD CONSTRAINT support_sessions_staff_session_id_staff_sessions_id_fk FOREIGN KEY (staff_session_id) REFERENCES public.staff_sessions (id);
--> statement-breakpoint
CREATE UNIQUE INDEX support_grants_store_id_id_key
  ON support_grants (store_id, id);
--> statement-breakpoint
ALTER TABLE support_sessions ADD CONSTRAINT support_sessions_grant_store_fk FOREIGN KEY (store_id, grant_id) REFERENCES public.support_grants (store_id, id);
--> statement-breakpoint
ALTER TABLE staff_audit_exports ADD CONSTRAINT staff_audit_exports_staff_user_id_staff_users_id_fk FOREIGN KEY (staff_user_id) REFERENCES public.staff_users (id);
--> statement-breakpoint
ALTER TABLE staff_audit_exports ADD CONSTRAINT staff_audit_exports_staff_session_id_staff_sessions_id_fk FOREIGN KEY (staff_session_id) REFERENCES public.staff_sessions (id);
--> statement-breakpoint
CREATE UNIQUE INDEX staff_user_links_identity_key
  ON staff_user_links (staff_user_id, user_id);
--> statement-breakpoint
CREATE INDEX staff_user_links_user_idx
  ON staff_user_links (user_id);
--> statement-breakpoint
CREATE UNIQUE INDEX support_sessions_handoff_key
  ON support_sessions (handoff_hash);
--> statement-breakpoint
CREATE UNIQUE INDEX support_sessions_token_key
  ON support_sessions (token_hash);
--> statement-breakpoint
CREATE INDEX support_sessions_store_idx
  ON support_sessions (store_id);
--> statement-breakpoint
CREATE INDEX support_sessions_grant_idx
  ON support_sessions (grant_id);
--> statement-breakpoint
CREATE INDEX support_sessions_staff_idx
  ON support_sessions (staff_user_id);
--> statement-breakpoint
CREATE INDEX support_sessions_parent_idx
  ON support_sessions (staff_session_id);
--> statement-breakpoint
CREATE INDEX staff_audit_exports_staff_idx
  ON staff_audit_exports (staff_user_id);
--> statement-breakpoint
CREATE INDEX staff_audit_exports_session_idx
  ON staff_audit_exports (staff_session_id);
--> statement-breakpoint
CREATE INDEX staff_audit_exports_pending_idx
  ON staff_audit_exports (status, leased_until);
--> statement-breakpoint
CREATE INDEX staff_audit_exports_expiry_idx
  ON staff_audit_exports (expires_at);
--> statement-breakpoint
CREATE INDEX staff_audit_log_order_idx
  ON staff_audit_log (created_at, id);
--> statement-breakpoint
CREATE INDEX staff_audit_log_action_idx
  ON staff_audit_log (action, created_at, id);
--> statement-breakpoint
CREATE INDEX support_grants_staff_id_idx
  ON support_grants (staff_user_id, id);
--> statement-breakpoint
CREATE INDEX support_grants_store_id_idx
  ON support_grants (store_id, id);
--> statement-breakpoint
ALTER TABLE staff_audit_log ADD CONSTRAINT staff_audit_log_actor CHECK (num_nonnulls(staff_audit_log.staff_user_id, staff_audit_log.operator_identity, staff_audit_log.actor_user_id) = 1);
--> statement-breakpoint
ALTER TABLE support_grants ADD CONSTRAINT support_grants_duration CHECK (support_grants.duration_minutes BETWEEN 30 AND 1440);
--> statement-breakpoint
-- Written by hand below this line
ALTER TABLE support_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY support_sessions_isolation ON support_sessions
USING (store_id = NULLIF(current_setting('app.store_id', TRUE), '')::uuid)
WITH CHECK (store_id = NULLIF(current_setting('app.store_id', TRUE), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON support_sessions, staff_audit_exports TO dakly_app;
--> statement-breakpoint
GRANT DELETE ON staff_audit_exports TO dakly_app;
--> statement-breakpoint
GRANT SELECT ON staff_user_links TO dakly_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON staff_audit_log, staff_audit_log_days, staff_user_links FROM dakly_app;
--> statement-breakpoint
REVOKE INSERT ON staff_audit_log_days FROM dakly_app;
--> statement-breakpoint
CREATE FUNCTION preserve_staff_user_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE contact record; identity record;
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    FOR contact IN
      SELECT DISTINCT kind, value
      FROM (
        SELECT 'phone' AS kind, x->>'phone' AS value
        FROM unnest(ARRAY[to_jsonb(OLD), to_jsonb(NEW)]) x
        WHERE x->>'phoneVerifiedAt' IS NOT NULL OR x->>'phone_verified_at' IS NOT NULL
        UNION ALL
        SELECT 'email', lower(x->>'email')
        FROM unnest(ARRAY[to_jsonb(OLD), to_jsonb(NEW)]) x
        WHERE x->>'email_verified_at' IS NOT NULL
      ) c
      WHERE value IS NOT NULL
      ORDER BY kind, value
    LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('staff-identity:' || contact.kind || ':' || contact.value, 0));
      INSERT INTO public.staff_user_links(id, staff_user_id, user_id)
      SELECT gen_random_uuid(), c.staff_user_id, NEW.id
      FROM public.staff_identity_contacts c
      WHERE c.kind=contact.kind AND c.value=contact.value
      ON CONFLICT DO NOTHING;
    END LOOP;
    RETURN NEW;
  END IF;
  FOR contact IN
    SELECT DISTINCT x->>'kind' AS kind, x->>'value' AS value, (x->>'staff_user_id')::uuid AS staff_id
    FROM unnest(ARRAY[to_jsonb(OLD), to_jsonb(NEW)]) x
    WHERE x->>'value' IS NOT NULL
    ORDER BY kind, value
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('staff-identity:' || contact.kind || ':' || contact.value, 0));
    INSERT INTO public.staff_user_links(id, staff_user_id, user_id)
    SELECT gen_random_uuid(), contact.staff_id, u.id
    FROM public.users u
    WHERE (contact.kind='phone' AND u.phone=contact.value AND u.phone_verified_at IS NOT NULL)
      OR (contact.kind='email' AND u.email=contact.value AND u.email_verified_at IS NOT NULL)
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION preserve_staff_user_identity() FROM PUBLIC;
--> statement-breakpoint
-- The link's foreign key requires the newly inserted user to exist before capture.
CREATE TRIGGER users_staff_identity
AFTER INSERT OR UPDATE OF phone, email, phone_verified_at, email_verified_at ON users
FOR EACH ROW
EXECUTE FUNCTION preserve_staff_user_identity();
--> statement-breakpoint
CREATE TRIGGER contacts_staff_identity
AFTER INSERT OR UPDATE OR DELETE ON staff_identity_contacts
FOR EACH ROW
EXECUTE FUNCTION preserve_staff_user_identity();
--> statement-breakpoint
-- Backfill once; runtime checks use the unique association index.
INSERT INTO staff_user_links(id, staff_user_id, user_id)
SELECT gen_random_uuid(), c.staff_user_id, u.id
FROM staff_identity_contacts c
JOIN users u
ON (c.kind='phone' AND u.phone=c.value AND u.phone_verified_at IS NOT NULL)
OR (c.kind='email' AND u.email=c.value AND u.email_verified_at IS NOT NULL)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION staff_conflicts_with_store(staff_id uuid, target_store uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.staff_user_links l
    JOIN public.memberships m ON m.user_id=l.user_id
    WHERE l.staff_user_id=staff_id AND m.store_id=target_store AND m.status='active'
  )
$$;
--> statement-breakpoint
CREATE FUNCTION support_session_store(proof bytea, handoff boolean)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id
  FROM public.support_sessions
  WHERE (handoff AND handoff_hash=proof AND consumed_at IS NULL AND handoff_expires_at>clock_timestamp())
    OR (NOT handoff AND token_hash=proof)
  LIMIT 1
$$;
--> statement-breakpoint
CREATE FUNCTION support_store_targets(search text)
RETURNS TABLE (id uuid, name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF search ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN QUERY SELECT s.id, s.name
    FROM public.stores s
    WHERE s.id=search::uuid;
  ELSE
    RETURN QUERY SELECT s.id, s.name
    FROM public.stores s
    WHERE s.slug=search
    LIMIT 1;
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION staff_conflicts_with_store(uuid, uuid), support_session_store(bytea, boolean), support_store_targets(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION staff_conflicts_with_store(uuid, uuid), support_session_store(bytea, boolean), support_store_targets(text) TO dakly_app;
--> statement-breakpoint
CREATE FUNCTION support_grant_store(staff_id uuid, grant_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id
  FROM public.support_grants
  WHERE id=grant_id AND staff_user_id=staff_id
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION support_grant_store(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION support_grant_store(uuid, uuid) TO dakly_app;
--> statement-breakpoint
-- Writers only share their own UTC-day lock; sealing never blocks a different day's writers.
CREATE FUNCTION stamp_staff_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
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
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION stamp_staff_audit() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER staff_audit_timestamp
BEFORE INSERT ON staff_audit_log
FOR EACH ROW
EXECUTE FUNCTION stamp_staff_audit();
--> statement-breakpoint
-- pg_catalog.sha256 avoids an additional extension. JSON array field order is the v1 format.
CREATE FUNCTION staff_audit_day_hash(target_day date, previous bytea)
RETURNS TABLE (hash bytea, row_count integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE item record; current_hash bytea; total integer:=0;
BEGIN
  current_hash := sha256(convert_to('dakly-staff-audit-v1:' || target_day::text || ':' || COALESCE(encode(previous, 'hex'), ''), 'UTF8'));
  FOR item IN
    SELECT jsonb_build_array(id, staff_user_id, actor_user_id, operator_identity, action,
      store_id, target_type, target_id, reason, action_details, host(ip),
      to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text AS canonical
    FROM public.staff_audit_log
    WHERE created_at >= target_day::timestamp AT TIME ZONE 'UTC'
      AND created_at < (target_day+1)::timestamp AT TIME ZONE 'UTC'
    ORDER BY created_at, id
  LOOP
    current_hash := sha256(current_hash || convert_to(item.canonical, 'UTF8'));
    total:=total+1;
  END LOOP;
  RETURN QUERY SELECT current_hash, total;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION staff_audit_day_hash(date, bytea) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION staff_audit_day_hash(date, bytea) TO dakly_app;
--> statement-breakpoint
CREATE FUNCTION seal_staff_audit_day()
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE target_day date; previous bytea; result record;
BEGIN
  -- Serialize sealers, never ordinary inserts. One call seals at most one day.
  PERFORM pg_advisory_xact_lock(41203, 0);
  SELECT day+1, hash INTO target_day, previous
  FROM public.staff_audit_log_days
  ORDER BY day DESC
  LIMIT 1;
  IF target_day IS NULL THEN
    SELECT (min(created_at) AT TIME ZONE 'UTC')::date INTO target_day
    FROM public.staff_audit_log;
  END IF;
  IF target_day IS NULL OR target_day >= (clock_timestamp() AT TIME ZONE 'UTC')::date THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(41202, target_day - DATE '2000-01-01');
  SELECT * INTO result
  FROM public.staff_audit_day_hash(target_day, previous);
  INSERT INTO public.staff_audit_log_days(day, row_count, previous_hash, hash, sealed_at)
  VALUES(target_day, result.row_count, previous, result.hash, clock_timestamp());
  RETURN target_day;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION seal_staff_audit_day() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION seal_staff_audit_day() TO dakly_app;
--> statement-breakpoint
-- Lifecycle services still audit the disabling actor; this invariant also covers other writers.
CREATE FUNCTION public.end_disabled_staff_support()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.support_grants SET status = 'ended', ended_at = clock_timestamp()
  WHERE staff_user_id = NEW.id AND status IN ('requested', 'approved');
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.end_disabled_staff_support() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.end_disabled_staff_support() TO dakly_app;
--> statement-breakpoint
CREATE TRIGGER end_disabled_staff_support
AFTER UPDATE OF status ON public.staff_users
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'disabled')
EXECUTE FUNCTION public.end_disabled_staff_support();
--> statement-breakpoint
UPDATE public.support_grants AS grants SET status = 'ended', ended_at = clock_timestamp()
FROM public.staff_users AS staff
WHERE grants.staff_user_id = staff.id AND staff.status = 'disabled'
AND grants.status IN ('requested', 'approved');
