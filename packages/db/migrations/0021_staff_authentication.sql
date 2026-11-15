CREATE TABLE staff_identity_contacts (
  id uuid PRIMARY KEY NOT NULL,
  staff_user_id uuid NOT NULL,
  kind text NOT NULL,
  value text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT staff_identity_contacts_kind CHECK (staff_identity_contacts.kind IN ('phone', 'email'))
);
--> statement-breakpoint
CREATE TABLE staff_passkeys (
  credential_id text PRIMARY KEY NOT NULL,
  staff_user_id uuid NOT NULL,
  public_key bytea NOT NULL,
  counter bigint NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE staff_challenges (
  token_hash bytea PRIMARY KEY NOT NULL,
  staff_user_id uuid NOT NULL,
  purpose text NOT NULL,
  password_hash text,
  password_state text,
  webauthn_challenge text,
  totp_secret_ciphertext bytea,
  totp_key_version smallint,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT staff_challenges_purpose CHECK (staff_challenges.purpose IN ('enroll', 'signin', 'setup_totp', 'setup_passkey'))
);
--> statement-breakpoint
ALTER TABLE staff_users ADD COLUMN access_subject text;
--> statement-breakpoint
ALTER TABLE staff_users ADD COLUMN password_hash text;
--> statement-breakpoint
ALTER TABLE staff_users ADD COLUMN enrolled_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE staff_users ADD COLUMN failed_attempts integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE staff_users ADD COLUMN blocked_until timestamp with time zone;
--> statement-breakpoint
ALTER TABLE staff_users ADD COLUMN totp_last_step bigint;
--> statement-breakpoint
ALTER TABLE staff_sessions ADD COLUMN last_seen_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE staff_identity_contacts ADD CONSTRAINT staff_identity_contacts_staff_user_id_staff_users_id_fk FOREIGN KEY (staff_user_id) REFERENCES public.staff_users (id);
--> statement-breakpoint
ALTER TABLE staff_passkeys ADD CONSTRAINT staff_passkeys_staff_user_id_staff_users_id_fk FOREIGN KEY (staff_user_id) REFERENCES public.staff_users (id);
--> statement-breakpoint
ALTER TABLE staff_challenges ADD CONSTRAINT staff_challenges_staff_user_id_staff_users_id_fk FOREIGN KEY (staff_user_id) REFERENCES public.staff_users (id);
--> statement-breakpoint
CREATE INDEX staff_identity_contacts_value_idx
  ON staff_identity_contacts (kind, value);
--> statement-breakpoint
CREATE UNIQUE INDEX staff_identity_contacts_staff_value_key
  ON staff_identity_contacts (staff_user_id, kind, value);
--> statement-breakpoint
CREATE INDEX staff_passkeys_staff_user_id_idx
  ON staff_passkeys (staff_user_id);
--> statement-breakpoint
CREATE INDEX staff_challenges_staff_user_id_idx
  ON staff_challenges (staff_user_id);
--> statement-breakpoint
CREATE UNIQUE INDEX staff_users_access_subject_key
  ON staff_users (access_subject);
--> statement-breakpoint
-- Written by hand below this line
CREATE FUNCTION public.invalidate_disabled_staff_authentication()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.staff_sessions SET revoked_at = CURRENT_TIMESTAMP
  WHERE staff_user_id = NEW.id AND revoked_at IS NULL;
  UPDATE public.staff_challenges SET consumed_at = CURRENT_TIMESTAMP
  WHERE staff_user_id = NEW.id AND consumed_at IS NULL;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.invalidate_disabled_staff_authentication() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.invalidate_disabled_staff_authentication() TO dakly_app;
--> statement-breakpoint
CREATE TRIGGER invalidate_disabled_staff_authentication
AFTER UPDATE OF status ON public.staff_users
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'disabled')
EXECUTE FUNCTION public.invalidate_disabled_staff_authentication();
--> statement-breakpoint
UPDATE public.staff_sessions AS sessions SET revoked_at = CURRENT_TIMESTAMP
FROM public.staff_users AS staff
WHERE sessions.staff_user_id = staff.id AND staff.status = 'disabled' AND sessions.revoked_at IS NULL;
--> statement-breakpoint
UPDATE public.staff_challenges AS challenges SET consumed_at = CURRENT_TIMESTAMP
FROM public.staff_users AS staff
WHERE challenges.staff_user_id = staff.id AND staff.status = 'disabled' AND challenges.consumed_at IS NULL;
