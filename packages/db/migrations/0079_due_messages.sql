CREATE TABLE "due_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"entry_id" uuid,
	"body" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"skip_reason" text,
	"credits" integer,
	"provider_message_id" text,
	"requested_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "due_messages_kind" CHECK ("due_messages"."kind" in ('baki_notice', 'reminder')),
	CONSTRAINT "due_messages_status" CHECK ("due_messages"."status" in ('queued', 'sending', 'sent', 'skipped', 'failed')),
	CONSTRAINT "due_messages_skip_reason" CHECK ("due_messages"."skip_reason" in ('not_owing', 'outside_hours', 'no_address', 'blocked', 'no_credits')),
	CONSTRAINT "due_messages_skipped_has_reason" CHECK (("due_messages"."status" = 'skipped') = ("due_messages"."skip_reason" is not null)),
	CONSTRAINT "due_messages_entry_for_notice" CHECK (("due_messages"."kind" = 'baki_notice') = ("due_messages"."entry_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "due_messages" ADD CONSTRAINT "due_messages_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_messages" ADD CONSTRAINT "due_messages_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_messages" ADD CONSTRAINT "due_messages_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_messages" ADD CONSTRAINT "due_messages_entry_id_store_fk" FOREIGN KEY ("store_id","entry_id") REFERENCES "public"."due_entries"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "due_messages_entry_key" ON "due_messages" USING btree ("store_id","entry_id") WHERE "due_messages"."entry_id" is not null;--> statement-breakpoint
CREATE INDEX "due_messages_contact_idx" ON "due_messages" USING btree ("store_id","contact_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "due_messages_requested_by_user_id_idx" ON "due_messages" USING btree ("requested_by_user_id");--> statement-breakpoint
ALTER TABLE "due_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "due_messages_isolation" ON "due_messages"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "due_messages" TO dakly_app;
