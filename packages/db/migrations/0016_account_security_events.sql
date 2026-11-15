CREATE TABLE account_security_events (
  id uuid PRIMARY KEY NOT NULL,
  user_id uuid NOT NULL,
  event text NOT NULL,
  actor_type text NOT NULL,
  actor_staff_id uuid,
  reason_type text,
  ip inet,
  user_agent text,
  details jsonb DEFAULT CAST('{}' AS jsonb) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT account_security_events_event CHECK (account_security_events.event IN ('password.changed', 'totp.enabled', 'totp.disabled', 'recovery.started', 'recovery.cancelled', 'recovery.completed', 'email.changed', 'phone.changed', 'sessions.revoked', 'google.linked')),
  CONSTRAINT account_security_events_actor CHECK (account_security_events.actor_type IN ('user', 'system', 'staff')),
  CONSTRAINT account_security_events_reason CHECK (account_security_events.reason_type IN ('lost_phone', 'lost_authenticator', 'lost_email')),
  CONSTRAINT account_security_events_staff CHECK ((account_security_events.actor_type = 'staff'
                                               AND account_security_events.actor_staff_id IS NOT NULL
                                               AND account_security_events.reason_type IS NOT NULL)
                                               OR (account_security_events.actor_type <> 'staff'
                                               AND account_security_events.actor_staff_id IS NULL
                                               AND account_security_events.reason_type IS NULL)),
  CONSTRAINT account_security_events_user_agent CHECK (char_length(account_security_events.user_agent) <= 512),
  CONSTRAINT account_security_events_details CHECK (jsonb_typeof(account_security_events.details) = 'object'
                                                AND account_security_events.details - 'sessionId' - 'recoveryId' = CAST('{}' AS jsonb)
                                                AND (NOT account_security_events.details ? 'sessionId'
                                                  OR COALESCE(account_security_events.details ->> 'sessionId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
                                                              FALSE))
                                                AND (NOT account_security_events.details ? 'recoveryId'
                                                  OR COALESCE(account_security_events.details ->> 'recoveryId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
                                                              FALSE)))
);
--> statement-breakpoint
ALTER TABLE account_security_events ADD CONSTRAINT account_security_events_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users (id);
--> statement-breakpoint
ALTER TABLE account_security_events ADD CONSTRAINT account_security_events_actor_staff_id_staff_users_id_fk FOREIGN KEY (actor_staff_id) REFERENCES public.staff_users (id);
--> statement-breakpoint
CREATE INDEX account_security_events_user_id_id_idx
  ON account_security_events (user_id, id);
--> statement-breakpoint
CREATE INDEX account_security_events_created_at_idx
  ON account_security_events (created_at);
--> statement-breakpoint
CREATE INDEX account_security_events_actor_staff_id_idx
  ON account_security_events (actor_staff_id);
--> statement-breakpoint
-- Written by hand below this line
REVOKE ALL ON public.account_security_events FROM dakly_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.account_security_events TO dakly_app;
--> statement-breakpoint
-- DB-7 invokes this as the owner once per batch; the app cannot erase history.
CREATE FUNCTION public.purge_account_security_events(batch_limit integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE deleted_count integer;
BEGIN
  IF batch_limit IS NULL OR batch_limit < 1 OR batch_limit > 1000 THEN
    RAISE EXCEPTION 'batch_limit must be between 1 and 1000' USING ERRCODE = '22023';
  END IF;
  WITH expired AS (
    SELECT id
    FROM public.account_security_events
    WHERE created_at < NOW() - INTERVAL '2 years'
    ORDER BY created_at, id
    LIMIT batch_limit FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.account_security_events e USING expired
  WHERE e.id = expired.id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.purge_account_security_events(integer) FROM PUBLIC, dakly_app;
