CREATE TABLE "khata_imports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"status" text DEFAULT 'done' NOT NULL,
	"rows_read" integer NOT NULL,
	"rows_imported" integer NOT NULL,
	"rows_skipped" integer NOT NULL,
	"customers_created" integer NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone,
	CONSTRAINT "khata_imports_status" CHECK ("khata_imports"."status" in ('done', 'undone')),
	CONSTRAINT "khata_imports_undone" CHECK (("khata_imports"."status" = 'undone') = ("khata_imports"."undone_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_source";--> statement-breakpoint
ALTER TABLE "khata_pages" ALTER COLUMN "file_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "khata_rows" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "khata_rows" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "khata_rows" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "khata_rows" ADD COLUMN "is_contact_created" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "khata_rows" ADD COLUMN "due_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "khata_imports" ADD CONSTRAINT "khata_imports_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khata_imports" ADD CONSTRAINT "khata_imports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khata_imports" ADD CONSTRAINT "khata_imports_page_id_store_fk" FOREIGN KEY ("store_id","page_id") REFERENCES "public"."khata_pages"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "khata_imports_store_id_id_key" ON "khata_imports" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "khata_imports_page_id_done_key" ON "khata_imports" USING btree ("store_id","page_id") WHERE "khata_imports"."status" = 'done';--> statement-breakpoint
CREATE INDEX "khata_imports_store_id_created_at_idx" ON "khata_imports" USING btree ("store_id","created_at","id");--> statement-breakpoint
CREATE INDEX "khata_imports_created_by_user_id_idx" ON "khata_imports" USING btree ("created_by_user_id");--> statement-breakpoint
ALTER TABLE "khata_rows" ADD CONSTRAINT "khata_rows_import_id_store_fk" FOREIGN KEY ("store_id","import_id") REFERENCES "public"."khata_imports"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khata_rows" ADD CONSTRAINT "khata_rows_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khata_rows" ADD CONSTRAINT "khata_rows_due_entry_id_store_fk" FOREIGN KEY ("store_id","due_entry_id") REFERENCES "public"."due_entries"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "khata_rows_import_id_idx" ON "khata_rows" USING btree ("store_id","import_id");--> statement-breakpoint
CREATE INDEX "khata_rows_contact_id_idx" ON "khata_rows" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "khata_rows_due_entry_id_idx" ON "khata_rows" USING btree ("due_entry_id");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_source" CHECK ("contacts"."source" in ('messenger', 'instagram', 'whatsapp', 'comment', 'order_link', 'manual', 'voice', 'import', 'shopify', 'woocommerce', 'pos', 'khata_import'));--> statement-breakpoint
ALTER TABLE "khata_rows" ADD CONSTRAINT "khata_rows_outcome" CHECK ("khata_rows"."outcome" in ('imported', 'skipped'));--> statement-breakpoint
ALTER TABLE "khata_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "khata_imports_isolation" ON "khata_imports"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "khata_imports" TO dakly_app;--> statement-breakpoint
GRANT UPDATE ON "khata_rows" TO dakly_app;--> statement-breakpoint
-- Only a khata import's undo may remove a ledger row; a manual entry can never be deleted.
-- A restrictive policy narrows the store policy for deletes without replacing it.
CREATE POLICY "due_entries_delete_khata_import" ON "due_entries" AS RESTRICTIVE FOR DELETE
  USING ("source" = 'khata_import');--> statement-breakpoint
GRANT DELETE ON "due_entries" TO dakly_app;
