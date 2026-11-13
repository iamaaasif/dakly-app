CREATE TABLE "tracked_link_visits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"tracked_link_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
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
ALTER TABLE "imports" DROP CONSTRAINT "imports_kind";
--> statement-breakpoint
ALTER TABLE "payment_intents" DROP CONSTRAINT "payment_intents_refunded";
--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT "posts_caption_length";
--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_active_has_user";
--> statement-breakpoint
ALTER TABLE "contact_match_suggestions" DROP CONSTRAINT "contact_match_suggestions_contact_id_contacts_id_fk";
--> statement-breakpoint
ALTER TABLE "contact_match_suggestions" DROP CONSTRAINT "contact_match_suggestions_matched_contact_id_contacts_id_fk";
--> statement-breakpoint
ALTER TABLE "contact_merges" DROP CONSTRAINT "contact_merges_kept_contact_id_contacts_id_fk";
--> statement-breakpoint
ALTER TABLE "contact_merges" DROP CONSTRAINT "contact_merges_merged_contact_id_contacts_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_contact_id_contacts_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "restock_requests" DROP CONSTRAINT "restock_requests_conversation_id_conversations_id_fk";
--> statement-breakpoint
DROP INDEX "wallet_ledger_store_id_wallet_idx";
--> statement-breakpoint
DROP INDEX "post_targets_post_id_idx";
--> statement-breakpoint
DROP INDEX "campaign_recipients_campaign_status_idx";
--> statement-breakpoint
ALTER TABLE "contact_merges" ALTER COLUMN "kept_contact_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "contact_merges" ALTER COLUMN "merged_contact_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "contact_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD COLUMN "revision" integer;
--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "contact_identity_id" uuid;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "channel_connection_id" uuid;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "memory_built_through_message_id" uuid;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "memory_built_through_message_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "memory_version" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "contact_memories" ADD COLUMN "cleared_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "contact_merges" ADD COLUMN "operation_key" text;
--> statement-breakpoint
ALTER TABLE "contact_merges" ADD COLUMN "after_state" jsonb;
--> statement-breakpoint
ALTER TABLE "contact_merges" ADD COLUMN "undo_conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "contact_merges" ADD COLUMN "evidence_redacted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "buyer_name" text;
--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN "reserved_refund_poisha" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "external_source" text;
--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "external_account" text;
--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN "audience" text;
--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN "preferred_words" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN "call_to_action_bn" text;
--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN "call_to_action_en" text;
--> statement-breakpoint
ALTER TABLE "post_targets" ADD COLUMN "caption_override" text;
--> statement-breakpoint
-- This pre-release migration is transactional. Ambiguous legacy records fail validation;
-- operators must reconcile their source evidence before retrying, never silently discard them.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY store_id, wallet ORDER BY created_at, id) AS revision
  FROM public.wallet_ledger
)
UPDATE public.wallet_ledger l SET revision = r.revision FROM ranked r WHERE l.id = r.id;
--> statement-breakpoint
-- Refuse to make a timestamp-ordered balance authoritative unless the whole chain agrees.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT balance_after, sum(amount) OVER (PARTITION BY store_id, wallet ORDER BY revision) AS expected
      FROM public.wallet_ledger
    ) balances WHERE balance_after <> expected
  ) THEN
    RAISE EXCEPTION 'Wallet history requires reconciliation before assigning revisions';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE public.wallet_ledger ALTER COLUMN revision SET NOT NULL;
--> statement-breakpoint
UPDATE public.contact_merges SET operation_key = 'legacy:' || id::text, after_state = '{}'::jsonb,
  undo_until = least(undo_until, now());
--> statement-breakpoint
ALTER TABLE public.contact_merges ALTER COLUMN operation_key SET NOT NULL,
  ALTER COLUMN after_state SET NOT NULL;
--> statement-breakpoint
UPDATE public.orders o SET buyer_name = c.name FROM public.contacts c
WHERE c.id = o.contact_id AND c.store_id = o.store_id;
--> statement-breakpoint
UPDATE public.product_variants SET external_source = 'legacy', external_account = 'legacy'
WHERE external_ref IS NOT NULL;
--> statement-breakpoint
UPDATE public.payment_intents p SET reserved_refund_poisha = r.amount
FROM (SELECT payment_intent_id, sum(amount_poisha) AS amount FROM public.refunds
      WHERE status IN ('requested', 'pending') GROUP BY payment_intent_id) r
WHERE r.payment_intent_id = p.id;
--> statement-breakpoint
-- Template ownership identifies WhatsApp routing without guessing from a phone number.
UPDATE public.campaigns c SET channel_connection_id = t.channel_connection_id
FROM public.whatsapp_templates t
WHERE c.whatsapp_template_id = t.id AND c.store_id = t.store_id AND c.channel = 'whatsapp';
--> statement-breakpoint
WITH single_connection AS (
  SELECT store_id, kind, (array_agg(id))[1] AS id FROM public.channel_connections
  WHERE status = 'active' GROUP BY store_id, kind HAVING count(*) = 1
)
UPDATE public.campaigns c SET channel_connection_id = a.id FROM single_connection a
WHERE c.store_id = a.store_id AND CASE c.channel WHEN 'messenger' THEN 'facebook_page' ELSE c.channel END = a.kind AND c.channel <> 'sms'
  AND c.channel_connection_id IS NULL;
--> statement-breakpoint
-- Preserve the old cursor only for the conversation that actually owns that message.
UPDATE public.conversations c SET memory_built_through_message_id = m.id,
  memory_built_through_message_at = m.created_at
FROM public.contact_memories cm JOIN public.messages m ON m.id = cm.built_through_message_id
WHERE c.id = m.conversation_id AND c.contact_id = cm.contact_id AND c.store_id = cm.store_id;
--> statement-breakpoint
UPDATE public.contact_memories SET version = version + 1;
--> statement-breakpoint
UPDATE public.conversations SET memory_version = memory_version + 1;

--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_link_visits_store_event_key" ON "tracked_link_visits" USING btree ("store_id","event_key");
--> statement-breakpoint
CREATE INDEX "tracked_link_visits_link_occurred_idx" ON "tracked_link_visits" USING btree ("tracked_link_id","occurred_at");
--> statement-breakpoint
CREATE INDEX "tracked_link_visits_occurred_at_idx" ON "tracked_link_visits" USING btree ("occurred_at");
--> statement-breakpoint
CREATE INDEX "content_pieces_store_created_idx" ON "content_pieces" USING btree ("store_id","created_at","id");
--> statement-breakpoint
CREATE INDEX "content_pieces_store_kind_language_idx" ON "content_pieces" USING btree ("store_id","kind","language","created_at","id");
--> statement-breakpoint
CREATE INDEX "content_pieces_created_by_user_id_idx" ON "content_pieces" USING btree ("created_by_user_id");
--> statement-breakpoint
CREATE INDEX "content_pieces_ai_run_id_idx" ON "content_pieces" USING btree ("ai_run_id");
--> statement-breakpoint
CREATE INDEX "platform_settings_updated_by_staff_id_idx" ON "platform_settings" USING btree ("updated_by_staff_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_rule_changes_store_id_id_key" ON "ai_rule_changes" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_runs_store_id_id_key" ON "ai_runs" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_items_store_id_id_key" ON "knowledge_items" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_store_id_id_key" ON "automation_runs" USING btree ("store_id","id");
--> statement-breakpoint
CREATE INDEX "automation_runs_stale_claim_idx" ON "automation_runs" USING btree ("claimed_at") WHERE "automation_runs"."status" = 'running';
--> statement-breakpoint
CREATE UNIQUE INDEX "automation_versions_store_id_id_key" ON "automation_versions" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "automations_store_id_id_key" ON "automations" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_store_id_id_key" ON "invoices" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_ledger_store_id_wallet_revision_key" ON "wallet_ledger" USING btree ("store_id","wallet","revision");
--> statement-breakpoint
CREATE INDEX "campaign_recipients_contact_identity_id_idx" ON "campaign_recipients" USING btree ("contact_identity_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_store_id_id_key" ON "campaigns" USING btree ("store_id","id");
--> statement-breakpoint
CREATE INDEX "campaigns_channel_connection_id_idx" ON "campaigns" USING btree ("channel_connection_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_links_store_id_id_key" ON "tracked_links" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_templates_store_id_id_key" ON "whatsapp_templates" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_connections_store_id_id_key" ON "channel_connections" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_store_id_id_key" ON "conversations" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "contact_identities_store_id_id_key" ON "contact_identities" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "contact_merges_store_id_operation_key_key" ON "contact_merges" USING btree ("store_id","operation_key");
--> statement-breakpoint
CREATE INDEX "contact_merges_kept_contact_id_idx" ON "contact_merges" USING btree ("kept_contact_id");
--> statement-breakpoint
CREATE INDEX "contact_merges_merged_contact_id_idx" ON "contact_merges" USING btree ("merged_contact_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_store_id_id_key" ON "contacts" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_zones_store_id_id_key" ON "delivery_zones" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "orders_store_id_id_key" ON "orders" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_gateway_credentials_store_id_id_key" ON "payment_gateway_credentials" USING btree ("store_id","id");
--> statement-breakpoint
CREATE INDEX "payment_gateway_credentials_store_id_idx" ON "payment_gateway_credentials" USING btree ("store_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_store_id_id_key" ON "payment_intents" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "files_store_id_id_key" ON "files" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_store_id_id_key" ON "product_variants" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_external_identity_key" ON "product_variants" USING btree ("store_id","external_source","external_account","external_ref") WHERE "product_variants"."external_ref" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "products_store_id_id_key" ON "products" USING btree ("store_id","id");
--> statement-breakpoint
CREATE INDEX "restock_requests_variant_id_idx" ON "restock_requests" USING btree ("variant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "post_targets_store_id_id_key" ON "post_targets" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "post_targets_post_connection_key" ON "post_targets" USING btree ("post_id","channel_connection_id");
--> statement-breakpoint
CREATE INDEX "post_targets_channel_connection_id_idx" ON "post_targets" USING btree ("channel_connection_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "posts_store_id_id_key" ON "posts" USING btree ("store_id","id");
--> statement-breakpoint
CREATE INDEX "memberships_store_id_status_idx" ON "memberships" USING btree ("store_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "roles_store_id_id_key" ON "roles" USING btree ("store_id","id");
--> statement-breakpoint
CREATE INDEX "campaign_recipients_campaign_status_idx" ON "campaign_recipients" USING btree ("campaign_id","status","id");
--> statement-breakpoint
ALTER TABLE "tracked_link_visits" ADD CONSTRAINT "tracked_link_visits_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tracked_link_visits" ADD CONSTRAINT "tracked_link_visits_tracked_link_id_tracked_links_id_fk" FOREIGN KEY ("tracked_link_id") REFERENCES "public"."tracked_links"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tracked_link_visits" ADD CONSTRAINT "tracked_link_visits_tracked_link_id_store_fk" FOREIGN KEY ("store_id","tracked_link_id") REFERENCES "public"."tracked_links"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_pieces" ADD CONSTRAINT "content_pieces_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_pieces" ADD CONSTRAINT "content_pieces_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_pieces" ADD CONSTRAINT "content_pieces_ai_run_id_ai_runs_id_fk" FOREIGN KEY ("ai_run_id") REFERENCES "public"."ai_runs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_pieces" ADD CONSTRAINT "content_pieces_ai_run_id_store_fk" FOREIGN KEY ("store_id","ai_run_id") REFERENCES "public"."ai_runs"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_rule_changes" ADD CONSTRAINT "ai_rule_changes_undoes_change_id_store_fk" FOREIGN KEY ("store_id","undoes_change_id") REFERENCES "public"."ai_rule_changes"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_ai_run_id_store_fk" FOREIGN KEY ("store_id","ai_run_id") REFERENCES "public"."ai_runs"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_knowledge_item_id_store_fk" FOREIGN KEY ("store_id","knowledge_item_id") REFERENCES "public"."knowledge_items"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_file_id_store_fk" FOREIGN KEY ("store_id","file_id") REFERENCES "public"."files"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_run_steps" ADD CONSTRAINT "automation_run_steps_run_id_store_fk" FOREIGN KEY ("store_id","run_id") REFERENCES "public"."automation_runs"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_run_steps" ADD CONSTRAINT "automation_run_steps_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_store_fk" FOREIGN KEY ("store_id","automation_id") REFERENCES "public"."automations"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_version_id_store_fk" FOREIGN KEY ("store_id","version_id") REFERENCES "public"."automation_versions"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automation_versions" ADD CONSTRAINT "automation_versions_automation_id_store_fk" FOREIGN KEY ("store_id","automation_id") REFERENCES "public"."automations"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_published_version_id_store_fk" FOREIGN KEY ("store_id","published_version_id") REFERENCES "public"."automation_versions"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credits_invoice_id_store_fk" FOREIGN KEY ("store_id","credits_invoice_id") REFERENCES "public"."invoices"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contact_identity_id_contact_identities_id_fk" FOREIGN KEY ("contact_identity_id") REFERENCES "public"."contact_identities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_store_fk" FOREIGN KEY ("store_id","campaign_id") REFERENCES "public"."campaigns"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contact_identity_id_store_fk" FOREIGN KEY ("store_id","contact_identity_id") REFERENCES "public"."contact_identities"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_channel_connection_id_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_channel_connection_id_store_fk" FOREIGN KEY ("store_id","channel_connection_id") REFERENCES "public"."channel_connections"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_whatsapp_template_id_store_fk" FOREIGN KEY ("store_id","whatsapp_template_id") REFERENCES "public"."whatsapp_templates"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_channel_connection_id_store_fk" FOREIGN KEY ("store_id","channel_connection_id") REFERENCES "public"."channel_connections"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sms_sender_ids" ADD CONSTRAINT "sms_sender_ids_trade_licence_file_id_store_fk" FOREIGN KEY ("store_id","trade_licence_file_id") REFERENCES "public"."files"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sms_sender_ids" ADD CONSTRAINT "sms_sender_ids_nid_file_id_store_fk" FOREIGN KEY ("store_id","nid_file_id") REFERENCES "public"."files"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_connection_id_store_fk" FOREIGN KEY ("store_id","channel_connection_id") REFERENCES "public"."channel_connections"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_store_fk" FOREIGN KEY ("store_id","conversation_id") REFERENCES "public"."conversations"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_ai_run_id_store_fk" FOREIGN KEY ("store_id","ai_run_id") REFERENCES "public"."ai_runs"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_channel_connection_id_store_fk" FOREIGN KEY ("store_id","channel_connection_id") REFERENCES "public"."channel_connections"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_post_target_id_store_fk" FOREIGN KEY ("store_id","post_target_id") REFERENCES "public"."post_targets"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_conversation_id_store_fk" FOREIGN KEY ("store_id","conversation_id") REFERENCES "public"."conversations"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_channel_connection_id_store_fk" FOREIGN KEY ("store_id","channel_connection_id") REFERENCES "public"."channel_connections"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contact_match_suggestions" ADD CONSTRAINT "contact_match_suggestions_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contact_match_suggestions" ADD CONSTRAINT "contact_match_suggestions_matched_contact_id_store_fk" FOREIGN KEY ("store_id","matched_contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contact_match_suggestions" ADD CONSTRAINT "contact_match_suggestions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contact_match_suggestions" ADD CONSTRAINT "contact_match_suggestions_matched_contact_id_contacts_id_fk" FOREIGN KEY ("matched_contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contact_memories" ADD CONSTRAINT "contact_memories_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contact_merges" ADD CONSTRAINT "contact_merges_kept_contact_id_store_fk" FOREIGN KEY ("store_id","kept_contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contact_merges" ADD CONSTRAINT "contact_merges_merged_contact_id_store_fk" FOREIGN KEY ("store_id","merged_contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contact_merges" ADD CONSTRAINT "contact_merges_kept_contact_id_contacts_id_fk" FOREIGN KEY ("kept_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contact_merges" ADD CONSTRAINT "contact_merges_merged_contact_id_contacts_id_fk" FOREIGN KEY ("merged_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contact_stats" ADD CONSTRAINT "contact_stats_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_file_id_store_fk" FOREIGN KEY ("store_id","file_id") REFERENCES "public"."files"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_report_file_id_store_fk" FOREIGN KEY ("store_id","report_file_id") REFERENCES "public"."files"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_store_fk" FOREIGN KEY ("store_id","order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_store_fk" FOREIGN KEY ("store_id","variant_id") REFERENCES "public"."product_variants"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversation_id_store_fk" FOREIGN KEY ("store_id","conversation_id") REFERENCES "public"."conversations"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_zone_id_store_fk" FOREIGN KEY ("store_id","delivery_zone_id") REFERENCES "public"."delivery_zones"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_possible_duplicate_of_order_id_store_fk" FOREIGN KEY ("store_id","possible_duplicate_of_order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_intent_id_store_fk" FOREIGN KEY ("store_id","payment_intent_id") REFERENCES "public"."payment_intents"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_credential_id_store_fk" FOREIGN KEY ("store_id","credential_id") REFERENCES "public"."payment_gateway_credentials"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_order_id_store_fk" FOREIGN KEY ("store_id","order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_invoice_id_store_fk" FOREIGN KEY ("store_id","invoice_id") REFERENCES "public"."invoices"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_intent_id_store_fk" FOREIGN KEY ("store_id","payment_intent_id") REFERENCES "public"."payment_intents"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_store_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_variant_id_store_fk" FOREIGN KEY ("store_id","variant_id") REFERENCES "public"."product_variants"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_conversation_id_store_fk" FOREIGN KEY ("store_id","conversation_id") REFERENCES "public"."conversations"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_store_fk" FOREIGN KEY ("store_id","variant_id") REFERENCES "public"."product_variants"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "post_targets" ADD CONSTRAINT "post_targets_post_id_store_fk" FOREIGN KEY ("store_id","post_id") REFERENCES "public"."posts"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "post_targets" ADD CONSTRAINT "post_targets_channel_connection_id_store_fk" FOREIGN KEY ("store_id","channel_connection_id") REFERENCES "public"."channel_connections"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_ai_run_id_store_fk" FOREIGN KEY ("store_id","ai_run_id") REFERENCES "public"."ai_runs"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_conversation_id_store_fk" FOREIGN KEY ("store_id","conversation_id") REFERENCES "public"."conversations"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_order_id_store_fk" FOREIGN KEY ("store_id","order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_id_store_fk" FOREIGN KEY ("store_id","role_id") REFERENCES "public"."roles"("store_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contact_memories" DROP COLUMN "built_through_message_id";
--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_revision" CHECK ("wallet_ledger"."revision" > 0);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_connection" CHECK (case when "campaigns"."channel" = 'sms' then "campaigns"."channel_connection_id" is null else "campaigns"."status" = 'draft' or "campaigns"."channel_connection_id" is not null end);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_memory_checkpoint" CHECK (("conversations"."memory_built_through_message_id" is null) = ("conversations"."memory_built_through_message_at" is null));
--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_kind" CHECK ("imports"."kind" in ('customers_csv', 'pos_csv', 'products_csv'));
--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_refunded" CHECK ("payment_intents"."refunded_poisha" >= 0 and "payment_intents"."reserved_refund_poisha" >= 0
        and "payment_intents"."refunded_poisha" + "payment_intents"."reserved_refund_poisha" <= coalesce("payment_intents"."verified_amount_poisha", 0));
--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_external_identity" CHECK (("product_variants"."external_ref" is null and "product_variants"."external_source" is null and "product_variants"."external_account" is null)
        or ("product_variants"."external_ref" is not null and "product_variants"."external_source" is not null and "product_variants"."external_account" is not null));
--> statement-breakpoint
ALTER TABLE "post_targets" ADD CONSTRAINT "post_targets_caption_override_length" CHECK (char_length("post_targets"."caption_override") <= 20000);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_caption_length" CHECK (char_length("posts"."caption") <= 20000);
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_active_has_user" CHECK ("memberships"."status" <> 'active' or "memberships"."user_id" is not null);
--> statement-breakpoint

-- Permissions, RLS and functions are maintained alongside the generated schema changes.
ALTER TABLE public.content_pieces ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY content_pieces_isolation ON public.content_pieces
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE public.tracked_link_visits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tracked_link_visits_isolation ON public.tracked_link_visits
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_pieces TO dakly_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.tracked_link_visits TO dakly_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON public.tracked_link_visits, public.ai_rule_changes FROM dakly_app;
--> statement-breakpoint
GRANT DELETE ON public.order_items TO dakly_app;
--> statement-breakpoint
GRANT UPDATE (is_stopped) ON public.automation_versions TO dakly_app;
--> statement-breakpoint
REVOKE UPDATE ON public.invoices FROM dakly_app;
--> statement-breakpoint
GRANT UPDATE (status, paid_at) ON public.invoices TO dakly_app;
--> statement-breakpoint
-- Explicit pg_temp last prevents temporary relations from shadowing owner-owned tables.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public, pg_temp', f.signature);
  END LOOP;
END $$;
--> statement-breakpoint
DROP FUNCTION public.due_automation_runs(integer);
--> statement-breakpoint
CREATE FUNCTION public.due_automation_runs(p_limit integer)
RETURNS TABLE(store_id uuid, automation_run_id uuid, claimed_at timestamptz)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH due AS (
    SELECT d.id FROM public.automation_runs d
    WHERE (d.status = 'waiting' AND d.wake_at <= now())
       OR (d.status = 'running' AND (d.claimed_at IS NULL OR d.claimed_at <= now() - interval '5 minutes'))
    ORDER BY coalesce(d.claimed_at, d.wake_at, d.entered_at), d.id
    LIMIT greatest(0, least(coalesce(p_limit, 100), 1000)) FOR UPDATE SKIP LOCKED
  )
  UPDATE public.automation_runs r SET status = 'running', claimed_at = date_trunc('milliseconds', clock_timestamp()),
    attempts = least(r.attempts::integer + 1, 32767), updated_at = now()
  FROM due WHERE r.id = due.id RETURNING r.store_id, r.id, r.claimed_at
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.due_automation_runs(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.due_automation_runs(integer) TO dakly_app;
--> statement-breakpoint
-- Drizzle does not model deferrability. Purge transactions defer these supplemental checks
-- until SET NULL/CASCADE actions have completed; normal writes still check immediately.
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE public."contact_merges" ALTER CONSTRAINT "contact_merges_kept_contact_id_store_fk" DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE public."contact_merges" ALTER CONSTRAINT "contact_merges_merged_contact_id_store_fk" DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE public."orders" ALTER CONSTRAINT "orders_contact_id_store_fk" DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE public."orders" ALTER CONSTRAINT "orders_conversation_id_store_fk" DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE public."restock_requests" ALTER CONSTRAINT "restock_requests_conversation_id_store_fk" DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
--> statement-breakpoint
-- Only known historical taps can be recovered; intermediate taps were never retained.
INSERT INTO public.tracked_link_visits (id, store_id, tracked_link_id, event_key, occurred_at)
SELECT gen_random_uuid(), store_id, id, 'legacy:' || id::text || ':first', first_tapped_at
FROM public.tracked_links WHERE kind = 'redirect' AND first_tapped_at IS NOT NULL
UNION ALL
SELECT gen_random_uuid(), store_id, id, 'legacy:' || id::text || ':last', last_tapped_at
FROM public.tracked_links WHERE kind = 'redirect' AND last_tapped_at IS NOT NULL
  AND last_tapped_at IS DISTINCT FROM first_tapped_at;
