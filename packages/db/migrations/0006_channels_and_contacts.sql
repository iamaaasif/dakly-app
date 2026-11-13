CREATE TABLE "channel_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"external_account_id" text NOT NULL,
	"display_name" text NOT NULL,
	"access_token_ciphertext" "bytea",
	"key_version" smallint,
	"token_expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"is_ai_live" boolean DEFAULT false NOT NULL,
	"whatsapp_quality_rating" text,
	"whatsapp_messaging_tier" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"connected_by_user_id" uuid,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_connections_kind" CHECK ("channel_connections"."kind" in ('facebook_page', 'instagram', 'whatsapp')),
	CONSTRAINT "channel_connections_status" CHECK ("channel_connections"."status" in ('active', 'needs_reconnect', 'disconnected'))
);
--> statement-breakpoint
CREATE TABLE "sms_sender_ids" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"sender_name" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"trade_licence_file_id" uuid,
	"nid_file_id" uuid,
	"rejection_reason" text,
	"requested_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_sender_ids_status" CHECK ("sms_sender_ids"."status" in ('requested', 'in_review', 'approved', 'rejected')),
	CONSTRAINT "sms_sender_ids_sender_name" CHECK ("sms_sender_ids"."sender_name" ~ '^[A-Za-z0-9 ]{3,11}$')
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"evidence" text,
	"captured_by_user_id" uuid,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consents_channel" CHECK ("consents"."channel" in ('whatsapp', 'sms', 'messenger', 'instagram', 'email')),
	CONSTRAINT "consents_status" CHECK ("consents"."status" in ('granted', 'withdrawn')),
	CONSTRAINT "consents_source" CHECK ("consents"."source" in ('checkout', 'chat_opt_in', 'manual', 'import', 'pos', 'store_sync', 'opt_out_link', 'stop_keyword', 'page_blocked'))
);
--> statement-breakpoint
CREATE TABLE "contact_identities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel_connection_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"external_id" text NOT NULL,
	"profile_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_identities_channel" CHECK ("contact_identities"."channel" in ('messenger', 'instagram', 'whatsapp'))
);
--> statement-breakpoint
CREATE TABLE "contact_match_suggestions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"matched_contact_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"phone" text,
	"order_id" uuid,
	"conversation_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_match_suggestions_reason" CHECK ("contact_match_suggestions"."reason" in ('same_phone', 'same_email', 'similar_name_and_area')),
	CONSTRAINT "contact_match_suggestions_status" CHECK ("contact_match_suggestions"."status" in ('open', 'merged', 'dismissed')),
	CONSTRAINT "contact_match_suggestions_two_contacts" CHECK ("contact_match_suggestions"."contact_id" <> "contact_match_suggestions"."matched_contact_id"),
	CONSTRAINT "contact_match_suggestions_phone_format" CHECK ("contact_match_suggestions"."phone" ~ '^01[3-9][0-9]{8}$')
);
--> statement-breakpoint
CREATE TABLE "contact_merges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"operation_key" text NOT NULL,
	"kept_contact_id" uuid,
	"merged_contact_id" uuid,
	"moved_rows" jsonb NOT NULL,
	"replaced_fields" jsonb NOT NULL,
	"after_state" jsonb NOT NULL,
	"undo_conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_redacted_at" timestamp with time zone,
	"merged_by_user_id" uuid NOT NULL,
	"undo_until" timestamp with time zone NOT NULL,
	"undone_at" timestamp with time zone,
	"undone_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_merges_two_contacts" CHECK ("contact_merges"."kept_contact_id" <> "contact_merges"."merged_contact_id")
);
--> statement-breakpoint
CREATE TABLE "contact_stats" (
	"contact_id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"orders_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"net_spend_poisha" bigint DEFAULT 0 NOT NULL,
	"first_order_at" timestamp with time zone,
	"last_order_at" timestamp with time zone,
	"usual_gap_days" integer,
	"favourite_category" text,
	"lifecycle_stage" text DEFAULT 'none' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_stats_lifecycle_stage" CHECK ("contact_stats"."lifecycle_stage" in ('none', 'stopped_buying', 'best', 'slipping_away', 'new', 'regulars', 'bought_once')),
	CONSTRAINT "contact_stats_counts" CHECK ("contact_stats"."orders_count" >= 0 and "contact_stats"."delivered_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text,
	"phone" text,
	"phone_verified_at" timestamp with time zone,
	"whatsapp_phone" text,
	"email" "citext",
	"address" text,
	"district" text,
	"bd_area_id" integer,
	"gender" text,
	"birthday_day" smallint,
	"birthday_month" smallint,
	"birth_year" smallint,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"not_customer_reason" text,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"is_over_plan_limit" boolean DEFAULT false NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"external_ref" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_phone_format" CHECK ("contacts"."phone" ~ '^01[3-9][0-9]{8}$'),
	CONSTRAINT "contacts_whatsapp_phone_format" CHECK ("contacts"."whatsapp_phone" ~ '^01[3-9][0-9]{8}$'),
	CONSTRAINT "contacts_verified_needs_phone" CHECK ("contacts"."phone_verified_at" is null or "contacts"."phone" is not null),
	CONSTRAINT "contacts_source" CHECK ("contacts"."source" in ('messenger', 'instagram', 'whatsapp', 'comment', 'order_link', 'manual', 'voice', 'import', 'shopify', 'woocommerce', 'pos')),
	CONSTRAINT "contacts_kind" CHECK ("contacts"."kind" in ('chat_only', 'lead', 'customer', 'not_customer')),
	CONSTRAINT "contacts_not_customer_reason" CHECK (("contacts"."kind" = 'not_customer') = ("contacts"."not_customer_reason" is not null)),
	CONSTRAINT "contacts_gender" CHECK ("contacts"."gender" in ('female', 'male', 'other')),
	CONSTRAINT "contacts_birthday" CHECK ("contacts"."birthday_day" between 1 and 31 and "contacts"."birthday_month" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "customer_insights" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source" text DEFAULT 'all' NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"figures" jsonb NOT NULL,
	"fact_text" text,
	"tip_text" text,
	"ai_run_id" uuid,
	"hidden_at" timestamp with time zone,
	"hidden_by_user_id" uuid,
	"built_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_insights_kind" CHECK ("customer_insights"."kind" in ('first_product_regulars', 'due_to_reorder', 'best_time', 'loyalty_steps', 'places')),
	CONSTRAINT "customer_insights_source" CHECK ("customer_insights"."source" in ('all', 'shopify', 'facebook', 'store')),
	CONSTRAINT "customer_insights_period" CHECK ("customer_insights"."period_start" <= "customer_insights"."period_end"),
	CONSTRAINT "customer_insights_hidden" CHECK (("customer_insights"."hidden_at" is null) = ("customer_insights"."hidden_by_user_id" is null))
);
--> statement-breakpoint
CREATE TABLE "data_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"contact_id" uuid,
	"requested_by_user_id" uuid,
	"due_at" timestamp with time zone NOT NULL,
	"handled_by_staff_id" uuid,
	"file_id" uuid,
	"note" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_requests_kind" CHECK ("data_requests"."kind" in ('store_export', 'store_delete', 'contact_delete')),
	CONSTRAINT "data_requests_status" CHECK ("data_requests"."status" in ('open', 'in_progress', 'done', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"file_id" uuid NOT NULL,
	"column_mapping" jsonb,
	"duplicate_mode" text DEFAULT 'update' NOT NULL,
	"has_consent_confirmation" boolean DEFAULT false NOT NULL,
	"rows_total" integer,
	"rows_added" integer,
	"rows_updated" integer,
	"rows_skipped" integer,
	"rows_failed" integer,
	"report_file_id" uuid,
	"created_by_user_id" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imports_kind" CHECK ("imports"."kind" in ('customers_csv', 'pos_csv', 'products_csv')),
	CONSTRAINT "imports_status" CHECK ("imports"."status" in ('uploaded', 'mapped', 'validated', 'importing', 'done', 'failed')),
	CONSTRAINT "imports_duplicate_mode" CHECK ("imports"."duplicate_mode" in ('update', 'skip'))
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"ready_made_key" text,
	"rules" jsonb NOT NULL,
	"ai_prompt" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_memories" (
	"contact_id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"built_at" timestamp with time zone,
	"cleared_at" timestamp with time zone,
	"edited_by_user_id" uuid,
	"edited_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_memories_summary_length" CHECK (char_length("contact_memories"."summary") <= 600),
	CONSTRAINT "contact_memories_facts_array" CHECK (jsonb_typeof("contact_memories"."facts") = 'array'),
	CONSTRAINT "contact_memories_facts_count" CHECK (jsonb_array_length("contact_memories"."facts") <= 40)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_connections_store_id_id_key" ON "channel_connections" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_connections_account_key" ON "channel_connections" USING btree ("kind","external_account_id") WHERE "channel_connections"."status" <> 'disconnected';--> statement-breakpoint
CREATE UNIQUE INDEX "sms_sender_ids_store_id_id_key" ON "sms_sender_ids" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_identities_store_id_id_key" ON "contact_identities" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_identities_connection_external_id_key" ON "contact_identities" USING btree ("channel_connection_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_match_suggestions_open_key" ON "contact_match_suggestions" USING btree ("store_id","contact_id","matched_contact_id","reason") WHERE "contact_match_suggestions"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "contact_merges_store_id_operation_key_key" ON "contact_merges" USING btree ("store_id","operation_key");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_merges_merged_contact_id_key" ON "contact_merges" USING btree ("merged_contact_id") WHERE "contact_merges"."undone_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_store_id_id_key" ON "contacts" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_store_id_phone_key" ON "contacts" USING btree ("store_id","phone") WHERE "contacts"."phone" is not null and "contacts"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_store_id_external_ref_key" ON "contacts" USING btree ("store_id","external_ref") WHERE "contacts"."external_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_insights_store_id_kind_source_key" ON "customer_insights" USING btree ("store_id","kind","source");--> statement-breakpoint
CREATE UNIQUE INDEX "segments_store_id_name_key" ON "segments" USING btree ("store_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "segments_store_id_ready_made_key_key" ON "segments" USING btree ("store_id","ready_made_key") WHERE "segments"."ready_made_key" is not null;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_sender_ids" ADD CONSTRAINT "sms_sender_ids_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_sender_ids" ADD CONSTRAINT "sms_sender_ids_trade_licence_file_id_files_id_fk" FOREIGN KEY ("trade_licence_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_sender_ids" ADD CONSTRAINT "sms_sender_ids_nid_file_id_files_id_fk" FOREIGN KEY ("nid_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_sender_ids" ADD CONSTRAINT "sms_sender_ids_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_sender_ids" ADD CONSTRAINT "sms_sender_ids_trade_licence_file_id_store_fk" FOREIGN KEY ("store_id","trade_licence_file_id") REFERENCES "public"."files"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_sender_ids" ADD CONSTRAINT "sms_sender_ids_nid_file_id_store_fk" FOREIGN KEY ("store_id","nid_file_id") REFERENCES "public"."files"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_captured_by_user_id_users_id_fk" FOREIGN KEY ("captured_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_channel_connection_id_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_channel_connection_id_store_fk" FOREIGN KEY ("store_id","channel_connection_id") REFERENCES "public"."channel_connections"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_match_suggestions" ADD CONSTRAINT "contact_match_suggestions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_match_suggestions" ADD CONSTRAINT "contact_match_suggestions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_match_suggestions" ADD CONSTRAINT "contact_match_suggestions_matched_contact_id_contacts_id_fk" FOREIGN KEY ("matched_contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_match_suggestions" ADD CONSTRAINT "contact_match_suggestions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_match_suggestions" ADD CONSTRAINT "contact_match_suggestions_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_match_suggestions" ADD CONSTRAINT "contact_match_suggestions_matched_contact_id_store_fk" FOREIGN KEY ("store_id","matched_contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_merges" ADD CONSTRAINT "contact_merges_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_merges" ADD CONSTRAINT "contact_merges_kept_contact_id_contacts_id_fk" FOREIGN KEY ("kept_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_merges" ADD CONSTRAINT "contact_merges_merged_contact_id_contacts_id_fk" FOREIGN KEY ("merged_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_merges" ADD CONSTRAINT "contact_merges_merged_by_user_id_users_id_fk" FOREIGN KEY ("merged_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_merges" ADD CONSTRAINT "contact_merges_undone_by_user_id_users_id_fk" FOREIGN KEY ("undone_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_merges" ADD CONSTRAINT "contact_merges_kept_contact_id_store_fk" FOREIGN KEY ("store_id","kept_contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_merges" ADD CONSTRAINT "contact_merges_merged_contact_id_store_fk" FOREIGN KEY ("store_id","merged_contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_stats" ADD CONSTRAINT "contact_stats_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_stats" ADD CONSTRAINT "contact_stats_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_stats" ADD CONSTRAINT "contact_stats_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_bd_area_id_bd_areas_id_fk" FOREIGN KEY ("bd_area_id") REFERENCES "public"."bd_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_insights" ADD CONSTRAINT "customer_insights_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_insights" ADD CONSTRAINT "customer_insights_hidden_by_user_id_users_id_fk" FOREIGN KEY ("hidden_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_handled_by_staff_id_staff_users_id_fk" FOREIGN KEY ("handled_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_file_id_store_fk" FOREIGN KEY ("store_id","file_id") REFERENCES "public"."files"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_report_file_id_files_id_fk" FOREIGN KEY ("report_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_file_id_store_fk" FOREIGN KEY ("store_id","file_id") REFERENCES "public"."files"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_report_file_id_store_fk" FOREIGN KEY ("store_id","report_file_id") REFERENCES "public"."files"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_memories" ADD CONSTRAINT "contact_memories_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_memories" ADD CONSTRAINT "contact_memories_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_memories" ADD CONSTRAINT "contact_memories_edited_by_user_id_users_id_fk" FOREIGN KEY ("edited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_memories" ADD CONSTRAINT "contact_memories_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_connections_store_id_idx" ON "channel_connections" USING btree ("store_id","kind");--> statement-breakpoint
CREATE INDEX "channel_connections_token_expires_at_idx" ON "channel_connections" USING btree ("token_expires_at") WHERE "channel_connections"."status" = 'active';--> statement-breakpoint
CREATE INDEX "channel_connections_connected_by_user_id_idx" ON "channel_connections" USING btree ("connected_by_user_id");--> statement-breakpoint
CREATE INDEX "sms_sender_ids_store_id_idx" ON "sms_sender_ids" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "sms_sender_ids_status_idx" ON "sms_sender_ids" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sms_sender_ids_trade_licence_file_id_idx" ON "sms_sender_ids" USING btree ("trade_licence_file_id");--> statement-breakpoint
CREATE INDEX "sms_sender_ids_nid_file_id_idx" ON "sms_sender_ids" USING btree ("nid_file_id");--> statement-breakpoint
CREATE INDEX "sms_sender_ids_requested_by_user_id_idx" ON "sms_sender_ids" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "consents_contact_channel_idx" ON "consents" USING btree ("store_id","contact_id","channel","captured_at");--> statement-breakpoint
CREATE INDEX "consents_contact_id_idx" ON "consents" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "consents_captured_by_user_id_idx" ON "consents" USING btree ("captured_by_user_id");--> statement-breakpoint
CREATE INDEX "contact_identities_contact_id_idx" ON "contact_identities" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contact_identities_store_id_idx" ON "contact_identities" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "contact_match_suggestions_store_id_status_created_at_idx" ON "contact_match_suggestions" USING btree ("store_id","status","created_at");--> statement-breakpoint
CREATE INDEX "contact_match_suggestions_contact_id_idx" ON "contact_match_suggestions" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contact_match_suggestions_matched_contact_id_idx" ON "contact_match_suggestions" USING btree ("matched_contact_id");--> statement-breakpoint
CREATE INDEX "contact_match_suggestions_store_id_order_id_idx" ON "contact_match_suggestions" USING btree ("store_id","order_id") WHERE "contact_match_suggestions"."order_id" is not null;--> statement-breakpoint
CREATE INDEX "contact_match_suggestions_decided_by_user_id_idx" ON "contact_match_suggestions" USING btree ("decided_by_user_id");--> statement-breakpoint
CREATE INDEX "contact_merges_kept_contact_id_idx" ON "contact_merges" USING btree ("kept_contact_id");--> statement-breakpoint
CREATE INDEX "contact_merges_merged_contact_id_idx" ON "contact_merges" USING btree ("merged_contact_id");--> statement-breakpoint
CREATE INDEX "contact_merges_store_id_kept_contact_id_idx" ON "contact_merges" USING btree ("store_id","kept_contact_id");--> statement-breakpoint
CREATE INDEX "contact_merges_store_id_created_at_idx" ON "contact_merges" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "contact_merges_merged_by_user_id_idx" ON "contact_merges" USING btree ("merged_by_user_id");--> statement-breakpoint
CREATE INDEX "contact_merges_undone_by_user_id_idx" ON "contact_merges" USING btree ("undone_by_user_id");--> statement-breakpoint
CREATE INDEX "contact_stats_store_id_stage_idx" ON "contact_stats" USING btree ("store_id","lifecycle_stage");--> statement-breakpoint
CREATE INDEX "contact_stats_store_id_last_order_at_idx" ON "contact_stats" USING btree ("store_id","last_order_at");--> statement-breakpoint
CREATE INDEX "contact_stats_store_id_net_spend_idx" ON "contact_stats" USING btree ("store_id","net_spend_poisha");--> statement-breakpoint
CREATE INDEX "contacts_store_id_created_at_idx" ON "contacts" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "contacts_store_id_kind_idx" ON "contacts" USING btree ("store_id","kind");--> statement-breakpoint
CREATE INDEX "contacts_store_id_email_idx" ON "contacts" USING btree ("store_id","email");--> statement-breakpoint
CREATE INDEX "contacts_tags_idx" ON "contacts" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "contacts_name_trgm_idx" ON "contacts" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "contacts_phone_pattern_idx" ON "contacts" USING btree ("store_id","phone" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "contacts_bd_area_id_idx" ON "contacts" USING btree ("bd_area_id");--> statement-breakpoint
CREATE INDEX "contacts_deleted_at_idx" ON "contacts" USING btree ("deleted_at") WHERE "contacts"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "customer_insights_hidden_by_user_id_idx" ON "customer_insights" USING btree ("hidden_by_user_id");--> statement-breakpoint
CREATE INDEX "data_requests_store_id_created_at_idx" ON "data_requests" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "data_requests_open_idx" ON "data_requests" USING btree ("due_at") WHERE "data_requests"."status" in ('open', 'in_progress');--> statement-breakpoint
CREATE INDEX "data_requests_contact_id_idx" ON "data_requests" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "data_requests_requested_by_user_id_idx" ON "data_requests" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "data_requests_handled_by_staff_id_idx" ON "data_requests" USING btree ("handled_by_staff_id");--> statement-breakpoint
CREATE INDEX "data_requests_file_id_idx" ON "data_requests" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "imports_store_id_created_at_idx" ON "imports" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "imports_file_id_idx" ON "imports" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "imports_report_file_id_idx" ON "imports" USING btree ("report_file_id");--> statement-breakpoint
CREATE INDEX "imports_created_by_user_id_idx" ON "imports" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "segments_created_by_user_id_idx" ON "segments" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "contact_memories_store_id_idx" ON "contact_memories" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "contact_memories_edited_by_user_id_idx" ON "contact_memories" USING btree ("edited_by_user_id");--> statement-breakpoint

-- Written by hand below this line (docs/rules/database.md, Migrations step 2). Row level
-- security: a connection sees and writes only the rows of the store set by
-- TenantDatabase.forStore. See docs/data/isolation-and-access.md.
ALTER TABLE "customer_insights" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "customer_insights_isolation" ON "customer_insights"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "data_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "data_requests_isolation" ON "data_requests"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "channel_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "channel_connections_isolation" ON "channel_connections"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "consents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "consents_isolation" ON "consents"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "contact_identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "contact_identities_isolation" ON "contact_identities"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "contact_match_suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "contact_match_suggestions_isolation" ON "contact_match_suggestions"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "contact_memories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "contact_memories_isolation" ON "contact_memories"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "contact_merges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "contact_merges_isolation" ON "contact_merges"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "contact_stats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "contact_stats_isolation" ON "contact_stats"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "contacts_isolation" ON "contacts"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "imports_isolation" ON "imports"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "segments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "segments_isolation" ON "segments"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "sms_sender_ids" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sms_sender_ids_isolation" ON "sms_sender_ids"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint

-- Consent history is append-only evidence.
REVOKE UPDATE, DELETE ON "consents" FROM dakly_app;--> statement-breakpoint
-- Sending reads consent only through this view. security_invoker makes the caller's RLS apply.
CREATE VIEW "contact_consent_current" WITH (security_invoker = true) AS
  SELECT DISTINCT ON ("contact_id", "channel")
    "store_id", "contact_id", "channel", "status", "source", "captured_at"
  FROM "consents"
  ORDER BY "contact_id", "channel", "captured_at" DESC, "id" DESC;--> statement-breakpoint
GRANT SELECT ON "contact_consent_current" TO dakly_app;--> statement-breakpoint

CREATE FUNCTION store_id_for_channel_account(p_kind text, p_external_account_id text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id FROM channel_connections
  WHERE kind = p_kind AND external_account_id = p_external_account_id AND status <> 'disconnected'
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION store_id_for_channel_account(text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION store_id_for_channel_account(text, text) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION channel_connections_expiring_before(p_before timestamptz) RETURNS TABLE(store_id uuid, channel_connection_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM channel_connections WHERE status = 'active' AND token_expires_at <= p_before
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION channel_connections_expiring_before(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION channel_connections_expiring_before(timestamptz) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION due_contact_purges(p_limit integer) RETURNS TABLE(store_id uuid, contact_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM contacts WHERE deleted_at < now() - interval '30 days' ORDER BY deleted_at LIMIT p_limit
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION due_contact_purges(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION due_contact_purges(integer) TO dakly_app;--> statement-breakpoint
-- Drizzle does not model deferrability. Contact purges defer these same-store checks until
-- the SET NULL and CASCADE actions have run; normal writes still check immediately.
ALTER TABLE "contact_merges" ALTER CONSTRAINT "contact_merges_kept_contact_id_store_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "contact_merges" ALTER CONSTRAINT "contact_merges_merged_contact_id_store_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
