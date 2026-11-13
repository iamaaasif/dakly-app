CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_staff_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"store_id" uuid,
	"target_type" text,
	"target_id" uuid,
	"reason" text NOT NULL,
	"data" jsonb,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_audit_log_reason_length" CHECK (char_length("staff_audit_log"."reason") >= 10)
);
--> statement-breakpoint
CREATE TABLE "staff_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"totp_secret_ciphertext" "bytea",
	"totp_key_version" smallint,
	"passkeys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_sign_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_users_role" CHECK ("staff_users"."role" in ('super_admin', 'support', 'finance', 'ops', 'trust_safety', 'analyst')),
	CONSTRAINT "staff_users_status" CHECK ("staff_users"."status" in ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "support_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"scopes" text[] NOT NULL,
	"access" text DEFAULT 'read' NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"reason" text NOT NULL,
	"is_break_glass" boolean DEFAULT false NOT NULL,
	"approved_by_user_id" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	CONSTRAINT "support_grants_access" CHECK ("support_grants"."access" in ('read', 'write')),
	CONSTRAINT "support_grants_status" CHECK ("support_grants"."status" in ('requested', 'approved', 'denied', 'ended', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" uuid,
	"actor_staff_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_pkey" PRIMARY KEY("id","created_at"),
	CONSTRAINT "audit_log_actor_type" CHECK ("audit_log"."actor_type" in ('user', 'ai', 'system', 'staff', 'customer'))
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" "bytea",
	"status" text DEFAULT 'pending' NOT NULL,
	"reject_reason" text,
	"uploaded_by_user_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_purpose" CHECK ("files"."purpose" in ('product_image', 'post_media', 'knowledge_file', 'logo', 'import', 'export', 'sms_sender_document')),
	CONSTRAINT "files_status" CHECK ("files"."status" in ('pending', 'ready', 'rejected')),
	CONSTRAINT "files_size" CHECK ("files"."size_bytes" > 0 and "files"."size_bytes" <= 26214400)
);
--> statement-breakpoint
CREATE TABLE "maintenance_watermarks" (
	"rollup" text PRIMARY KEY NOT NULL,
	"completed_through" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_watermarks_rollup" CHECK ("maintenance_watermarks"."rollup" in ('tracked_link_visit_days', 'ai_run_daily_metrics'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"type" text NOT NULL,
	"priority" smallint DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"data" jsonb,
	"action_url" text,
	"estimated_value_poisha" bigint,
	"status" text DEFAULT 'new' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"dedupe_key" text NOT NULL,
	"expires_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_category" CHECK ("notifications"."category" in ('fix_now', 'sell_more', 'activity', 'billing', 'security')),
	CONSTRAINT "notifications_status" CHECK ("notifications"."status" in ('new', 'seen', 'done', 'snoozed'))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"attempts" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'received' NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "webhook_events_provider" CHECK ("webhook_events"."provider" in ('meta', 'whatsapp', 'sms', 'sendgrid')),
	CONSTRAINT "webhook_events_status" CHECK ("webhook_events"."status" in ('received', 'processed', 'ignored', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "staff_sessions_token_hash_key" ON "staff_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_users_email_key" ON "staff_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "files_store_id_id_key" ON "files" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "files_object_key_key" ON "files" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_store_id_user_id_dedupe_key_key" ON "notifications" USING btree ("store_id","user_id","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_external_id_key" ON "webhook_events" USING btree ("provider","external_id");--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_staff_id_staff_users_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_audit_log" ADD CONSTRAINT "staff_audit_log_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_grants" ADD CONSTRAINT "support_grants_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_grants" ADD CONSTRAINT "support_grants_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_grants" ADD CONSTRAINT "support_grants_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_staff_id_staff_users_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_settings_updated_by_staff_id_idx" ON "platform_settings" USING btree ("updated_by_staff_id");--> statement-breakpoint
CREATE INDEX "staff_audit_log_staff_user_id_created_at_idx" ON "staff_audit_log" USING btree ("staff_user_id","created_at");--> statement-breakpoint
CREATE INDEX "staff_audit_log_store_id_created_at_idx" ON "staff_audit_log" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "staff_sessions_staff_user_id_idx" ON "staff_sessions" USING btree ("staff_user_id");--> statement-breakpoint
CREATE INDEX "support_grants_store_id_status_idx" ON "support_grants" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "support_grants_staff_user_id_status_idx" ON "support_grants" USING btree ("staff_user_id","status");--> statement-breakpoint
CREATE INDEX "support_grants_approved_by_user_id_idx" ON "support_grants" USING btree ("approved_by_user_id");--> statement-breakpoint
CREATE INDEX "audit_log_store_id_entity_idx" ON "audit_log" USING btree ("store_id","entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_store_id_created_at_idx" ON "audit_log" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_user_id_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_staff_id_idx" ON "audit_log" USING btree ("actor_staff_id");--> statement-breakpoint
CREATE INDEX "files_store_id_purpose_idx" ON "files" USING btree ("store_id","purpose","created_at");--> statement-breakpoint
CREATE INDEX "files_uploaded_by_user_id_idx" ON "files" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "files_expires_at_idx" ON "files" USING btree ("expires_at") WHERE "files"."expires_at" is not null;--> statement-breakpoint
CREATE INDEX "notifications_store_id_user_id_status_idx" ON "notifications" USING btree ("store_id","user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "outbox_events_unpublished_idx" ON "outbox_events" USING btree ("id") WHERE "outbox_events"."published_at" is null;--> statement-breakpoint
CREATE INDEX "outbox_events_published_at_idx" ON "outbox_events" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "webhook_events_received_at_idx" ON "webhook_events" USING btree ("received_at");--> statement-breakpoint

-- Written by hand below this line (docs/rules/database.md, Migrations step 2). Row level
-- security: a connection sees and writes only the rows of the store set by
-- TenantDatabase.forStore. See docs/data/isolation-and-access.md.
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "files_isolation" ON "files"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notifications_isolation" ON "notifications"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "support_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "support_grants_isolation" ON "support_grants"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint

-- Staff actions are a record of what happened; a correction is a new row.
REVOKE UPDATE, DELETE ON "staff_audit_log" FROM dakly_app;--> statement-breakpoint
-- The outbox is global; the app may only insert. The relay claims rows through functions.
REVOKE SELECT, UPDATE, DELETE ON "outbox_events" FROM dakly_app;--> statement-breakpoint
REVOKE DELETE ON "webhook_events" FROM dakly_app;--> statement-breakpoint
-- A watermark only moves forward; nothing deletes one.
REVOKE DELETE ON "maintenance_watermarks" FROM dakly_app;--> statement-breakpoint
CREATE FUNCTION claim_outbox_events(p_limit integer) RETURNS TABLE(id uuid, store_id uuid, type text, payload jsonb, occurred_at timestamptz)
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE outbox_events o SET claimed_at = now(), attempts = o.attempts + 1
  WHERE o.id IN (
    SELECT e.id FROM outbox_events e
    WHERE e.published_at IS NULL AND (e.claimed_at IS NULL OR e.claimed_at < now() - interval '1 minute')
    ORDER BY e.id LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING o.id, o.store_id, o.type, o.payload, o.occurred_at
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION claim_outbox_events(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION claim_outbox_events(integer) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION mark_outbox_events_published(p_ids uuid[]) RETURNS integer
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH done AS (UPDATE outbox_events SET published_at = now() WHERE id = ANY(p_ids) AND published_at IS NULL RETURNING 1)
  SELECT count(*)::integer FROM done
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION mark_outbox_events_published(uuid[]) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mark_outbox_events_published(uuid[]) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION purge_published_outbox_events(p_before timestamptz) RETURNS integer
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH gone AS (DELETE FROM outbox_events WHERE published_at < p_before RETURNING 1)
  SELECT count(*)::integer FROM gone
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION purge_published_outbox_events(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION purge_published_outbox_events(timestamptz) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION purge_webhook_events(p_before timestamptz) RETURNS integer
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH gone AS (DELETE FROM webhook_events WHERE received_at < p_before RETURNING 1)
  SELECT count(*)::integer FROM gone
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION purge_webhook_events(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION purge_webhook_events(timestamptz) TO dakly_app;--> statement-breakpoint
