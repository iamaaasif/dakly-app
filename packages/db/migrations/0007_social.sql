CREATE TABLE "brand_profiles" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"voice" text,
	"audience" text,
	"preferred_words" text[] DEFAULT '{}'::text[] NOT NULL,
	"call_to_action_bn" text,
	"call_to_action_en" text,
	"default_tone" text,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"words_to_avoid" text[] DEFAULT '{}'::text[] NOT NULL,
	"hashtags" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_emoji_allowed" boolean DEFAULT false NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_pieces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"language" text NOT NULL,
	"body" text NOT NULL,
	"created_by_user_id" uuid,
	"is_ai_written" boolean DEFAULT false NOT NULL,
	"ai_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_pieces_kind" CHECK ("content_pieces"."kind" in ('facebook_post', 'instagram_caption', 'whatsapp', 'sms', 'product_description')),
	CONSTRAINT "content_pieces_language" CHECK ("content_pieces"."language" in ('bn', 'en', 'banglish')),
	CONSTRAINT "content_pieces_body_length" CHECK (char_length("content_pieces"."body") between 1 and 20000),
	CONSTRAINT "content_pieces_ai_provenance" CHECK ("content_pieces"."ai_run_id" is null or "content_pieces"."is_ai_written")
);
--> statement-breakpoint
CREATE TABLE "post_targets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"channel_connection_id" uuid NOT NULL,
	"caption_override" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"container_id" text,
	"external_post_id" text,
	"published_at" timestamp with time zone,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"reach" integer,
	"reactions" integer,
	"comments" integer,
	"shares" integer,
	"link_taps" integer,
	"metrics_at" timestamp with time zone,
	"next_metrics_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_targets_caption_override_length" CHECK (char_length("post_targets"."caption_override") <= 20000),
	CONSTRAINT "post_targets_status" CHECK ("post_targets"."status" in ('draft', 'waiting_approval', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
	CONSTRAINT "post_targets_scheduled_has_time" CHECK ("post_targets"."status" not in ('scheduled', 'publishing') or "post_targets"."scheduled_for" is not null)
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"kind" text DEFAULT 'post' NOT NULL,
	"caption" text,
	"media_file_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"link_url" text,
	"first_comment" text,
	"is_ai_written" boolean DEFAULT false NOT NULL,
	"ai_run_id" uuid,
	"created_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_kind" CHECK ("posts"."kind" in ('post', 'story')),
	CONSTRAINT "posts_caption_length" CHECK (char_length("posts"."caption") <= 20000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "post_targets_store_id_id_key" ON "post_targets" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_targets_slot_key" ON "post_targets" USING btree ("channel_connection_id","scheduled_for") WHERE "post_targets"."status" in ('scheduled', 'publishing');--> statement-breakpoint
CREATE UNIQUE INDEX "post_targets_external_post_id_key" ON "post_targets" USING btree ("channel_connection_id","external_post_id") WHERE "post_targets"."external_post_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "post_targets_post_connection_key" ON "post_targets" USING btree ("post_id","channel_connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_store_id_id_key" ON "posts" USING btree ("store_id","id");--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD CONSTRAINT "content_pieces_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pieces" ADD CONSTRAINT "content_pieces_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_targets" ADD CONSTRAINT "post_targets_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_targets" ADD CONSTRAINT "post_targets_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_targets" ADD CONSTRAINT "post_targets_channel_connection_id_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_targets" ADD CONSTRAINT "post_targets_post_id_store_fk" FOREIGN KEY ("store_id","post_id") REFERENCES "public"."posts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_targets" ADD CONSTRAINT "post_targets_channel_connection_id_store_fk" FOREIGN KEY ("store_id","channel_connection_id") REFERENCES "public"."channel_connections"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_profiles_updated_by_user_id_idx" ON "brand_profiles" USING btree ("updated_by_user_id");--> statement-breakpoint
CREATE INDEX "content_pieces_store_created_idx" ON "content_pieces" USING btree ("store_id","created_at","id");--> statement-breakpoint
CREATE INDEX "content_pieces_store_kind_language_idx" ON "content_pieces" USING btree ("store_id","kind","language","created_at","id");--> statement-breakpoint
CREATE INDEX "content_pieces_created_by_user_id_idx" ON "content_pieces" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "post_targets_channel_connection_id_idx" ON "post_targets" USING btree ("channel_connection_id");--> statement-breakpoint
CREATE INDEX "post_targets_store_id_scheduled_for_idx" ON "post_targets" USING btree ("store_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "post_targets_due_idx" ON "post_targets" USING btree ("scheduled_for") WHERE "post_targets"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "post_targets_metrics_due_idx" ON "post_targets" USING btree ("next_metrics_at") WHERE "post_targets"."next_metrics_at" is not null;--> statement-breakpoint
CREATE INDEX "posts_store_id_created_at_idx" ON "posts" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_created_by_user_id_idx" ON "posts" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "posts_approved_by_user_id_idx" ON "posts" USING btree ("approved_by_user_id");--> statement-breakpoint

-- Written by hand below this line (docs/rules/database.md, Migrations step 2). Row level
-- security: a connection sees and writes only the rows of the store set by
-- TenantDatabase.forStore. See docs/data/isolation-and-access.md.
ALTER TABLE "brand_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "brand_profiles_isolation" ON "brand_profiles"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "content_pieces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "content_pieces_isolation" ON "content_pieces"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "post_targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "post_targets_isolation" ON "post_targets"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "posts_isolation" ON "posts"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint

CREATE FUNCTION due_post_targets(p_as_of timestamptz) RETURNS TABLE(store_id uuid, post_target_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM post_targets WHERE status = 'scheduled' AND scheduled_for <= p_as_of
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION due_post_targets(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION due_post_targets(timestamptz) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION due_post_metrics(p_limit integer) RETURNS TABLE(store_id uuid, post_target_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM post_targets WHERE next_metrics_at <= now() ORDER BY next_metrics_at LIMIT p_limit
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION due_post_metrics(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION due_post_metrics(integer) TO dakly_app;--> statement-breakpoint
