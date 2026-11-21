CREATE TABLE "khata_pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"failure_code" text,
	"claimed_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "khata_pages_status" CHECK ("khata_pages"."status" in ('uploaded', 'reading', 'read', 'unreadable', 'failed')),
	CONSTRAINT "khata_pages_failure_code" CHECK ("khata_pages"."failure_code" in ('allowance', 'model')),
	CONSTRAINT "khata_pages_failure" CHECK (("khata_pages"."status" = 'failed') = ("khata_pages"."failure_code" is not null))
);
--> statement-breakpoint
CREATE TABLE "khata_rows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"entry_date" date,
	"name" text NOT NULL,
	"phone" text,
	"item" text,
	"amount_poisha" bigint NOT NULL,
	"kind" text NOT NULL,
	"confidence" smallint NOT NULL,
	"matched_contact_id" uuid,
	"match_kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "khata_rows_kind" CHECK ("khata_rows"."kind" in ('sale', 'baki', 'payment')),
	CONSTRAINT "khata_rows_match_kind" CHECK ("khata_rows"."match_kind" in ('phone', 'similar_phone')),
	CONSTRAINT "khata_rows_confidence" CHECK ("khata_rows"."confidence" between 0 and 100),
	CONSTRAINT "khata_rows_amount" CHECK ("khata_rows"."amount_poisha" > 0),
	CONSTRAINT "khata_rows_match" CHECK (("khata_rows"."matched_contact_id" is null) = ("khata_rows"."match_kind" is null))
);
--> statement-breakpoint
ALTER TABLE "ai_runs" DROP CONSTRAINT "ai_runs_purpose";--> statement-breakpoint
ALTER TABLE "usage_events" DROP CONSTRAINT "usage_events_unit";--> statement-breakpoint
ALTER TABLE "files" DROP CONSTRAINT "files_purpose";--> statement-breakpoint
CREATE UNIQUE INDEX "khata_pages_store_id_id_key" ON "khata_pages" USING btree ("store_id","id");--> statement-breakpoint
ALTER TABLE "khata_pages" ADD CONSTRAINT "khata_pages_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khata_pages" ADD CONSTRAINT "khata_pages_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khata_pages" ADD CONSTRAINT "khata_pages_file_id_store_fk" FOREIGN KEY ("store_id","file_id") REFERENCES "public"."files"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khata_rows" ADD CONSTRAINT "khata_rows_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khata_rows" ADD CONSTRAINT "khata_rows_page_id_store_fk" FOREIGN KEY ("store_id","page_id") REFERENCES "public"."khata_pages"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khata_rows" ADD CONSTRAINT "khata_rows_matched_contact_id_store_fk" FOREIGN KEY ("store_id","matched_contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "khata_pages_store_id_created_at_idx" ON "khata_pages" USING btree ("store_id","created_at","id");--> statement-breakpoint
CREATE INDEX "khata_pages_file_id_idx" ON "khata_pages" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "khata_pages_created_by_user_id_idx" ON "khata_pages" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "khata_rows_page_id_row_number_key" ON "khata_rows" USING btree ("page_id","row_number");--> statement-breakpoint
CREATE INDEX "khata_rows_store_id_page_id_idx" ON "khata_rows" USING btree ("store_id","page_id");--> statement-breakpoint
CREATE INDEX "khata_rows_matched_contact_id_idx" ON "khata_rows" USING btree ("matched_contact_id");--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_purpose" CHECK ("purpose" in ('chat_reply', 'classify', 'comment_reply', 'summary', 'transcribe', 'describe_image', 'content', 'ask', 'segment_rules', 'voice_add', 'teach', 'embedding', 'contact_memory', 'grade_test', 'khata_scan'));--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_unit" CHECK ("usage_events"."unit" in ('ai_conversation', 'ai_content', 'ai_ask', 'ai_scan'));--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_purpose" CHECK ("files"."purpose" in ('product_image', 'post_media', 'knowledge_file', 'logo', 'import', 'export', 'sms_sender_document', 'khata_page', 'data_export', 'staff_export', 'settlement_report'));;--> statement-breakpoint
ALTER TABLE "khata_pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "khata_pages_isolation" ON "khata_pages"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "khata_pages" TO dakly_app;--> statement-breakpoint
ALTER TABLE "khata_rows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "khata_rows_isolation" ON "khata_rows"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "khata_rows" TO dakly_app;
