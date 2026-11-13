CREATE TABLE "ai_agent_settings" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"is_auto_reply_on" boolean DEFAULT false NOT NULL,
	"reply_language" text DEFAULT 'match_customer' NOT NULL,
	"abilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"handover_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"debounce_seconds" smallint DEFAULT 8 NOT NULL,
	"claim_timeout_minutes" smallint DEFAULT 10,
	"return_to_ai_minutes" integer DEFAULT 30,
	"extra_rules" text,
	"testers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"test_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"daily_cost_ceiling_poisha" bigint,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_agent_settings_reply_language" CHECK ("ai_agent_settings"."reply_language" in ('match_customer', 'bn', 'en')),
	CONSTRAINT "ai_agent_settings_debounce_seconds" CHECK ("ai_agent_settings"."debounce_seconds" between 0 and 20)
);
--> statement-breakpoint
CREATE TABLE "ai_rule_changes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"source" text NOT NULL,
	"target" text NOT NULL,
	"target_id" uuid,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"summary" text NOT NULL,
	"undoes_change_id" uuid,
	"changed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_rule_changes_source" CHECK ("ai_rule_changes"."source" in ('teach', 'settings_edit', 'undo')),
	CONSTRAINT "ai_rule_changes_target" CHECK ("ai_rule_changes"."target" in ('ai_agent_settings', 'store_settings', 'delivery_zone', 'knowledge_item')),
	CONSTRAINT "ai_rule_changes_undo_link" CHECK (("ai_rule_changes"."source" = 'undo') = ("ai_rule_changes"."undoes_change_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"tier" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"subject_type" text,
	"subject_id" uuid,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"tool_calls" jsonb,
	"outcome" text NOT NULL,
	"error_code" text,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_runs_pkey" PRIMARY KEY("id","created_at"),
	CONSTRAINT "ai_runs_purpose" CHECK ("ai_runs"."purpose" in ('chat_reply', 'classify', 'comment_reply', 'summary', 'transcribe', 'describe_image', 'content', 'ask', 'segment_rules', 'voice_add', 'teach', 'embedding', 'contact_memory')),
	CONSTRAINT "ai_runs_tier" CHECK ("ai_runs"."tier" in ('reply', 'fast', 'vision', 'writer', 'embed', 'transcribe')),
	CONSTRAINT "ai_runs_outcome" CHECK ("ai_runs"."outcome" in ('completed', 'sent', 'handed_over', 'failed_check', 'failed', 'timeout'))
);
--> statement-breakpoint
CREATE TABLE "assistant_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"data_used" jsonb,
	"ai_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_messages_role" CHECK ("assistant_messages"."role" in ('user', 'assistant'))
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"knowledge_item_id" uuid NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(512) NOT NULL,
	"embedding_model" text NOT NULL,
	"token_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"question" text,
	"answer" text,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"file_id" uuid,
	"source_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"facts_count" integer DEFAULT 0 NOT NULL,
	"times_used" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_items_kind" CHECK ("knowledge_items"."kind" in ('faq', 'policy', 'taught', 'file', 'url')),
	CONSTRAINT "knowledge_items_status" CHECK ("knowledge_items"."status" in ('processing', 'active', 'failed', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_rule_changes_store_id_id_key" ON "ai_rule_changes" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_rule_changes_undoes_change_id_key" ON "ai_rule_changes" USING btree ("undoes_change_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_items_store_id_id_key" ON "knowledge_items" USING btree ("store_id","id");--> statement-breakpoint
ALTER TABLE "ai_agent_settings" ADD CONSTRAINT "ai_agent_settings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_settings" ADD CONSTRAINT "ai_agent_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_rule_changes" ADD CONSTRAINT "ai_rule_changes_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_rule_changes" ADD CONSTRAINT "ai_rule_changes_undoes_change_id_ai_rule_changes_id_fk" FOREIGN KEY ("undoes_change_id") REFERENCES "public"."ai_rule_changes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_rule_changes" ADD CONSTRAINT "ai_rule_changes_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_rule_changes" ADD CONSTRAINT "ai_rule_changes_undoes_change_id_store_fk" FOREIGN KEY ("store_id","undoes_change_id") REFERENCES "public"."ai_rule_changes"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_knowledge_item_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_knowledge_item_id_store_fk" FOREIGN KEY ("store_id","knowledge_item_id") REFERENCES "public"."knowledge_items"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_file_id_store_fk" FOREIGN KEY ("store_id","file_id") REFERENCES "public"."files"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_agent_settings_updated_by_user_id_idx" ON "ai_agent_settings" USING btree ("updated_by_user_id");--> statement-breakpoint
CREATE INDEX "ai_rule_changes_store_id_created_at_idx" ON "ai_rule_changes" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_rule_changes_changed_by_user_id_idx" ON "ai_rule_changes" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE INDEX "ai_runs_store_id_created_at_idx" ON "ai_runs" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_runs_subject_idx" ON "ai_runs" USING btree ("store_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "assistant_messages_thread_idx" ON "assistant_messages" USING btree ("store_id","user_id","thread_id","created_at");--> statement-breakpoint
CREATE INDEX "assistant_messages_user_id_idx" ON "assistant_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "assistant_messages_created_at_idx" ON "assistant_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_store_id_idx" ON "knowledge_chunks" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_knowledge_item_id_idx" ON "knowledge_chunks" USING btree ("knowledge_item_id");--> statement-breakpoint
CREATE INDEX "knowledge_items_store_id_status_idx" ON "knowledge_items" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_items_file_id_idx" ON "knowledge_items" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "knowledge_items_created_by_user_id_idx" ON "knowledge_items" USING btree ("created_by_user_id");--> statement-breakpoint

-- Written by hand below this line (docs/rules/database.md, Migrations step 2). Row level
-- security: a connection sees and writes only the rows of the store set by
-- TenantDatabase.forStore. See docs/data/isolation-and-access.md.
ALTER TABLE "ai_agent_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_agent_settings_isolation" ON "ai_agent_settings"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "ai_rule_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_rule_changes_isolation" ON "ai_rule_changes"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "assistant_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "assistant_messages_isolation" ON "assistant_messages"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "knowledge_chunks_isolation" ON "knowledge_chunks"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "knowledge_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "knowledge_items_isolation" ON "knowledge_items"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint

-- Rule history is the undo evidence; undo writes a new row.
REVOKE UPDATE, DELETE ON "ai_rule_changes" FROM dakly_app;--> statement-breakpoint
