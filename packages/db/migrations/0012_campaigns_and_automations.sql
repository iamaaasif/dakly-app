CREATE TABLE "campaign_recipients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"contact_identity_id" uuid,
	"destination_address" text,
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
	"quality_rating" text DEFAULT 'unknown' NOT NULL,
	"is_ready_made" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_templates_category" CHECK ("whatsapp_templates"."category" in ('marketing', 'utility', 'authentication')),
	CONSTRAINT "whatsapp_templates_status" CHECK ("whatsapp_templates"."status" in ('draft', 'pending', 'approved', 'rejected', 'paused', 'disabled')),
	CONSTRAINT "whatsapp_templates_quality_rating" CHECK ("whatsapp_templates"."quality_rating" in ('green', 'yellow', 'red', 'unknown'))
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
CREATE UNIQUE INDEX "campaign_recipients_campaign_contact_key" ON "campaign_recipients" USING btree ("campaign_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_store_id_id_key" ON "campaigns" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_link_visits_store_event_key" ON "tracked_link_visits" USING btree ("store_id","event_key","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_links_store_id_id_key" ON "tracked_links" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_links_code_key" ON "tracked_links" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_templates_store_id_id_key" ON "whatsapp_templates" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_templates_name_key" ON "whatsapp_templates" USING btree ("channel_connection_id","name","language");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_run_steps_run_step_key" ON "automation_run_steps" USING btree ("run_id","step_key");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_store_id_id_key" ON "automation_runs" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_trigger_key" ON "automation_runs" USING btree ("automation_id","contact_id","trigger_key");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_versions_store_id_id_key" ON "automation_versions" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_versions_automation_version_key" ON "automation_versions" USING btree ("automation_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "automations_store_id_id_key" ON "automations" USING btree ("store_id","id");--> statement-breakpoint
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

-- Written by hand below this line (docs/rules/database.md, Migrations step 2). Row level
-- security: a connection sees and writes only the rows of the store set by
-- TenantDatabase.forStore. See docs/data/isolation-and-access.md.
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
ALTER TABLE "campaign_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "campaign_recipients_isolation" ON "campaign_recipients"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "campaigns_isolation" ON "campaigns"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tracked_link_visit_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tracked_link_visit_days_isolation" ON "tracked_link_visit_days"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tracked_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tracked_links_isolation" ON "tracked_links"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "whatsapp_templates_isolation" ON "whatsapp_templates"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint

-- A published workflow version stays for history; daily link rows go only with their link.
REVOKE DELETE ON "automation_versions", "tracked_link_visit_days" FROM dakly_app;--> statement-breakpoint
-- A version is frozen once saved; only the stop switch may change.
REVOKE UPDATE ON "automation_versions" FROM dakly_app;--> statement-breakpoint
GRANT UPDATE ("is_stopped") ON "automation_versions" TO dakly_app;--> statement-breakpoint
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
