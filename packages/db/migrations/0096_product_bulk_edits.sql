CREATE TABLE "product_bulk_edits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"changes" jsonb NOT NULL,
	"stock_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undo_until" timestamp with time zone NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "product_bulk_edits" ADD CONSTRAINT "product_bulk_edits_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bulk_edits" ADD CONSTRAINT "product_bulk_edits_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_bulk_edits_store_id_created_at_idx" ON "product_bulk_edits" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "product_bulk_edits_actor_user_id_idx" ON "product_bulk_edits" USING btree ("actor_user_id");
--> statement-breakpoint
ALTER TABLE "product_bulk_edits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "product_bulk_edits_isolation" ON "product_bulk_edits"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "product_bulk_edits" TO dakly_app;
