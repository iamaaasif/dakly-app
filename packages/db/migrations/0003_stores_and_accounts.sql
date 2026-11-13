CREATE TABLE "store_counters" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"next_order_number" integer DEFAULT 1001 NOT NULL,
	CONSTRAINT "store_counters_next_order_number" CHECK ("store_counters"."next_order_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"user_id" uuid NOT NULL,
	"active_store_id" uuid,
	"ip" "inet",
	"user_agent" text,
	"is_remembered" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"phone_verified_at" timestamp with time zone,
	"email" "citext",
	"email_verified_at" timestamp with time zone,
	"password_hash" text,
	"google_subject" text,
	"totp_secret_ciphertext" "bytea",
	"totp_key_version" smallint,
	"totp_enabled_at" timestamp with time zone,
	"backup_code_hashes" text[],
	"language" text DEFAULT 'en' NOT NULL,
	"is_disabled" boolean DEFAULT false NOT NULL,
	"last_sign_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_has_identifier" CHECK ("users"."phone" is not null or "users"."email" is not null),
	CONSTRAINT "users_phone_format" CHECK ("users"."phone" ~ '^01[3-9][0-9]{8}$'),
	CONSTRAINT "users_language" CHECK ("users"."language" in ('en', 'bn')),
	CONSTRAINT "users_name_length" CHECK (char_length("users"."name") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid,
	"built_in_role" text,
	"role_id" uuid,
	"status" text NOT NULL,
	"invite_phone" text,
	"invite_email" "citext",
	"invite_token_hash" "bytea",
	"invite_expires_at" timestamp with time zone,
	"invited_by_user_id" uuid,
	"joined_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_status" CHECK ("memberships"."status" in ('invited', 'active', 'removed')),
	CONSTRAINT "memberships_built_in_role" CHECK ("memberships"."built_in_role" in ('owner', 'admin', 'marketer', 'support_agent')),
	CONSTRAINT "memberships_one_role" CHECK (("memberships"."built_in_role" is null) <> ("memberships"."role_id" is null)),
	CONSTRAINT "memberships_active_has_user" CHECK ("memberships"."status" <> 'active' or "memberships"."user_id" is not null),
	CONSTRAINT "memberships_invite_has_address" CHECK ("memberships"."status" <> 'invited' or "memberships"."invite_phone" is not null or "memberships"."invite_email" is not null)
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"can_see_full_phone" boolean DEFAULT false NOT NULL,
	"can_export_lists" boolean DEFAULT false NOT NULL,
	"can_refund" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_length" CHECK (char_length("roles"."name") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "bd_areas" (
	"id" integer PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"parent_id" integer,
	"name" text NOT NULL,
	"name_bn" text,
	CONSTRAINT "bd_areas_kind" CHECK ("bd_areas"."kind" in ('division', 'district', 'upazila')),
	CONSTRAINT "bd_areas_parent" CHECK (("bd_areas"."kind" = 'division') = ("bd_areas"."parent_id" is null))
);
--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "business_type" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "email" "citext";--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "district" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "vat_bin" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "trade_licence" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "logo_object_key" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "time_zone" text DEFAULT 'Asia/Dhaka' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "how_you_sell" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "customer_list_size" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "extensions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "inactivity_days" smallint DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "attribution_window_days" smallint DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "delete_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_key" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_subject_key" ON "users" USING btree ("google_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_store_id_user_id_key" ON "memberships" USING btree ("store_id","user_id") WHERE "memberships"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_one_owner_key" ON "memberships" USING btree ("store_id") WHERE "memberships"."built_in_role" = 'owner' and "memberships"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_invite_token_hash_key" ON "memberships" USING btree ("invite_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_store_id_id_key" ON "roles" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_store_id_name_key" ON "roles" USING btree ("store_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "stores_slug_key" ON "stores" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "store_counters" ADD CONSTRAINT "store_counters_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_store_id_stores_id_fk" FOREIGN KEY ("active_store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_id_store_fk" FOREIGN KEY ("store_id","role_id") REFERENCES "public"."roles"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bd_areas" ADD CONSTRAINT "bd_areas_parent_id_bd_areas_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."bd_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_active_store_id_idx" ON "sessions" USING btree ("active_store_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "memberships_store_id_status_idx" ON "memberships" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memberships_role_id_idx" ON "memberships" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "memberships_invited_by_user_id_idx" ON "memberships" USING btree ("invited_by_user_id");--> statement-breakpoint
CREATE INDEX "bd_areas_parent_id_idx" ON "bd_areas" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_name_length" CHECK (char_length("stores"."name") between 1 and 100);--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_slug_format" CHECK ("stores"."slug" ~ '^[a-z0-9][a-z0-9-]{2,39}$');--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_vat_bin_format" CHECK ("stores"."vat_bin" ~ '^[0-9]{13}$');--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_how_you_sell" CHECK ("stores"."how_you_sell" <@ array['social_media', 'online_store', 'shop_with_pos', 'shop_without_pos']::text[]);--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_customer_list_size" CHECK ("stores"."customer_list_size" in ('under_500', '500_to_2000', '2000_to_10000', 'over_10000'));--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_extensions" CHECK ("stores"."extensions" <@ array['chats', 'sales', 'social_auto_post', 'physical_shop']::text[]);--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_inactivity_days" CHECK ("stores"."inactivity_days" between 30 and 180);--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_attribution_window_days" CHECK ("stores"."attribution_window_days" in (1, 3, 7));--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_status" CHECK ("stores"."status" in ('active', 'suspended', 'closing'));--> statement-breakpoint

-- Written by hand below this line (docs/rules/database.md, Migrations step 2). Row level
-- security: a connection sees and writes only the rows of the store set by
-- TenantDatabase.forStore. See docs/data/isolation-and-access.md.
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "memberships_isolation" ON "memberships"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "roles_isolation" ON "roles"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "store_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "store_counters_isolation" ON "store_counters"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint

-- Entry points that start without a store (webhooks, public pages, callbacks, sign-in) and
-- sweeps over many stores. Each returns only ids; the caller then works inside forStore.
-- Every function fixes search_path, and only dakly_app may execute it (schema review must-fix 4).
CREATE FUNCTION store_id_for_slug(p_slug text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT id FROM stores WHERE slug = p_slug AND status = 'active'
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION store_id_for_slug(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION store_id_for_slug(text) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION stores_for_user(p_user_id uuid) RETURNS TABLE(store_id uuid, store_name text, membership_id uuid, built_in_role text, role_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT s.id, s.name, m.id, m.built_in_role, m.role_id
  FROM memberships m JOIN stores s ON s.id = m.store_id
  WHERE m.user_id = p_user_id AND m.status = 'active'
  ORDER BY s.name
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION stores_for_user(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION stores_for_user(uuid) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION membership_for_invite(p_token_hash bytea) RETURNS TABLE(store_id uuid, membership_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM memberships
  WHERE invite_token_hash = p_token_hash AND status = 'invited' AND invite_expires_at > now()
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION membership_for_invite(bytea) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION membership_for_invite(bytea) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION active_store_ids() RETURNS TABLE(store_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT id FROM stores WHERE status = 'active' ORDER BY id
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION active_store_ids() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION active_store_ids() TO dakly_app;--> statement-breakpoint
-- Reference data: 8 divisions (ids 1 to 8) and 64 districts (division id x 100 + n). Upazilas
-- and Bangla names are added by a later migration from the official BBS list (task DB-6).
INSERT INTO "bd_areas" ("id", "kind", "parent_id", "name") VALUES
  (1, 'division', NULL, 'Barishal'),
  (2, 'division', NULL, 'Chattogram'),
  (3, 'division', NULL, 'Dhaka'),
  (4, 'division', NULL, 'Khulna'),
  (5, 'division', NULL, 'Mymensingh'),
  (6, 'division', NULL, 'Rajshahi'),
  (7, 'division', NULL, 'Rangpur'),
  (8, 'division', NULL, 'Sylhet'),
  (101, 'district', 1, 'Barguna'),
  (102, 'district', 1, 'Barishal'),
  (103, 'district', 1, 'Bhola'),
  (104, 'district', 1, 'Jhalokati'),
  (105, 'district', 1, 'Patuakhali'),
  (106, 'district', 1, 'Pirojpur'),
  (201, 'district', 2, 'Bandarban'),
  (202, 'district', 2, 'Brahmanbaria'),
  (203, 'district', 2, 'Chandpur'),
  (204, 'district', 2, 'Chattogram'),
  (205, 'district', 2, 'Cumilla'),
  (206, 'district', 2, 'Cox''s Bazar'),
  (207, 'district', 2, 'Feni'),
  (208, 'district', 2, 'Khagrachhari'),
  (209, 'district', 2, 'Lakshmipur'),
  (210, 'district', 2, 'Noakhali'),
  (211, 'district', 2, 'Rangamati'),
  (301, 'district', 3, 'Dhaka'),
  (302, 'district', 3, 'Faridpur'),
  (303, 'district', 3, 'Gazipur'),
  (304, 'district', 3, 'Gopalganj'),
  (305, 'district', 3, 'Kishoreganj'),
  (306, 'district', 3, 'Madaripur'),
  (307, 'district', 3, 'Manikganj'),
  (308, 'district', 3, 'Munshiganj'),
  (309, 'district', 3, 'Narayanganj'),
  (310, 'district', 3, 'Narsingdi'),
  (311, 'district', 3, 'Rajbari'),
  (312, 'district', 3, 'Shariatpur'),
  (313, 'district', 3, 'Tangail'),
  (401, 'district', 4, 'Bagerhat'),
  (402, 'district', 4, 'Chuadanga'),
  (403, 'district', 4, 'Jashore'),
  (404, 'district', 4, 'Jhenaidah'),
  (405, 'district', 4, 'Khulna'),
  (406, 'district', 4, 'Kushtia'),
  (407, 'district', 4, 'Magura'),
  (408, 'district', 4, 'Meherpur'),
  (409, 'district', 4, 'Narail'),
  (410, 'district', 4, 'Satkhira'),
  (501, 'district', 5, 'Jamalpur'),
  (502, 'district', 5, 'Mymensingh'),
  (503, 'district', 5, 'Netrokona'),
  (504, 'district', 5, 'Sherpur'),
  (601, 'district', 6, 'Bogura'),
  (602, 'district', 6, 'Chapai Nawabganj'),
  (603, 'district', 6, 'Joypurhat'),
  (604, 'district', 6, 'Naogaon'),
  (605, 'district', 6, 'Natore'),
  (606, 'district', 6, 'Pabna'),
  (607, 'district', 6, 'Rajshahi'),
  (608, 'district', 6, 'Sirajganj'),
  (701, 'district', 7, 'Dinajpur'),
  (702, 'district', 7, 'Gaibandha'),
  (703, 'district', 7, 'Kurigram'),
  (704, 'district', 7, 'Lalmonirhat'),
  (705, 'district', 7, 'Nilphamari'),
  (706, 'district', 7, 'Panchagarh'),
  (707, 'district', 7, 'Rangpur'),
  (708, 'district', 7, 'Thakurgaon'),
  (801, 'district', 8, 'Habiganj'),
  (802, 'district', 8, 'Moulvibazar'),
  (803, 'district', 8, 'Sunamganj'),
  (804, 'district', 8, 'Sylhet');--> statement-breakpoint
