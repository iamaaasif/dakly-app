ALTER TABLE "imports" DROP CONSTRAINT "imports_status";--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "consent_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "imports_store_id_id_key" ON "imports" USING btree ("store_id","id");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_import_id_store_fk" FOREIGN KEY ("store_id","import_id") REFERENCES "public"."imports"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_store_id_import_id_idx" ON "contacts" USING btree ("store_id","import_id");--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_status" CHECK ("imports"."status" in ('uploaded', 'mapped', 'validated', 'importing', 'done', 'failed', 'undone'));