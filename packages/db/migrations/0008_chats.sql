CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel_connection_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"responder" text DEFAULT 'ai' NOT NULL,
	"assignee_user_id" uuid,
	"handover_reason" text,
	"handed_over_at" timestamp with time zone,
	"ai_resumes_at" timestamp with time zone,
	"intent_tag" text,
	"lead_temperature" text,
	"has_buying_interest" boolean DEFAULT false NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"last_outbound_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"last_message_preview" text,
	"window_expires_at" timestamp with time zone,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"ai_summary" text,
	"memory_built_through_message_id" uuid,
	"memory_built_through_message_at" timestamp with time zone,
	"memory_version" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_memory_checkpoint" CHECK (("conversations"."memory_built_through_message_id" is null) = ("conversations"."memory_built_through_message_at" is null)),
	CONSTRAINT "conversations_channel" CHECK ("conversations"."channel" in ('messenger', 'instagram', 'whatsapp')),
	CONSTRAINT "conversations_status" CHECK ("conversations"."status" in ('open', 'needs_you', 'later', 'done')),
	CONSTRAINT "conversations_responder" CHECK ("conversations"."responder" in ('ai', 'human', 'paused')),
	CONSTRAINT "conversations_handover_reason" CHECK ("conversations"."handover_reason" in ('asked_for_person', 'complaint', 'refund', 'discount', 'angry', 'out_of_scope', 'ready_to_buy', 'ai_unavailable', 'allowance_used', 'other')),
	CONSTRAINT "conversations_lead_temperature" CHECK ("conversations"."lead_temperature" in ('hot', 'warm', 'cold'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"author_type" text NOT NULL,
	"author_user_id" uuid,
	"kind" text NOT NULL,
	"body" text,
	"attachments" jsonb,
	"media_text" text,
	"external_id" text,
	"idempotency_key" text,
	"status" text NOT NULL,
	"error_code" text,
	"source_type" text DEFAULT 'chat' NOT NULL,
	"source_id" uuid,
	"ai_run_id" uuid,
	"ai_sources" jsonb,
	"ai_rating" text,
	"ai_rating_reason" text,
	"rated_by_user_id" uuid,
	"rated_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_direction" CHECK ("messages"."direction" in ('in', 'out')),
	CONSTRAINT "messages_author_type" CHECK ("messages"."author_type" in ('customer', 'ai', 'user', 'system')),
	CONSTRAINT "messages_kind" CHECK ("messages"."kind" in ('text', 'image', 'voice', 'video', 'file', 'product_card', 'order_card', 'payment_link', 'template', 'note', 'system')),
	CONSTRAINT "messages_status" CHECK ("messages"."status" in ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
	CONSTRAINT "messages_source_type" CHECK ("messages"."source_type" in ('chat', 'campaign', 'automation', 'transactional')),
	CONSTRAINT "messages_ai_rating" CHECK ("messages"."ai_rating" in ('good', 'bad')),
	CONSTRAINT "messages_user_author" CHECK (("messages"."author_type" = 'user') = ("messages"."author_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "saved_replies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"shortcut" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"contact_id" uuid,
	"phone" text NOT NULL,
	"purpose" text NOT NULL,
	"subject_type" text,
	"subject_id" uuid,
	"sender_id_id" uuid,
	"body" text NOT NULL,
	"parts" smallint NOT NULL,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error_code" text,
	"idempotency_key" text NOT NULL,
	"created_by_user_id" uuid,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_messages_purpose" CHECK ("sms_messages"."purpose" in ('order_confirmation', 'order_update', 'payment_receipt', 'manual')),
	CONSTRAINT "sms_messages_status" CHECK ("sms_messages"."status" in ('queued', 'sent', 'delivered', 'failed')),
	CONSTRAINT "sms_messages_parts" CHECK ("sms_messages"."parts" between 1 and 10 and "sms_messages"."credits_used" >= 0)
);
--> statement-breakpoint
CREATE TABLE "social_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"channel_connection_id" uuid NOT NULL,
	"post_target_id" uuid,
	"external_post_id" text NOT NULL,
	"external_comment_id" text NOT NULL,
	"parent_external_comment_id" text,
	"contact_id" uuid,
	"author_name" text,
	"body" text,
	"classification" text,
	"status" text DEFAULT 'new' NOT NULL,
	"public_reply_external_id" text,
	"private_replied_at" timestamp with time zone,
	"conversation_id" uuid,
	"commented_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_comments_classification" CHECK ("social_comments"."classification" in ('question', 'positive', 'negative', 'spam')),
	CONSTRAINT "social_comments_status" CHECK ("social_comments"."status" in ('new', 'replied', 'needs_you', 'hidden', 'ignored'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_store_id_id_key" ON "conversations" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_connection_contact_key" ON "conversations" USING btree ("channel_connection_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_conversation_external_id_key" ON "messages" USING btree ("conversation_id","external_id") WHERE "messages"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_store_id_idempotency_key_key" ON "messages" USING btree ("store_id","idempotency_key") WHERE "messages"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_replies_store_id_shortcut_key" ON "saved_replies" USING btree ("store_id","shortcut") WHERE "saved_replies"."shortcut" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "sms_messages_store_id_idempotency_key_key" ON "sms_messages" USING btree ("store_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "sms_messages_provider_message_id_key" ON "sms_messages" USING btree ("provider_message_id") WHERE "sms_messages"."provider_message_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "social_comments_connection_comment_key" ON "social_comments" USING btree ("channel_connection_id","external_comment_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_connection_id_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_connection_id_store_fk" FOREIGN KEY ("store_id","channel_connection_id") REFERENCES "public"."channel_connections"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_rated_by_user_id_users_id_fk" FOREIGN KEY ("rated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_store_fk" FOREIGN KEY ("store_id","conversation_id") REFERENCES "public"."conversations"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_replies" ADD CONSTRAINT "saved_replies_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_replies" ADD CONSTRAINT "saved_replies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_sender_id_id_sms_sender_ids_id_fk" FOREIGN KEY ("sender_id_id") REFERENCES "public"."sms_sender_ids"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_sender_id_id_store_fk" FOREIGN KEY ("store_id","sender_id_id") REFERENCES "public"."sms_sender_ids"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_channel_connection_id_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_post_target_id_post_targets_id_fk" FOREIGN KEY ("post_target_id") REFERENCES "public"."post_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_channel_connection_id_store_fk" FOREIGN KEY ("store_id","channel_connection_id") REFERENCES "public"."channel_connections"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_post_target_id_store_fk" FOREIGN KEY ("store_id","post_target_id") REFERENCES "public"."post_targets"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_conversation_id_store_fk" FOREIGN KEY ("store_id","conversation_id") REFERENCES "public"."conversations"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_store_id_status_idx" ON "conversations" USING btree ("store_id","status","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_store_id_assignee_idx" ON "conversations" USING btree ("store_id","assignee_user_id","status");--> statement-breakpoint
CREATE INDEX "conversations_store_id_window_idx" ON "conversations" USING btree ("store_id","channel","last_inbound_at");--> statement-breakpoint
CREATE INDEX "conversations_contact_id_idx" ON "conversations" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "conversations_assignee_user_id_idx" ON "conversations" USING btree ("assignee_user_id");--> statement-breakpoint
CREATE INDEX "conversations_ai_resumes_at_idx" ON "conversations" USING btree ("ai_resumes_at") WHERE "conversations"."ai_resumes_at" is not null;--> statement-breakpoint
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_store_id_created_at_idx" ON "messages" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_store_id_external_id_idx" ON "messages" USING btree ("store_id","external_id") WHERE "messages"."direction" = 'out' and "messages"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_store_id_rated_idx" ON "messages" USING btree ("store_id","rated_at") WHERE "messages"."ai_rating" is not null;--> statement-breakpoint
CREATE INDEX "messages_author_user_id_idx" ON "messages" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "messages_rated_by_user_id_idx" ON "messages" USING btree ("rated_by_user_id");--> statement-breakpoint
CREATE INDEX "saved_replies_store_id_idx" ON "saved_replies" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "saved_replies_created_by_user_id_idx" ON "saved_replies" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "sms_messages_store_id_subject_idx" ON "sms_messages" USING btree ("store_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "sms_messages_store_id_created_at_idx" ON "sms_messages" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "sms_messages_contact_id_idx" ON "sms_messages" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "sms_messages_sender_id_id_idx" ON "sms_messages" USING btree ("sender_id_id");--> statement-breakpoint
CREATE INDEX "sms_messages_created_by_user_id_idx" ON "sms_messages" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "social_comments_store_id_post_idx" ON "social_comments" USING btree ("store_id","external_post_id","commented_at");--> statement-breakpoint
CREATE INDEX "social_comments_store_id_status_idx" ON "social_comments" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "social_comments_post_target_id_idx" ON "social_comments" USING btree ("post_target_id");--> statement-breakpoint
CREATE INDEX "social_comments_contact_id_idx" ON "social_comments" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "social_comments_conversation_id_idx" ON "social_comments" USING btree ("conversation_id");--> statement-breakpoint

-- Written by hand below this line (docs/rules/database.md, Migrations step 2). Row level
-- security: a connection sees and writes only the rows of the store set by
-- TenantDatabase.forStore. See docs/data/isolation-and-access.md.
ALTER TABLE "sms_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sms_messages_isolation" ON "sms_messages"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "conversations_isolation" ON "conversations"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "messages_isolation" ON "messages"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "saved_replies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "saved_replies_isolation" ON "saved_replies"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "social_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "social_comments_isolation" ON "social_comments"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint

CREATE FUNCTION due_conversation_returns(p_limit integer) RETURNS TABLE(store_id uuid, conversation_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM conversations WHERE ai_resumes_at <= now() ORDER BY ai_resumes_at LIMIT p_limit
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION due_conversation_returns(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION due_conversation_returns(integer) TO dakly_app;--> statement-breakpoint
