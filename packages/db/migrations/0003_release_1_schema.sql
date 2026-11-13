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
CREATE TABLE "store_daily_metrics" (
	"store_id" uuid NOT NULL,
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"dimension" text DEFAULT '' NOT NULL,
	"value" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_daily_metrics_store_id_day_metric_dimension_pk" PRIMARY KEY("store_id","day","metric","dimension")
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
CREATE TABLE "automation_run_steps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"kind" text NOT NULL,
	"outcome" text NOT NULL,
	"channel" text,
	"skip_reason" text,
	"provider_message_id" text,
	"cost_poisha" bigint,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"tapped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_run_steps_kind" CHECK ("automation_run_steps"."kind" in ('trigger', 'wait', 'condition', 'random', 'send', 'action', 'goal', 'exit')),
	CONSTRAINT "automation_run_steps_skip_reason" CHECK ("automation_run_steps"."skip_reason" in ('no_consent', 'not_customer', 'blocked', 'no_address', 'over_plan_limit', 'frequency_cap', 'window_closed', 'meta_user_limit', 'do_not_call', 'daily_reach_limit'))
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"trigger_key" text NOT NULL,
	"current_step_key" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"exit_reason" text,
	"wake_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_runs_status" CHECK ("automation_runs"."status" in ('waiting', 'running', 'done', 'exited', 'failed')),
	CONSTRAINT "automation_runs_waiting_has_wake" CHECK ("automation_runs"."status" <> 'waiting' or "automation_runs"."wake_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "automation_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"graph" jsonb NOT NULL,
	"is_stopped" boolean DEFAULT false NOT NULL,
	"published_by_user_id" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"template_key" text,
	"trigger_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_transactional" boolean DEFAULT false NOT NULL,
	"priority" smallint DEFAULT 0 NOT NULL,
	"draft_graph" jsonb NOT NULL,
	"published_version_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automations_status" CHECK ("automations"."status" in ('draft', 'active', 'paused', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" "citext" NOT NULL,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	"plan_codes" text[],
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"max_redemptions" integer,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"created_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_kind" CHECK ("coupons"."kind" in ('percent', 'amount')),
	CONSTRAINT "coupons_value" CHECK ("coupons"."value" > 0 and ("coupons"."kind" <> 'percent' or "coupons"."value" <= 100)),
	CONSTRAINT "coupons_redemptions" CHECK ("coupons"."max_redemptions" is null or "coupons"."redemption_count" <= "coupons"."max_redemptions")
);
--> statement-breakpoint
CREATE TABLE "invoice_counters" (
	"financial_year" text PRIMARY KEY NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"number" text NOT NULL,
	"financial_year" text NOT NULL,
	"kind" text DEFAULT 'invoice' NOT NULL,
	"credits_invoice_id" uuid,
	"lines" jsonb NOT NULL,
	"bill_to" jsonb NOT NULL,
	"subtotal_poisha" bigint NOT NULL,
	"vat_rate_basis_points" integer NOT NULL,
	"vat_poisha" bigint NOT NULL,
	"total_poisha" bigint NOT NULL,
	"coupon_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_kind" CHECK ("invoices"."kind" in ('invoice', 'credit_note')),
	CONSTRAINT "invoices_status" CHECK ("invoices"."status" in ('open', 'paid', 'void')),
	CONSTRAINT "invoices_credit_note" CHECK (("invoices"."kind" = 'credit_note') = ("invoices"."credits_invoice_id" is not null)),
	CONSTRAINT "invoices_total" CHECK ("invoices"."total_poisha" = "invoices"."subtotal_poisha" + "invoices"."vat_poisha")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"monthly_price_poisha" bigint NOT NULL,
	"yearly_price_poisha" bigint NOT NULL,
	"limits" jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_prices" CHECK ("plans"."monthly_price_poisha" >= 0 and "plans"."yearly_price_poisha" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"billing_cycle" text DEFAULT 'monthly' NOT NULL,
	"status" text NOT NULL,
	"price_poisha" bigint NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"pending_plan_id" uuid,
	"renewal_method" text DEFAULT 'pay_link' NOT NULL,
	"bkash_agreement_ciphertext" "bytea",
	"bkash_agreement_key_version" smallint,
	"past_due_since" timestamp with time zone,
	"renewal_attempts" smallint DEFAULT 0 NOT NULL,
	"next_renewal_attempt_at" timestamp with time zone,
	"read_only_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_billing_cycle" CHECK ("subscriptions"."billing_cycle" in ('monthly', 'yearly')),
	CONSTRAINT "subscriptions_status" CHECK ("subscriptions"."status" in ('trialing', 'active', 'past_due', 'read_only', 'cancelled')),
	CONSTRAINT "subscriptions_renewal_method" CHECK ("subscriptions"."renewal_method" in ('bkash_agreement', 'pay_link'))
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"quantity" integer NOT NULL,
	"source" text NOT NULL,
	"reference" text NOT NULL,
	"period_start" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_events_unit" CHECK ("usage_events"."unit" in ('ai_conversation', 'ai_content', 'ai_ask')),
	CONSTRAINT "usage_events_source" CHECK ("usage_events"."source" in ('allowance', 'top_up')),
	CONSTRAINT "usage_events_quantity" CHECK ("usage_events"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "wallet_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"wallet" text NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"amount" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"reference_type" text,
	"reference_id" uuid,
	"idempotency_key" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" uuid,
	"actor_staff_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_ledger_wallet" CHECK ("wallet_ledger"."wallet" in ('whatsapp_poisha', 'sms_credits', 'ai_conversations')),
	CONSTRAINT "wallet_ledger_kind" CHECK ("wallet_ledger"."kind" in ('top_up', 'charge', 'reserve', 'release', 'refund', 'adjustment', 'expiry')),
	CONSTRAINT "wallet_ledger_actor_type" CHECK ("wallet_ledger"."actor_type" in ('user', 'ai', 'system', 'staff', 'customer')),
	CONSTRAINT "wallet_ledger_amount" CHECK ("wallet_ledger"."amount" <> 0),
	CONSTRAINT "wallet_ledger_balance" CHECK ("wallet_ledger"."balance_after" >= 0),
	CONSTRAINT "wallet_ledger_revision" CHECK ("wallet_ledger"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_recipients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"contact_identity_id" uuid,
	"address" text,
	"status" text NOT NULL,
	"skip_reason" text,
	"provider_message_id" text,
	"cost_poisha" bigint,
	"error_code" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"tapped_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_recipients_status" CHECK ("campaign_recipients"."status" in ('skipped', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
	CONSTRAINT "campaign_recipients_skip_reason" CHECK (("campaign_recipients"."status" = 'skipped') = ("campaign_recipients"."skip_reason" is not null)),
	CONSTRAINT "campaign_recipients_skip_reason_value" CHECK ("campaign_recipients"."skip_reason" in ('no_consent', 'not_customer', 'blocked', 'no_address', 'over_plan_limit', 'frequency_cap', 'window_closed', 'meta_user_limit', 'do_not_call', 'daily_reach_limit'))
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"goal" text,
	"channel" text NOT NULL,
	"channel_connection_id" uuid,
	"category" text DEFAULT 'marketing' NOT NULL,
	"whatsapp_template_id" uuid,
	"content" jsonb NOT NULL,
	"include_segment_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"exclude_segment_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"pause_reason" text,
	"is_ai_written" boolean DEFAULT false NOT NULL,
	"scheduled_for" timestamp with time zone,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"estimated_cost_poisha" bigint,
	"reserved_poisha" bigint DEFAULT 0 NOT NULL,
	"actual_cost_poisha" bigint DEFAULT 0 NOT NULL,
	"recipients_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"read_count" integer DEFAULT 0 NOT NULL,
	"tapped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"counts_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_connection" CHECK (case when "campaigns"."channel" = 'sms' then "campaigns"."channel_connection_id" is null else "campaigns"."status" = 'draft' or "campaigns"."channel_connection_id" is not null end),
	CONSTRAINT "campaigns_channel" CHECK ("campaigns"."channel" in ('whatsapp', 'sms', 'messenger')),
	CONSTRAINT "campaigns_category" CHECK ("campaigns"."category" in ('marketing', 'utility', 'authentication')),
	CONSTRAINT "campaigns_status" CHECK ("campaigns"."status" in ('draft', 'waiting_approval', 'scheduled', 'sending', 'paused', 'sent', 'cancelled', 'failed')),
	CONSTRAINT "campaigns_pause_reason" CHECK (("campaigns"."status" = 'paused') = ("campaigns"."pause_reason" is not null)),
	CONSTRAINT "campaigns_whatsapp_template" CHECK ("campaigns"."channel" <> 'whatsapp' or "campaigns"."status" = 'draft' or "campaigns"."whatsapp_template_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "tracked_link_visit_days" (
	"store_id" uuid NOT NULL,
	"tracked_link_id" uuid NOT NULL,
	"day" date NOT NULL,
	"visits" integer NOT NULL,
	"unique_visitors" integer NOT NULL,
	"first_at" timestamp with time zone NOT NULL,
	"last_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tracked_link_visit_days_pkey" PRIMARY KEY("tracked_link_id","day"),
	CONSTRAINT "tracked_link_visit_days_counts" CHECK ("tracked_link_visit_days"."visits" >= "tracked_link_visit_days"."unique_visitors" and "tracked_link_visit_days"."unique_visitors" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tracked_link_visits" (
	"id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"tracked_link_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"visitor_hash" "bytea",
	CONSTRAINT "tracked_link_visits_pkey" PRIMARY KEY("id","occurred_at")
);
--> statement-breakpoint
CREATE TABLE "tracked_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"code" text NOT NULL,
	"kind" text DEFAULT 'redirect' NOT NULL,
	"target_url" text,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"contact_id" uuid,
	"tap_count" integer DEFAULT 0 NOT NULL,
	"first_tapped_at" timestamp with time zone,
	"last_tapped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_links_kind" CHECK ("tracked_links"."kind" in ('redirect', 'sms_opt_out')),
	CONSTRAINT "tracked_links_source_type" CHECK ("tracked_links"."source_type" in ('campaign', 'automation', 'post', 'chat', 'order')),
	CONSTRAINT "tracked_links_redirect_target" CHECK ("tracked_links"."kind" <> 'redirect' or "tracked_links"."target_url" is not null),
	CONSTRAINT "tracked_links_opt_out_contact" CHECK ("tracked_links"."kind" <> 'sms_opt_out' or "tracked_links"."contact_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"channel_connection_id" uuid NOT NULL,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"category" text NOT NULL,
	"components" jsonb NOT NULL,
	"meta_template_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"rejection_reason" text,
	"is_ready_made" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_templates_category" CHECK ("whatsapp_templates"."category" in ('marketing', 'utility', 'authentication')),
	CONSTRAINT "whatsapp_templates_status" CHECK ("whatsapp_templates"."status" in ('draft', 'pending', 'approved', 'rejected', 'paused', 'disabled'))
);
--> statement-breakpoint
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
	"responder_returns_at" timestamp with time zone,
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
	"transcript" text,
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
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "delivery_zones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"charge_poisha" bigint NOT NULL,
	"bd_area_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_zones_charge" CHECK ("delivery_zones"."charge_poisha" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"variant_title" text NOT NULL,
	"quantity" integer NOT NULL,
	"delivered_quantity" integer,
	"unit_price_poisha" bigint NOT NULL,
	"unit_cost_poisha" bigint,
	"discount_poisha" bigint DEFAULT 0 NOT NULL,
	"is_stock_tracked" boolean NOT NULL,
	"is_oversell_allowed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity" CHECK ("order_items"."quantity" > 0 and coalesce("order_items"."delivered_quantity", 0) between 0 and "order_items"."quantity"),
	CONSTRAINT "order_items_money" CHECK ("order_items"."unit_price_poisha" > 0 and "order_items"."discount_poisha" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"buyer_name" text,
	"contact_id" uuid,
	"conversation_id" uuid,
	"source" text NOT NULL,
	"created_by_type" text NOT NULL,
	"created_by_user_id" uuid,
	"is_self_delivery" boolean DEFAULT true NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_phone" text NOT NULL,
	"recipient_address" text NOT NULL,
	"recipient_district" text NOT NULL,
	"recipient_bd_area_id" integer,
	"delivery_zone_id" uuid,
	"stage" text DEFAULT 'to_confirm' NOT NULL,
	"on_hold_reason" text,
	"follow_up_on" date,
	"cancel_reason" text,
	"return_reason" text,
	"payment_status" text DEFAULT 'cod_pending' NOT NULL,
	"items_total_poisha" bigint NOT NULL,
	"discount_poisha" bigint DEFAULT 0 NOT NULL,
	"delivery_charge_poisha" bigint DEFAULT 0 NOT NULL,
	"is_delivery_charge_overridden" boolean DEFAULT false NOT NULL,
	"advance_paid_poisha" bigint DEFAULT 0 NOT NULL,
	"cod_amount_poisha" bigint NOT NULL,
	"cod_collected_poisha" bigint,
	"courier" text,
	"courier_other_name" text,
	"tracking_code" text,
	"courier_charge_poisha" bigint,
	"cod_fee_poisha" bigint,
	"confirmation_method" text,
	"confirmed_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"shipped_by_user_id" uuid,
	"delivered_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cod_collected_at" timestamp with time zone,
	"attributed_source_type" text,
	"attributed_source_id" uuid,
	"attributed_channel" text,
	"attributed_at" timestamp with time zone,
	"possible_duplicate_of_order_id" uuid,
	"note" text,
	"external_ref" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_source" CHECK ("orders"."source" in ('messenger', 'instagram', 'whatsapp', 'comment', 'order_link', 'manual', 'pos_csv', 'shopify', 'woocommerce')),
	CONSTRAINT "orders_created_by_type" CHECK ("orders"."created_by_type" in ('ai', 'user', 'customer', 'sync')),
	CONSTRAINT "orders_stage" CHECK ("orders"."stage" in ('to_confirm', 'on_hold', 'to_pack', 'with_courier', 'delivered', 'partially_delivered', 'returned', 'cancelled')),
	CONSTRAINT "orders_payment_status" CHECK ("orders"."payment_status" in ('cod_pending', 'advance_requested', 'advance_paid', 'paid', 'cod_collected', 'refund_due', 'refunded')),
	CONSTRAINT "orders_on_hold_reason" CHECK (("orders"."stage" = 'on_hold') = ("orders"."on_hold_reason" is not null)),
	CONSTRAINT "orders_cancel_reason" CHECK (("orders"."stage" = 'cancelled') = ("orders"."cancel_reason" is not null)),
	CONSTRAINT "orders_courier" CHECK ("orders"."courier" in ('steadfast', 'pathao', 'redx', 'own_delivery', 'other')),
	CONSTRAINT "orders_confirmation_method" CHECK ("orders"."confirmation_method" in ('whatsapp_reply', 'sms_link', 'chat_reply', 'staff', 'advance_paid')),
	CONSTRAINT "orders_attributed_source_type" CHECK ("orders"."attributed_source_type" in ('campaign', 'automation', 'post')),
	CONSTRAINT "orders_recipient_phone_format" CHECK ("orders"."recipient_phone" ~ '^01[3-9][0-9]{8}$'),
	CONSTRAINT "orders_money" CHECK ("orders"."items_total_poisha" >= 0 and "orders"."discount_poisha" >= 0 and "orders"."delivery_charge_poisha" >= 0 and "orders"."advance_paid_poisha" >= 0 and "orders"."cod_amount_poisha" >= 0),
	CONSTRAINT "orders_number" CHECK ("orders"."number" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"payment_intent_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"gateway_reference" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_kind" CHECK ("payment_events"."kind" in ('created', 'sent', 'opened', 'redirected', 'callback', 'verified', 'status_changed', 'refund_requested', 'refund_result', 'dispute'))
);
--> statement-breakpoint
CREATE TABLE "payment_gateway_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"gateway" text NOT NULL,
	"mode" text NOT NULL,
	"account_label" text NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"key_version" smallint NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"connected_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_gateway_credentials_gateway" CHECK ("payment_gateway_credentials"."gateway" in ('bkash', 'nagad', 'city_bank')),
	CONSTRAINT "payment_gateway_credentials_mode" CHECK ("payment_gateway_credentials"."mode" in ('live', 'sandbox')),
	CONSTRAINT "payment_gateway_credentials_status" CHECK ("payment_gateway_credentials"."status" in ('connected', 'needs_attention', 'disconnected'))
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"flow" text NOT NULL,
	"purpose" text NOT NULL,
	"gateway" text NOT NULL,
	"credential_id" uuid,
	"order_id" uuid,
	"invoice_id" uuid,
	"amount_poisha" bigint NOT NULL,
	"currency" text DEFAULT 'BDT' NOT NULL,
	"merchant_reference" text NOT NULL,
	"short_code" text,
	"methods" text[],
	"gateway_payment_id" text,
	"gateway_trx_id" text,
	"status" text DEFAULT 'created' NOT NULL,
	"review_reason" text,
	"verified_amount_poisha" bigint,
	"refunded_poisha" bigint DEFAULT 0 NOT NULL,
	"reserved_refund_poisha" bigint DEFAULT 0 NOT NULL,
	"card_masked" text,
	"failure_reason" text,
	"is_sandbox" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"voided_at" timestamp with time zone,
	"succeeded_at" timestamp with time zone,
	"verified_by_user_id" uuid,
	"next_check_at" timestamp with time zone,
	"check_count" smallint DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_intents_flow" CHECK ("payment_intents"."flow" in ('billing', 'shop')),
	CONSTRAINT "payment_intents_purpose" CHECK ("payment_intents"."purpose" in ('order_advance', 'order_full', 'subscription', 'whatsapp_top_up', 'sms_pack', 'ai_top_up')),
	CONSTRAINT "payment_intents_gateway" CHECK ("payment_intents"."gateway" in ('bkash', 'nagad', 'city_bank', 'manual')),
	CONSTRAINT "payment_intents_status" CHECK ("payment_intents"."status" in ('created', 'pending', 'succeeded', 'failed', 'cancelled', 'expired', 'needs_review', 'partially_refunded', 'refunded', 'disputed')),
	CONSTRAINT "payment_intents_review_reason" CHECK ("payment_intents"."review_reason" in ('amount_mismatch', 'duplicate', 'late_success', 'manual_unverified')),
	CONSTRAINT "payment_intents_currency" CHECK ("payment_intents"."currency" = 'BDT'),
	CONSTRAINT "payment_intents_amount" CHECK ("payment_intents"."amount_poisha" > 0),
	CONSTRAINT "payment_intents_refunded" CHECK ("payment_intents"."refunded_poisha" >= 0 and "payment_intents"."reserved_refund_poisha" >= 0
        and "payment_intents"."refunded_poisha" + "payment_intents"."reserved_refund_poisha" <= coalesce("payment_intents"."verified_amount_poisha", 0)),
	CONSTRAINT "payment_intents_flow_credentials" CHECK (("payment_intents"."flow" = 'billing' and "payment_intents"."credential_id" is null and "payment_intents"."gateway" <> 'manual' and "payment_intents"."order_id" is null)
       or ("payment_intents"."flow" = 'shop' and ("payment_intents"."gateway" = 'manual') = ("payment_intents"."credential_id" is null) and "payment_intents"."invoice_id" is null)),
	CONSTRAINT "payment_intents_flow_purpose" CHECK (("payment_intents"."flow" = 'shop') = ("payment_intents"."purpose" in ('order_advance', 'order_full')))
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"payment_intent_id" uuid NOT NULL,
	"amount_poisha" bigint NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"gateway_refund_id" text,
	"idempotency_key" text NOT NULL,
	"is_approved_with_two_factor" boolean DEFAULT false NOT NULL,
	"requested_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_status" CHECK ("refunds"."status" in ('requested', 'pending', 'succeeded', 'failed', 'recorded_manually')),
	CONSTRAINT "refunds_amount" CHECK ("refunds"."amount_poisha" > 0)
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
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"title" text NOT NULL,
	"option_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sku" text,
	"price_poisha" bigint,
	"cost_poisha" bigint,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"external_source" text,
	"external_account" text,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_external_identity" CHECK (("product_variants"."external_ref" is null and "product_variants"."external_source" is null and "product_variants"."external_account" is null)
        or ("product_variants"."external_ref" is not null and "product_variants"."external_source" is not null and "product_variants"."external_account" is not null)),
	CONSTRAINT "product_variants_status" CHECK ("product_variants"."status" in ('active', 'hidden', 'archived')),
	CONSTRAINT "product_variants_reserved" CHECK ("product_variants"."reserved" >= 0),
	CONSTRAINT "product_variants_money" CHECK (coalesce("product_variants"."price_poisha", 0) >= 0 and coalesce("product_variants"."cost_poisha", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"price_poisha" bigint DEFAULT 0 NOT NULL,
	"compare_at_price_poisha" bigint,
	"image_file_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_stock_tracked" boolean DEFAULT true NOT NULL,
	"is_visible_in_chats" boolean DEFAULT true NOT NULL,
	"is_visible_in_order_link" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"ask_count" integer DEFAULT 0 NOT NULL,
	"search_embedding" vector(512),
	"image_embedding" vector(512),
	"embedding_model" text,
	"search_text_hash" text,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_status" CHECK ("products"."status" in ('active', 'hidden', 'archived')),
	CONSTRAINT "products_price" CHECK ("products"."price_poisha" >= 0 and coalesce("products"."compare_at_price_poisha", 0) >= 0),
	CONSTRAINT "products_name_length" CHECK (char_length("products"."name") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "restock_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"conversation_id" uuid,
	"status" text DEFAULT 'waiting' NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restock_requests_status" CHECK ("restock_requests"."status" in ('waiting', 'notified', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer NOT NULL,
	"on_hand_after" integer NOT NULL,
	"reserved_after" integer NOT NULL,
	"order_id" uuid,
	"reason" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_kind" CHECK ("stock_movements"."kind" in ('reserve', 'release', 'ship', 'return', 'adjust', 'import')),
	CONSTRAINT "stock_movements_quantity" CHECK ("stock_movements"."quantity" <> 0)
);
--> statement-breakpoint
CREATE TABLE "brand_profiles" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"voice" text,
	"audience" text,
	"preferred_words" text[] DEFAULT '{}'::text[] NOT NULL,
	"call_to_action_bn" text,
	"call_to_action_en" text,
	"tone" text,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"words_to_avoid" text[] DEFAULT '{}'::text[] NOT NULL,
	"hashtags" text[] DEFAULT '{}'::text[] NOT NULL,
	"allows_emoji" boolean DEFAULT false NOT NULL,
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
CREATE TABLE "store_counters" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"next_order_number" integer DEFAULT 1001 NOT NULL,
	CONSTRAINT "store_counters_next_order_number" CHECK ("store_counters"."next_order_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"contact_id" uuid,
	"conversation_id" uuid,
	"order_id" uuid,
	"assignee_user_id" uuid,
	"created_by_user_id" uuid,
	"due_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_source" CHECK ("tasks"."source" in ('manual', 'automation', 'ai')),
	CONSTRAINT "tasks_status" CHECK ("tasks"."status" in ('open', 'done', 'cancelled'))
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
CREATE UNIQUE INDEX "staff_sessions_token_hash_key" ON "staff_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_users_email_key" ON "staff_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_rule_changes_store_id_id_key" ON "ai_rule_changes" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_rule_changes_undoes_change_id_key" ON "ai_rule_changes" USING btree ("undoes_change_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_items_store_id_id_key" ON "knowledge_items" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_key" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_subject_key" ON "users" USING btree ("google_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_run_steps_run_step_key" ON "automation_run_steps" USING btree ("run_id","step_key");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_store_id_id_key" ON "automation_runs" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_trigger_key" ON "automation_runs" USING btree ("automation_id","contact_id","trigger_key");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_versions_store_id_id_key" ON "automation_versions" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_versions_automation_version_key" ON "automation_versions" USING btree ("automation_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "automations_store_id_id_key" ON "automations" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_store_id_id_key" ON "invoices" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_code_key" ON "plans" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_store_id_key" ON "subscriptions" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_events_reference_key" ON "usage_events" USING btree ("store_id","unit","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_ledger_store_id_idempotency_key_key" ON "wallet_ledger" USING btree ("store_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_ledger_store_id_wallet_revision_key" ON "wallet_ledger" USING btree ("store_id","wallet","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_recipients_campaign_contact_key" ON "campaign_recipients" USING btree ("campaign_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_store_id_id_key" ON "campaigns" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_link_visits_store_event_key" ON "tracked_link_visits" USING btree ("store_id","event_key","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_links_store_id_id_key" ON "tracked_links" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_links_code_key" ON "tracked_links" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_templates_store_id_id_key" ON "whatsapp_templates" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_templates_name_key" ON "whatsapp_templates" USING btree ("channel_connection_id","name","language");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_connections_store_id_id_key" ON "channel_connections" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_connections_account_key" ON "channel_connections" USING btree ("kind","external_account_id") WHERE "channel_connections"."status" <> 'disconnected';--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_store_id_id_key" ON "conversations" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_connection_contact_key" ON "conversations" USING btree ("channel_connection_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_conversation_external_id_key" ON "messages" USING btree ("conversation_id","external_id") WHERE "messages"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_store_id_idempotency_key_key" ON "messages" USING btree ("store_id","idempotency_key") WHERE "messages"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_replies_store_id_shortcut_key" ON "saved_replies" USING btree ("store_id","shortcut") WHERE "saved_replies"."shortcut" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "social_comments_connection_comment_key" ON "social_comments" USING btree ("channel_connection_id","external_comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_identities_store_id_id_key" ON "contact_identities" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_identities_connection_external_id_key" ON "contact_identities" USING btree ("channel_connection_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_match_suggestions_open_key" ON "contact_match_suggestions" USING btree ("store_id","contact_id","matched_contact_id","reason") WHERE "contact_match_suggestions"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "contact_merges_store_id_operation_key_key" ON "contact_merges" USING btree ("store_id","operation_key");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_merges_merged_contact_id_key" ON "contact_merges" USING btree ("merged_contact_id") WHERE "contact_merges"."undone_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_store_id_id_key" ON "contacts" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_store_id_phone_key" ON "contacts" USING btree ("store_id","phone") WHERE "contacts"."phone" is not null and "contacts"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_store_id_external_ref_key" ON "contacts" USING btree ("store_id","external_ref") WHERE "contacts"."external_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "segments_store_id_name_key" ON "segments" USING btree ("store_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "segments_store_id_ready_made_key_key" ON "segments" USING btree ("store_id","ready_made_key") WHERE "segments"."ready_made_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_zones_store_id_id_key" ON "delivery_zones" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_zones_one_default_key" ON "delivery_zones" USING btree ("store_id") WHERE "delivery_zones"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "orders_store_id_id_key" ON "orders" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_store_id_number_key" ON "orders" USING btree ("store_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_store_id_idempotency_key_key" ON "orders" USING btree ("store_id","idempotency_key") WHERE "orders"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_store_id_external_ref_key" ON "orders" USING btree ("store_id","external_ref") WHERE "orders"."external_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_gateway_credentials_store_id_id_key" ON "payment_gateway_credentials" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_gateway_credentials_active_key" ON "payment_gateway_credentials" USING btree ("store_id","gateway","mode") WHERE "payment_gateway_credentials"."status" <> 'disconnected';--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_store_id_id_key" ON "payment_intents" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_merchant_reference_key" ON "payment_intents" USING btree ("merchant_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_short_code_key" ON "payment_intents" USING btree ("short_code");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_gateway_trx_id_key" ON "payment_intents" USING btree ("gateway","gateway_trx_id") WHERE "payment_intents"."gateway_trx_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_store_id_idempotency_key_key" ON "refunds" USING btree ("store_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "files_store_id_id_key" ON "files" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "files_object_key_key" ON "files" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_store_id_user_id_dedupe_key_key" ON "notifications" USING btree ("store_id","user_id","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_external_id_key" ON "webhook_events" USING btree ("provider","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_store_id_id_key" ON "product_variants" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_store_id_sku_key" ON "product_variants" USING btree ("store_id","sku") WHERE "product_variants"."sku" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_external_identity_key" ON "product_variants" USING btree ("store_id","external_source","external_account","external_ref") WHERE "product_variants"."external_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_one_default_key" ON "product_variants" USING btree ("product_id") WHERE "product_variants"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "products_store_id_id_key" ON "products" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_store_id_external_ref_key" ON "products" USING btree ("store_id","external_ref") WHERE "products"."external_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "restock_requests_waiting_key" ON "restock_requests" USING btree ("variant_id","contact_id") WHERE "restock_requests"."status" = 'waiting';--> statement-breakpoint
CREATE UNIQUE INDEX "post_targets_store_id_id_key" ON "post_targets" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_targets_slot_key" ON "post_targets" USING btree ("channel_connection_id","scheduled_for") WHERE "post_targets"."status" in ('scheduled', 'publishing');--> statement-breakpoint
CREATE UNIQUE INDEX "post_targets_external_post_id_key" ON "post_targets" USING btree ("channel_connection_id","external_post_id") WHERE "post_targets"."external_post_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "post_targets_post_connection_key" ON "post_targets" USING btree ("post_id","channel_connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_store_id_id_key" ON "posts" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_store_id_user_id_key" ON "memberships" USING btree ("store_id","user_id") WHERE "memberships"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_one_owner_key" ON "memberships" USING btree ("store_id") WHERE "memberships"."built_in_role" = 'owner' and "memberships"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_invite_token_hash_key" ON "memberships" USING btree ("invite_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_store_id_id_key" ON "roles" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_store_id_name_key" ON "roles" USING btree ("store_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "stores_slug_key" ON "stores" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_staff_id_staff_users_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_audit_log" ADD CONSTRAINT "staff_audit_log_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_grants" ADD CONSTRAINT "support_grants_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_grants" ADD CONSTRAINT "support_grants_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_grants" ADD CONSTRAINT "support_grants_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "store_daily_metrics" ADD CONSTRAINT "store_daily_metrics_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bd_areas" ADD CONSTRAINT "bd_areas_parent_id_bd_areas_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."bd_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_store_id_stores_id_fk" FOREIGN KEY ("active_store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run_steps" ADD CONSTRAINT "automation_run_steps_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run_steps" ADD CONSTRAINT "automation_run_steps_run_id_automation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."automation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run_steps" ADD CONSTRAINT "automation_run_steps_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run_steps" ADD CONSTRAINT "automation_run_steps_run_id_store_fk" FOREIGN KEY ("store_id","run_id") REFERENCES "public"."automation_runs"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run_steps" ADD CONSTRAINT "automation_run_steps_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_version_id_automation_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."automation_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_store_fk" FOREIGN KEY ("store_id","automation_id") REFERENCES "public"."automations"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_version_id_store_fk" FOREIGN KEY ("store_id","version_id") REFERENCES "public"."automation_versions"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_versions" ADD CONSTRAINT "automation_versions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_versions" ADD CONSTRAINT "automation_versions_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_versions" ADD CONSTRAINT "automation_versions_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_versions" ADD CONSTRAINT "automation_versions_automation_id_store_fk" FOREIGN KEY ("store_id","automation_id") REFERENCES "public"."automations"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_published_version_id_automation_versions_id_fk" FOREIGN KEY ("published_version_id") REFERENCES "public"."automation_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_published_version_id_store_fk" FOREIGN KEY ("store_id","published_version_id") REFERENCES "public"."automation_versions"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_created_by_staff_id_staff_users_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credits_invoice_id_invoices_id_fk" FOREIGN KEY ("credits_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credits_invoice_id_store_fk" FOREIGN KEY ("store_id","credits_invoice_id") REFERENCES "public"."invoices"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pending_plan_id_plans_id_fk" FOREIGN KEY ("pending_plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_actor_staff_id_staff_users_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contact_identity_id_contact_identities_id_fk" FOREIGN KEY ("contact_identity_id") REFERENCES "public"."contact_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_store_fk" FOREIGN KEY ("store_id","campaign_id") REFERENCES "public"."campaigns"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contact_identity_id_store_fk" FOREIGN KEY ("store_id","contact_identity_id") REFERENCES "public"."contact_identities"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_channel_connection_id_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_whatsapp_template_id_whatsapp_templates_id_fk" FOREIGN KEY ("whatsapp_template_id") REFERENCES "public"."whatsapp_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_channel_connection_id_store_fk" FOREIGN KEY ("store_id","channel_connection_id") REFERENCES "public"."channel_connections"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_whatsapp_template_id_store_fk" FOREIGN KEY ("store_id","whatsapp_template_id") REFERENCES "public"."whatsapp_templates"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_link_visit_days" ADD CONSTRAINT "tracked_link_visit_days_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_link_visit_days" ADD CONSTRAINT "tracked_link_visit_days_tracked_link_id_tracked_links_id_fk" FOREIGN KEY ("tracked_link_id") REFERENCES "public"."tracked_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_link_visit_days" ADD CONSTRAINT "tracked_link_visit_days_tracked_link_id_store_fk" FOREIGN KEY ("store_id","tracked_link_id") REFERENCES "public"."tracked_links"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_link_visits" ADD CONSTRAINT "tracked_link_visits_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_link_visits" ADD CONSTRAINT "tracked_link_visits_tracked_link_id_tracked_links_id_fk" FOREIGN KEY ("tracked_link_id") REFERENCES "public"."tracked_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_link_visits" ADD CONSTRAINT "tracked_link_visits_tracked_link_id_store_fk" FOREIGN KEY ("store_id","tracked_link_id") REFERENCES "public"."tracked_links"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_channel_connection_id_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_channel_connection_id_store_fk" FOREIGN KEY ("store_id","channel_connection_id") REFERENCES "public"."channel_connections"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_sender_ids" ADD CONSTRAINT "sms_sender_ids_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_sender_ids" ADD CONSTRAINT "sms_sender_ids_trade_licence_file_id_files_id_fk" FOREIGN KEY ("trade_licence_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_sender_ids" ADD CONSTRAINT "sms_sender_ids_nid_file_id_files_id_fk" FOREIGN KEY ("nid_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_sender_ids" ADD CONSTRAINT "sms_sender_ids_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_sender_ids" ADD CONSTRAINT "sms_sender_ids_trade_licence_file_id_store_fk" FOREIGN KEY ("store_id","trade_licence_file_id") REFERENCES "public"."files"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_sender_ids" ADD CONSTRAINT "sms_sender_ids_nid_file_id_store_fk" FOREIGN KEY ("store_id","nid_file_id") REFERENCES "public"."files"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_channel_connection_id_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_post_target_id_post_targets_id_fk" FOREIGN KEY ("post_target_id") REFERENCES "public"."post_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_channel_connection_id_store_fk" FOREIGN KEY ("store_id","channel_connection_id") REFERENCES "public"."channel_connections"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_post_target_id_store_fk" FOREIGN KEY ("store_id","post_target_id") REFERENCES "public"."post_targets"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_conversation_id_store_fk" FOREIGN KEY ("store_id","conversation_id") REFERENCES "public"."conversations"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_memories" ADD CONSTRAINT "contact_memories_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_memories" ADD CONSTRAINT "contact_memories_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_memories" ADD CONSTRAINT "contact_memories_edited_by_user_id_users_id_fk" FOREIGN KEY ("edited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_memories" ADD CONSTRAINT "contact_memories_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "imports" ADD CONSTRAINT "imports_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_report_file_id_files_id_fk" FOREIGN KEY ("report_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_file_id_store_fk" FOREIGN KEY ("store_id","file_id") REFERENCES "public"."files"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_report_file_id_store_fk" FOREIGN KEY ("store_id","report_file_id") REFERENCES "public"."files"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_store_fk" FOREIGN KEY ("store_id","order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_store_fk" FOREIGN KEY ("store_id","variant_id") REFERENCES "public"."product_variants"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_recipient_bd_area_id_bd_areas_id_fk" FOREIGN KEY ("recipient_bd_area_id") REFERENCES "public"."bd_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_zone_id_delivery_zones_id_fk" FOREIGN KEY ("delivery_zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipped_by_user_id_users_id_fk" FOREIGN KEY ("shipped_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_possible_duplicate_of_order_id_orders_id_fk" FOREIGN KEY ("possible_duplicate_of_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversation_id_store_fk" FOREIGN KEY ("store_id","conversation_id") REFERENCES "public"."conversations"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_zone_id_store_fk" FOREIGN KEY ("store_id","delivery_zone_id") REFERENCES "public"."delivery_zones"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_possible_duplicate_of_order_id_store_fk" FOREIGN KEY ("store_id","possible_duplicate_of_order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_intent_id_store_fk" FOREIGN KEY ("store_id","payment_intent_id") REFERENCES "public"."payment_intents"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_gateway_credentials" ADD CONSTRAINT "payment_gateway_credentials_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_gateway_credentials" ADD CONSTRAINT "payment_gateway_credentials_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_credential_id_payment_gateway_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."payment_gateway_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_credential_id_store_fk" FOREIGN KEY ("store_id","credential_id") REFERENCES "public"."payment_gateway_credentials"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_order_id_store_fk" FOREIGN KEY ("store_id","order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_invoice_id_store_fk" FOREIGN KEY ("store_id","invoice_id") REFERENCES "public"."invoices"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_intent_id_store_fk" FOREIGN KEY ("store_id","payment_intent_id") REFERENCES "public"."payment_intents"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_staff_id_staff_users_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_store_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_variant_id_store_fk" FOREIGN KEY ("store_id","variant_id") REFERENCES "public"."product_variants"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_conversation_id_store_fk" FOREIGN KEY ("store_id","conversation_id") REFERENCES "public"."conversations"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_store_fk" FOREIGN KEY ("store_id","variant_id") REFERENCES "public"."product_variants"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "store_counters" ADD CONSTRAINT "store_counters_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_conversation_id_store_fk" FOREIGN KEY ("store_id","conversation_id") REFERENCES "public"."conversations"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_order_id_store_fk" FOREIGN KEY ("store_id","order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_id_store_fk" FOREIGN KEY ("store_id","role_id") REFERENCES "public"."roles"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_settings_updated_by_staff_id_idx" ON "platform_settings" USING btree ("updated_by_staff_id");--> statement-breakpoint
CREATE INDEX "staff_audit_log_staff_user_id_created_at_idx" ON "staff_audit_log" USING btree ("staff_user_id","created_at");--> statement-breakpoint
CREATE INDEX "staff_audit_log_store_id_created_at_idx" ON "staff_audit_log" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "staff_sessions_staff_user_id_idx" ON "staff_sessions" USING btree ("staff_user_id");--> statement-breakpoint
CREATE INDEX "support_grants_store_id_status_idx" ON "support_grants" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "support_grants_staff_user_id_status_idx" ON "support_grants" USING btree ("staff_user_id","status");--> statement-breakpoint
CREATE INDEX "support_grants_approved_by_user_id_idx" ON "support_grants" USING btree ("approved_by_user_id");--> statement-breakpoint
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
CREATE INDEX "bd_areas_parent_id_idx" ON "bd_areas" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_active_store_id_idx" ON "sessions" USING btree ("active_store_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "automation_run_steps_store_contact_idx" ON "automation_run_steps" USING btree ("store_id","contact_id","sent_at");--> statement-breakpoint
CREATE INDEX "automation_run_steps_provider_message_idx" ON "automation_run_steps" USING btree ("provider_message_id") WHERE "automation_run_steps"."provider_message_id" is not null;--> statement-breakpoint
CREATE INDEX "automation_run_steps_contact_id_idx" ON "automation_run_steps" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "automation_run_steps_created_at_idx" ON "automation_run_steps" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "automation_runs_due_idx" ON "automation_runs" USING btree ("wake_at") WHERE "automation_runs"."status" = 'waiting';--> statement-breakpoint
CREATE INDEX "automation_runs_stale_claim_idx" ON "automation_runs" USING btree ("claimed_at") WHERE "automation_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "automation_runs_store_automation_idx" ON "automation_runs" USING btree ("store_id","automation_id","status");--> statement-breakpoint
CREATE INDEX "automation_runs_store_contact_idx" ON "automation_runs" USING btree ("store_id","contact_id");--> statement-breakpoint
CREATE INDEX "automation_runs_version_id_idx" ON "automation_runs" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "automation_runs_contact_id_idx" ON "automation_runs" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "automation_versions_store_id_idx" ON "automation_versions" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "automation_versions_published_by_user_id_idx" ON "automation_versions" USING btree ("published_by_user_id");--> statement-breakpoint
CREATE INDEX "automations_store_id_trigger_idx" ON "automations" USING btree ("store_id","trigger_type","status");--> statement-breakpoint
CREATE INDEX "automations_published_version_id_idx" ON "automations" USING btree ("published_version_id");--> statement-breakpoint
CREATE INDEX "automations_created_by_user_id_idx" ON "automations" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "coupons_created_by_staff_id_idx" ON "coupons" USING btree ("created_by_staff_id");--> statement-breakpoint
CREATE INDEX "invoices_store_id_issued_at_idx" ON "invoices" USING btree ("store_id","issued_at");--> statement-breakpoint
CREATE INDEX "invoices_credits_invoice_id_idx" ON "invoices" USING btree ("credits_invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_coupon_id_idx" ON "invoices" USING btree ("coupon_id");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "subscriptions_pending_plan_id_idx" ON "subscriptions" USING btree ("pending_plan_id");--> statement-breakpoint
CREATE INDEX "subscriptions_renewal_due_idx" ON "subscriptions" USING btree ("next_renewal_attempt_at") WHERE "subscriptions"."next_renewal_attempt_at" is not null;--> statement-breakpoint
CREATE INDEX "subscriptions_trial_ends_at_idx" ON "subscriptions" USING btree ("trial_ends_at") WHERE "subscriptions"."status" = 'trialing';--> statement-breakpoint
CREATE INDEX "usage_events_period_idx" ON "usage_events" USING btree ("store_id","unit","period_start");--> statement-breakpoint
CREATE INDEX "wallet_ledger_actor_user_id_idx" ON "wallet_ledger" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "wallet_ledger_actor_staff_id_idx" ON "wallet_ledger" USING btree ("actor_staff_id");--> statement-breakpoint
CREATE INDEX "campaign_recipients_campaign_status_idx" ON "campaign_recipients" USING btree ("campaign_id","status","id");--> statement-breakpoint
CREATE INDEX "campaign_recipients_store_contact_idx" ON "campaign_recipients" USING btree ("store_id","contact_id","sent_at");--> statement-breakpoint
CREATE INDEX "campaign_recipients_provider_message_idx" ON "campaign_recipients" USING btree ("provider_message_id") WHERE "campaign_recipients"."provider_message_id" is not null;--> statement-breakpoint
CREATE INDEX "campaign_recipients_contact_identity_id_idx" ON "campaign_recipients" USING btree ("contact_identity_id");--> statement-breakpoint
CREATE INDEX "campaign_recipients_contact_id_idx" ON "campaign_recipients" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "campaigns_store_id_status_idx" ON "campaigns" USING btree ("store_id","status","created_at");--> statement-breakpoint
CREATE INDEX "campaigns_due_idx" ON "campaigns" USING btree ("scheduled_for") WHERE "campaigns"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "campaigns_channel_connection_id_idx" ON "campaigns" USING btree ("channel_connection_id");--> statement-breakpoint
CREATE INDEX "campaigns_whatsapp_template_id_idx" ON "campaigns" USING btree ("whatsapp_template_id");--> statement-breakpoint
CREATE INDEX "campaigns_approved_by_user_id_idx" ON "campaigns" USING btree ("approved_by_user_id");--> statement-breakpoint
CREATE INDEX "campaigns_created_by_user_id_idx" ON "campaigns" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "tracked_link_visit_days_store_id_day_idx" ON "tracked_link_visit_days" USING btree ("store_id","day");--> statement-breakpoint
CREATE INDEX "tracked_link_visits_link_occurred_idx" ON "tracked_link_visits" USING btree ("tracked_link_id","occurred_at");--> statement-breakpoint
CREATE INDEX "tracked_links_source_idx" ON "tracked_links" USING btree ("store_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "tracked_links_store_contact_idx" ON "tracked_links" USING btree ("store_id","contact_id","last_tapped_at");--> statement-breakpoint
CREATE INDEX "tracked_links_contact_id_idx" ON "tracked_links" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "whatsapp_templates_store_id_status_idx" ON "whatsapp_templates" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "channel_connections_store_id_idx" ON "channel_connections" USING btree ("store_id","kind");--> statement-breakpoint
CREATE INDEX "channel_connections_token_expires_at_idx" ON "channel_connections" USING btree ("token_expires_at") WHERE "channel_connections"."status" = 'active';--> statement-breakpoint
CREATE INDEX "channel_connections_connected_by_user_id_idx" ON "channel_connections" USING btree ("connected_by_user_id");--> statement-breakpoint
CREATE INDEX "sms_sender_ids_store_id_idx" ON "sms_sender_ids" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "sms_sender_ids_status_idx" ON "sms_sender_ids" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sms_sender_ids_trade_licence_file_id_idx" ON "sms_sender_ids" USING btree ("trade_licence_file_id");--> statement-breakpoint
CREATE INDEX "sms_sender_ids_nid_file_id_idx" ON "sms_sender_ids" USING btree ("nid_file_id");--> statement-breakpoint
CREATE INDEX "sms_sender_ids_requested_by_user_id_idx" ON "sms_sender_ids" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "conversations_store_id_status_idx" ON "conversations" USING btree ("store_id","status","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_store_id_assignee_idx" ON "conversations" USING btree ("store_id","assignee_user_id","status");--> statement-breakpoint
CREATE INDEX "conversations_store_id_window_idx" ON "conversations" USING btree ("store_id","channel","last_inbound_at");--> statement-breakpoint
CREATE INDEX "conversations_contact_id_idx" ON "conversations" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "conversations_assignee_user_id_idx" ON "conversations" USING btree ("assignee_user_id");--> statement-breakpoint
CREATE INDEX "conversations_responder_returns_at_idx" ON "conversations" USING btree ("responder_returns_at") WHERE "conversations"."responder_returns_at" is not null;--> statement-breakpoint
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_store_id_created_at_idx" ON "messages" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_store_id_external_id_idx" ON "messages" USING btree ("store_id","external_id") WHERE "messages"."direction" = 'out' and "messages"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_store_id_rated_idx" ON "messages" USING btree ("store_id","rated_at") WHERE "messages"."ai_rating" is not null;--> statement-breakpoint
CREATE INDEX "messages_author_user_id_idx" ON "messages" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "messages_rated_by_user_id_idx" ON "messages" USING btree ("rated_by_user_id");--> statement-breakpoint
CREATE INDEX "saved_replies_store_id_idx" ON "saved_replies" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "saved_replies_created_by_user_id_idx" ON "saved_replies" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "social_comments_store_id_post_idx" ON "social_comments" USING btree ("store_id","external_post_id","commented_at");--> statement-breakpoint
CREATE INDEX "social_comments_store_id_status_idx" ON "social_comments" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "social_comments_post_target_id_idx" ON "social_comments" USING btree ("post_target_id");--> statement-breakpoint
CREATE INDEX "social_comments_contact_id_idx" ON "social_comments" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "social_comments_conversation_id_idx" ON "social_comments" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "contact_memories_store_id_idx" ON "contact_memories" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "contact_memories_edited_by_user_id_idx" ON "contact_memories" USING btree ("edited_by_user_id");--> statement-breakpoint
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
CREATE INDEX "imports_store_id_created_at_idx" ON "imports" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "imports_file_id_idx" ON "imports" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "imports_report_file_id_idx" ON "imports" USING btree ("report_file_id");--> statement-breakpoint
CREATE INDEX "imports_created_by_user_id_idx" ON "imports" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "segments_created_by_user_id_idx" ON "segments" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "delivery_zones_store_id_idx" ON "delivery_zones" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "delivery_zones_bd_area_ids_idx" ON "delivery_zones" USING gin ("bd_area_ids");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_store_id_variant_idx" ON "order_items" USING btree ("store_id","variant_id");--> statement-breakpoint
CREATE INDEX "order_items_variant_id_idx" ON "order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "orders_store_id_stage_idx" ON "orders" USING btree ("store_id","stage","created_at");--> statement-breakpoint
CREATE INDEX "orders_store_id_created_at_idx" ON "orders" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_store_id_contact_idx" ON "orders" USING btree ("store_id","contact_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_store_id_recipient_phone_idx" ON "orders" USING btree ("store_id","recipient_phone","created_at");--> statement-breakpoint
CREATE INDEX "orders_store_id_recipient_phone_outcome_idx" ON "orders" USING btree ("store_id","recipient_phone") WHERE "orders"."stage" in ('delivered', 'partially_delivered', 'returned');--> statement-breakpoint
CREATE INDEX "orders_store_id_attribution_idx" ON "orders" USING btree ("store_id","attributed_source_type","attributed_source_id") WHERE "orders"."attributed_source_type" is not null;--> statement-breakpoint
CREATE INDEX "orders_store_id_follow_up_idx" ON "orders" USING btree ("store_id","follow_up_on") WHERE "orders"."stage" = 'on_hold';--> statement-breakpoint
CREATE INDEX "orders_contact_id_idx" ON "orders" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "orders_conversation_id_idx" ON "orders" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "orders_created_by_user_id_idx" ON "orders" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "orders_shipped_by_user_id_idx" ON "orders" USING btree ("shipped_by_user_id");--> statement-breakpoint
CREATE INDEX "orders_recipient_bd_area_id_idx" ON "orders" USING btree ("recipient_bd_area_id");--> statement-breakpoint
CREATE INDEX "orders_delivery_zone_id_idx" ON "orders" USING btree ("delivery_zone_id");--> statement-breakpoint
CREATE INDEX "orders_possible_duplicate_idx" ON "orders" USING btree ("possible_duplicate_of_order_id");--> statement-breakpoint
CREATE INDEX "payment_events_intent_idx" ON "payment_events" USING btree ("store_id","payment_intent_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_events_payment_intent_id_idx" ON "payment_events" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "payment_gateway_credentials_store_id_idx" ON "payment_gateway_credentials" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "payment_gateway_credentials_connected_by_user_id_idx" ON "payment_gateway_credentials" USING btree ("connected_by_user_id");--> statement-breakpoint
CREATE INDEX "payment_intents_store_id_order_id_idx" ON "payment_intents" USING btree ("store_id","order_id");--> statement-breakpoint
CREATE INDEX "payment_intents_store_id_created_at_idx" ON "payment_intents" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_intents_store_id_status_idx" ON "payment_intents" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "payment_intents_check_due_idx" ON "payment_intents" USING btree ("next_check_at") WHERE "payment_intents"."next_check_at" is not null;--> statement-breakpoint
CREATE INDEX "payment_intents_order_id_idx" ON "payment_intents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_intents_invoice_id_idx" ON "payment_intents" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payment_intents_credential_id_idx" ON "payment_intents" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "payment_intents_verified_by_user_id_idx" ON "payment_intents" USING btree ("verified_by_user_id");--> statement-breakpoint
CREATE INDEX "payment_intents_created_by_user_id_idx" ON "payment_intents" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_intent_id_idx" ON "refunds" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "refunds_requested_by_user_id_idx" ON "refunds" USING btree ("requested_by_user_id");--> statement-breakpoint
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
CREATE INDEX "product_variants_product_id_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_variants_store_id_idx" ON "product_variants" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "products_store_id_status_idx" ON "products" USING btree ("store_id","status","name");--> statement-breakpoint
CREATE INDEX "products_name_trgm_idx" ON "products" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_aliases_idx" ON "products" USING gin ("aliases");--> statement-breakpoint
CREATE INDEX "restock_requests_store_id_variant_idx" ON "restock_requests" USING btree ("store_id","variant_id","status");--> statement-breakpoint
CREATE INDEX "restock_requests_variant_id_idx" ON "restock_requests" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "restock_requests_contact_id_idx" ON "restock_requests" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "restock_requests_conversation_id_idx" ON "restock_requests" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "stock_movements_variant_idx" ON "stock_movements" USING btree ("store_id","variant_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_variant_id_idx" ON "stock_movements" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "stock_movements_store_id_order_id_idx" ON "stock_movements" USING btree ("store_id","order_id") WHERE "stock_movements"."order_id" is not null;--> statement-breakpoint
CREATE INDEX "stock_movements_actor_user_id_idx" ON "stock_movements" USING btree ("actor_user_id");--> statement-breakpoint
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
CREATE INDEX "tasks_store_id_status_due_idx" ON "tasks" USING btree ("store_id","status","due_at");--> statement-breakpoint
CREATE INDEX "tasks_store_id_assignee_idx" ON "tasks" USING btree ("store_id","assignee_user_id","status");--> statement-breakpoint
CREATE INDEX "tasks_contact_id_idx" ON "tasks" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "tasks_conversation_id_idx" ON "tasks" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "tasks_order_id_idx" ON "tasks" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee_user_id_idx" ON "tasks" USING btree ("assignee_user_id");--> statement-breakpoint
CREATE INDEX "tasks_created_by_user_id_idx" ON "tasks" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "memberships_store_id_status_idx" ON "memberships" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memberships_role_id_idx" ON "memberships" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "memberships_invited_by_user_id_idx" ON "memberships" USING btree ("invited_by_user_id");--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_name_length" CHECK (char_length("stores"."name") between 1 and 100);--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_slug_format" CHECK ("stores"."slug" ~ '^[a-z0-9][a-z0-9-]{2,39}$');--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_vat_bin_format" CHECK ("stores"."vat_bin" ~ '^[0-9]{13}$');--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_how_you_sell" CHECK ("stores"."how_you_sell" <@ array['social_media', 'online_store', 'shop_with_pos', 'shop_without_pos']::text[]);--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_customer_list_size" CHECK ("stores"."customer_list_size" in ('under_500', '500_to_2000', '2000_to_10000', 'over_10000'));--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_extensions" CHECK ("stores"."extensions" <@ array['chats', 'sales', 'social_auto_post', 'physical_shop']::text[]);--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_inactivity_days" CHECK ("stores"."inactivity_days" between 30 and 180);--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_attribution_window_days" CHECK ("stores"."attribution_window_days" in (1, 3, 7));--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_status" CHECK ("stores"."status" in ('active', 'suspended', 'closing'));--> statement-breakpoint

-- Everything below is written by hand (docs/rules/database.md, Migrations step 2).
-- See docs/data/isolation-and-access.md for why each piece exists.

-- Monthly partitions for the three append-only tables that grow fastest (docs/data/growth.md,
-- D31). Drizzle creates them as plain tables; this rebuilds each one, still empty, as a table
-- partitioned by its time column and puts back every key, foreign key and index by name.
CREATE FUNCTION pg_temp.partition_by_month(p_table text, p_column text) RETURNS void
  LANGUAGE plpgsql
AS $$
DECLARE
  definitions text[];
  definition text;
BEGIN
  SELECT array_agg(statement ORDER BY position) INTO definitions FROM (
    SELECT CASE c.contype WHEN 'p' THEN 1 ELSE 2 END AS position,
      format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', p_table, c.conname, pg_get_constraintdef(c.oid)) AS statement
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = ('public.' || p_table)::regclass AND c.contype IN ('p', 'u', 'f')
    UNION ALL
    SELECT 3, pg_get_indexdef(i.indexrelid)
    FROM pg_catalog.pg_index i
    WHERE i.indrelid = ('public.' || p_table)::regclass
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conindid = i.indexrelid)
  ) parts;
  EXECUTE format('ALTER TABLE public.%I RENAME TO %I', p_table, p_table || '_plain');
  EXECUTE format('CREATE TABLE public.%I (LIKE public.%I INCLUDING DEFAULTS INCLUDING CONSTRAINTS) PARTITION BY RANGE (%I)',
    p_table, p_table || '_plain', p_column);
  EXECUTE format('DROP TABLE public.%I', p_table || '_plain');
  FOREACH definition IN ARRAY definitions LOOP
    EXECUTE definition;
  END LOOP;
END
$$;--> statement-breakpoint
SELECT pg_temp.partition_by_month('audit_log', 'created_at');--> statement-breakpoint
SELECT pg_temp.partition_by_month('ai_runs', 'created_at');--> statement-breakpoint
SELECT pg_temp.partition_by_month('tracked_link_visits', 'occurred_at');--> statement-breakpoint
DROP FUNCTION pg_temp.partition_by_month(text, text);--> statement-breakpoint

-- Creates this month's partition and the next p_months_ahead, named like audit_log_y2026m11.
-- The app reaches rows only through the parent, so each partition gets RLS and no grants.
CREATE FUNCTION ensure_monthly_partitions(p_months_ahead integer) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  parent text;
  month_start timestamp;
  partition_name text;
  created integer := 0;
BEGIN
  FOREACH parent IN ARRAY ARRAY['audit_log', 'ai_runs', 'tracked_link_visits'] LOOP
    FOR step IN 0..greatest(0, least(coalesce(p_months_ahead, 3), 12)) LOOP
      month_start := date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => step);
      partition_name := parent || to_char(month_start, '"_y"YYYY"m"MM');
      CONTINUE WHEN to_regclass('public.' || partition_name) IS NOT NULL;
      EXECUTE format('CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
        partition_name, parent, month_start AT TIME ZONE 'UTC',
        (month_start + interval '1 month') AT TIME ZONE 'UTC');
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', partition_name);
      EXECUTE format('REVOKE ALL ON public.%I FROM dakly_app', partition_name);
      created := created + 1;
    END LOOP;
  END LOOP;
  RETURN created;
END
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION ensure_monthly_partitions(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION ensure_monthly_partitions(integer) TO dakly_app;--> statement-breakpoint
SELECT ensure_monthly_partitions(3);--> statement-breakpoint

-- Drops whole months past retention: AI runs after 13 months (their cost is already in
-- store_daily_metrics), link visits after 90 days (counts are in tracked_link_visit_days).
-- Audit log partitions are never dropped here: the archive job exports them to R2 first and
-- drops them as the owner, so the app role can never shorten the audit history.
CREATE FUNCTION drop_expired_partitions() RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  expired record;
  dropped integer := 0;
BEGIN
  FOR expired IN
    SELECT child.relname FROM pg_catalog.pg_inherits h
    JOIN pg_catalog.pg_class parent ON parent.oid = h.inhparent
    JOIN pg_catalog.pg_class child ON child.oid = h.inhrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = parent.relnamespace AND n.nspname = 'public'
    WHERE child.relname ~ '_y[0-9]{4}m[0-9]{2}$'
      AND ((parent.relname = 'ai_runs'
            AND to_date(right(child.relname, 7), 'YYYY"m"MM') + interval '1 month' <= now() AT TIME ZONE 'UTC' - interval '13 months')
        OR (parent.relname = 'tracked_link_visits'
            AND to_date(right(child.relname, 7), 'YYYY"m"MM') + interval '1 month' <= now() AT TIME ZONE 'UTC' - interval '90 days'))
  LOOP
    EXECUTE format('DROP TABLE public.%I', expired.relname);
    dropped := dropped + 1;
  END LOOP;
  RETURN dropped;
END
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION drop_expired_partitions() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION drop_expired_partitions() TO dakly_app;--> statement-breakpoint

-- Row level security on every shop table: a connection sees and writes only the rows of the
-- store set by TenantDatabase.forStore. No FORCE: migrations run as the table owner, which is
-- exempt, and the app connects as dakly_app, which does not own the tables.
ALTER TABLE "ai_agent_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_agent_settings_isolation" ON "ai_agent_settings"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "ai_rule_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_rule_changes_isolation" ON "ai_rule_changes"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "ai_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_runs_isolation" ON "ai_runs"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "assistant_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "assistant_messages_isolation" ON "assistant_messages"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_log_isolation" ON "audit_log"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "automation_run_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "automation_run_steps_isolation" ON "automation_run_steps"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "automation_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "automation_runs_isolation" ON "automation_runs"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "automation_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "automation_versions_isolation" ON "automation_versions"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "automations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "automations_isolation" ON "automations"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "brand_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "brand_profiles_isolation" ON "brand_profiles"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "campaign_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "campaign_recipients_isolation" ON "campaign_recipients"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "campaigns_isolation" ON "campaigns"
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
ALTER TABLE "content_pieces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "content_pieces_isolation" ON "content_pieces"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "conversations_isolation" ON "conversations"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "delivery_zones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "delivery_zones_isolation" ON "delivery_zones"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "files_isolation" ON "files"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "imports_isolation" ON "imports"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invoices_isolation" ON "invoices"
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
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "memberships_isolation" ON "memberships"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "messages_isolation" ON "messages"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notifications_isolation" ON "notifications"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "order_items_isolation" ON "order_items"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "orders_isolation" ON "orders"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "payment_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "payment_events_isolation" ON "payment_events"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "payment_gateway_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "payment_gateway_credentials_isolation" ON "payment_gateway_credentials"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "payment_intents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "payment_intents_isolation" ON "payment_intents"
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
ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "product_variants_isolation" ON "product_variants"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "products_isolation" ON "products"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "refunds_isolation" ON "refunds"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "restock_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "restock_requests_isolation" ON "restock_requests"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "roles_isolation" ON "roles"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "saved_replies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "saved_replies_isolation" ON "saved_replies"
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
ALTER TABLE "social_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "social_comments_isolation" ON "social_comments"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "stock_movements_isolation" ON "stock_movements"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "store_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "store_counters_isolation" ON "store_counters"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "store_daily_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "store_daily_metrics_isolation" ON "store_daily_metrics"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "subscriptions_isolation" ON "subscriptions"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "support_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "support_grants_isolation" ON "support_grants"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tasks_isolation" ON "tasks"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tracked_link_visit_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tracked_link_visit_days_isolation" ON "tracked_link_visit_days"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tracked_link_visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tracked_link_visits_isolation" ON "tracked_link_visits"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tracked_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tracked_links_isolation" ON "tracked_links"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "usage_events_isolation" ON "usage_events"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "wallet_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "wallet_ledger_isolation" ON "wallet_ledger"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "whatsapp_templates_isolation" ON "whatsapp_templates"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint

-- Sending reads consent only through this view. security_invoker makes the caller's RLS apply.
CREATE VIEW "contact_consent_current" WITH (security_invoker = true) AS
  SELECT DISTINCT ON ("contact_id", "channel")
    "store_id", "contact_id", "channel", "status", "source", "captured_at"
  FROM "consents"
  ORDER BY "contact_id", "channel", "captured_at" DESC, "id" DESC;--> statement-breakpoint

GRANT SELECT ON "contact_consent_current" TO dakly_app;--> statement-breakpoint


-- Append-only records: the app may add and read rows, never change or remove them. Retention
-- purges run in the maintenance job as the owner role (docs/data/indexes-and-scale.md).
REVOKE UPDATE, DELETE ON "audit_log", "staff_audit_log", "payment_events", "wallet_ledger", "stock_movements", "usage_events", "consents", "ai_rule_changes", "tracked_link_visits" FROM dakly_app;--> statement-breakpoint

REVOKE DELETE ON "invoices", "payment_intents", "refunds", "orders", "automation_versions", "tracked_link_visit_days" FROM dakly_app;--> statement-breakpoint

-- A version is frozen once saved; only the stop switch may change. An invoice may only be paid
-- or voided, never re-priced.
REVOKE UPDATE ON "automation_versions", "invoices" FROM dakly_app;--> statement-breakpoint
GRANT UPDATE ("is_stopped") ON "automation_versions" TO dakly_app;--> statement-breakpoint
GRANT UPDATE ("status", "paid_at") ON "invoices" TO dakly_app;--> statement-breakpoint

-- The outbox is global; the app may only insert. The relay claims rows through functions.
REVOKE SELECT, UPDATE, DELETE ON "outbox_events" FROM dakly_app;--> statement-breakpoint

REVOKE DELETE ON "webhook_events" FROM dakly_app;--> statement-breakpoint


-- Entry points that start without a store (webhooks, public pages, callbacks, sign-in) and
-- sweeps over many stores. Each returns only ids; the caller then works inside forStore.
-- Every function fixes search_path, and only dakly_app may execute it (schema review must-fix 4).
CREATE FUNCTION store_id_for_channel_account(p_kind text, p_external_account_id text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id FROM channel_connections
  WHERE kind = p_kind AND external_account_id = p_external_account_id AND status <> 'disconnected'
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION store_id_for_channel_account(text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION store_id_for_channel_account(text, text) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION store_id_for_slug(p_slug text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT id FROM stores WHERE slug = p_slug AND status = 'active'
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION store_id_for_slug(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION store_id_for_slug(text) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION payment_intent_for_reference(p_reference text) RETURNS TABLE(store_id uuid, payment_intent_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM payment_intents
  WHERE merchant_reference = p_reference OR short_code = p_reference
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION payment_intent_for_reference(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION payment_intent_for_reference(text) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION tracked_link_for_code(p_code text) RETURNS TABLE(store_id uuid, tracked_link_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM tracked_links WHERE code = p_code
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION tracked_link_for_code(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION tracked_link_for_code(text) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION store_id_for_provider_message(p_provider_message_id text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id FROM campaign_recipients WHERE provider_message_id = p_provider_message_id
  UNION ALL
  SELECT store_id FROM automation_run_steps WHERE provider_message_id = p_provider_message_id
  LIMIT 1
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION store_id_for_provider_message(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION store_id_for_provider_message(text) TO dakly_app;--> statement-breakpoint
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
-- Reclaims a run whose worker died: a running lease older than 5 minutes is due again.
CREATE FUNCTION due_automation_runs(p_limit integer) RETURNS TABLE(store_id uuid, automation_run_id uuid, claimed_at timestamptz)
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH due AS (
    SELECT d.id FROM automation_runs d
    WHERE (d.status = 'waiting' AND d.wake_at <= now())
       OR (d.status = 'running' AND (d.claimed_at IS NULL OR d.claimed_at <= now() - interval '5 minutes'))
    ORDER BY coalesce(d.claimed_at, d.wake_at, d.entered_at), d.id
    LIMIT greatest(0, least(coalesce(p_limit, 100), 1000)) FOR UPDATE SKIP LOCKED
  )
  UPDATE automation_runs r SET status = 'running', claimed_at = date_trunc('milliseconds', clock_timestamp()),
    attempts = least(r.attempts::integer + 1, 32767), updated_at = now()
  FROM due WHERE r.id = due.id RETURNING r.store_id, r.id, r.claimed_at
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION due_automation_runs(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION due_automation_runs(integer) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION due_campaigns(p_as_of timestamptz) RETURNS TABLE(store_id uuid, campaign_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM campaigns WHERE status = 'scheduled' AND scheduled_for <= p_as_of
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION due_campaigns(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION due_campaigns(timestamptz) TO dakly_app;--> statement-breakpoint
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
CREATE FUNCTION due_payment_checks(p_limit integer) RETURNS TABLE(store_id uuid, payment_intent_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM payment_intents WHERE next_check_at <= now() ORDER BY next_check_at LIMIT p_limit
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION due_payment_checks(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION due_payment_checks(integer) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION due_subscription_renewals(p_as_of timestamptz) RETURNS TABLE(store_id uuid, subscription_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM subscriptions WHERE next_renewal_attempt_at <= p_as_of
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION due_subscription_renewals(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION due_subscription_renewals(timestamptz) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION trials_ending_before(p_before timestamptz) RETURNS TABLE(store_id uuid, subscription_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM subscriptions WHERE status = 'trialing' AND trial_ends_at <= p_before
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION trials_ending_before(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION trials_ending_before(timestamptz) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION channel_connections_expiring_before(p_before timestamptz) RETURNS TABLE(store_id uuid, channel_connection_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM channel_connections WHERE status = 'active' AND token_expires_at <= p_before
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION channel_connections_expiring_before(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION channel_connections_expiring_before(timestamptz) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION due_conversation_returns(p_limit integer) RETURNS TABLE(store_id uuid, conversation_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM conversations WHERE responder_returns_at <= now() ORDER BY responder_returns_at LIMIT p_limit
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION due_conversation_returns(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION due_conversation_returns(integer) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION due_contact_purges(p_limit integer) RETURNS TABLE(store_id uuid, contact_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT store_id, id FROM contacts WHERE deleted_at < now() - interval '30 days' ORDER BY deleted_at LIMIT p_limit
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION due_contact_purges(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION due_contact_purges(integer) TO dakly_app;--> statement-breakpoint
CREATE FUNCTION active_store_ids() RETURNS TABLE(store_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT id FROM stores WHERE status = 'active' ORDER BY id
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION active_store_ids() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION active_store_ids() TO dakly_app;--> statement-breakpoint
CREATE FUNCTION admin_store_overview(p_search text, p_limit integer) RETURNS TABLE(store_id uuid, name text, slug text, status text, plan_code text, subscription_status text, members integer, created_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  -- Shop metadata only: no customer, message or secret data crosses stores here.
  SELECT s.id, s.name, s.slug, s.status, p.code, sub.status,
    (SELECT count(*)::integer FROM memberships m WHERE m.store_id = s.id AND m.status = 'active'),
    s.created_at
  FROM stores s
  LEFT JOIN subscriptions sub ON sub.store_id = s.id
  LEFT JOIN plans p ON p.id = sub.plan_id
  WHERE p_search IS NULL OR s.name ILIKE '%' || p_search || '%' OR s.slug = p_search
  ORDER BY s.created_at DESC
  LIMIT p_limit
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION admin_store_overview(text, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION admin_store_overview(text, integer) TO dakly_app;--> statement-breakpoint

-- Drizzle does not model deferrability. Contact purges defer these same-store checks until
-- the SET NULL and CASCADE actions have run; normal writes still check immediately.
ALTER TABLE "contact_merges" ALTER CONSTRAINT "contact_merges_kept_contact_id_store_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "contact_merges" ALTER CONSTRAINT "contact_merges_merged_contact_id_store_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "orders" ALTER CONSTRAINT "orders_contact_id_store_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "orders" ALTER CONSTRAINT "orders_conversation_id_store_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "restock_requests" ALTER CONSTRAINT "restock_requests_conversation_id_store_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint

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
  (804, 'district', 8, 'Sylhet');
