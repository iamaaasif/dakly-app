CREATE TABLE "account_recoveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_state" text NOT NULL,
	"cancel_hash" text NOT NULL,
	"completion_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"eligible_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_recoveries_status" CHECK ("account_recoveries"."status" in ('pending', 'cancelled', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "account_security_notices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"recovery_id" uuid,
	"ciphertext" "bytea" NOT NULL,
	"key_version" smallint NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_id" uuid,
	"lease_until" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_last_step" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "security_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "account_recoveries" ADD CONSTRAINT "account_recoveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_security_notices" ADD CONSTRAINT "account_security_notices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_security_notices" ADD CONSTRAINT "account_security_notices_recovery_id_account_recoveries_id_fk" FOREIGN KEY ("recovery_id") REFERENCES "public"."account_recoveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_recoveries_user_id_idx" ON "account_recoveries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_security_notices_user_id_idx" ON "account_security_notices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_security_notices_recovery_id_idx" ON "account_security_notices" USING btree ("recovery_id");--> statement-breakpoint
CREATE INDEX "account_security_notices_due_idx" ON "account_security_notices" USING btree ("retry_at") WHERE "account_security_notices"."delivered_at" is null;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON account_recoveries, account_security_notices TO dakly_app;
--> statement-breakpoint
CREATE FUNCTION account_store_owner_contacts(p_user_id uuid, p_after uuid, p_limit integer)
RETURNS TABLE (user_id uuid, phone text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT u.id, CASE WHEN u.phone_verified_at IS NOT NULL THEN u.phone END,
    CASE WHEN u.email_verified_at IS NOT NULL THEN u.email::text END
  FROM memberships person
  JOIN memberships owner ON owner.store_id = person.store_id AND owner.built_in_role = 'owner' AND owner.status = 'active'
  JOIN users u ON u.id = owner.user_id AND NOT u.is_disabled
  WHERE person.user_id = p_user_id AND person.status = 'active'
    AND (p_after IS NULL OR u.id > p_after)
  ORDER BY u.id LIMIT LEAST(GREATEST(p_limit,1),100)
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION account_store_owner_contacts(uuid, uuid, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION account_store_owner_contacts(uuid, uuid, integer) TO dakly_app;
