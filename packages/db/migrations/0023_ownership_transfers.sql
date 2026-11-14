CREATE TABLE "ownership_transfers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"new_owner_user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ownership_transfers_status" CHECK ("ownership_transfers"."status" in ('pending', 'accepted', 'cancelled', 'expired')),
	CONSTRAINT "ownership_transfers_distinct_users" CHECK ("ownership_transfers"."owner_user_id" <> "ownership_transfers"."new_owner_user_id")
);
--> statement-breakpoint
ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_new_owner_user_id_users_id_fk" FOREIGN KEY ("new_owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ownership_transfers_one_pending_key" ON "ownership_transfers" USING btree ("store_id") WHERE "ownership_transfers"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "ownership_transfers_store_id_idx" ON "ownership_transfers" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "ownership_transfers_owner_user_id_idx" ON "ownership_transfers" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "ownership_transfers_new_owner_user_id_idx" ON "ownership_transfers" USING btree ("new_owner_user_id");--> statement-breakpoint
ALTER TABLE "ownership_transfers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ownership_transfers_isolation" ON "ownership_transfers"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);
