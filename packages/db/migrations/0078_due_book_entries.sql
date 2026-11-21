CREATE TABLE "due_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_poisha" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"method" text,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "due_entries_kind" CHECK ("due_entries"."kind" in ('baki', 'payment', 'write_off')),
	CONSTRAINT "due_entries_method" CHECK ("due_entries"."method" in ('cash', 'bkash', 'nagad', 'rocket', 'card', 'bank')),
	CONSTRAINT "due_entries_source" CHECK ("due_entries"."source" in ('manual', 'khata_import')),
	CONSTRAINT "due_entries_amount_poisha" CHECK ("due_entries"."amount_poisha" > 0 and "due_entries"."amount_poisha" <= 10000000000),
	CONSTRAINT "due_entries_method_for_payment" CHECK (("due_entries"."kind" = 'payment') = ("due_entries"."method" is not null)),
	CONSTRAINT "due_entries_note" CHECK (char_length("due_entries"."note") <= 500 and ("due_entries"."kind" <> 'write_off' or "due_entries"."note" is not null))
);
--> statement-breakpoint
ALTER TABLE "due_entries" ADD CONSTRAINT "due_entries_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_entries" ADD CONSTRAINT "due_entries_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_entries" ADD CONSTRAINT "due_entries_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "due_entries_store_id_id_key" ON "due_entries" USING btree ("store_id","id");--> statement-breakpoint
CREATE INDEX "due_entries_contact_idx" ON "due_entries" USING btree ("store_id","contact_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "due_entries_kind_idx" ON "due_entries" USING btree ("store_id","kind","occurred_at");--> statement-breakpoint
CREATE INDEX "due_entries_recorded_by_user_id_idx" ON "due_entries" USING btree ("recorded_by_user_id");--> statement-breakpoint
ALTER TABLE "due_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "due_entries_isolation" ON "due_entries"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
-- A ledger: a correction is a new row, so the app never updates or deletes one.
GRANT SELECT, INSERT ON "due_entries" TO dakly_app;
