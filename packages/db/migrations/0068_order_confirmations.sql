CREATE TABLE "order_confirmations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "automation_run_steps" ADD COLUMN "rendered_text" text;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "trigger_order_id" uuid;--> statement-breakpoint
ALTER TABLE "order_confirmations" ADD CONSTRAINT "order_confirmations_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_confirmations" ADD CONSTRAINT "order_confirmations_order_id_store_fk" FOREIGN KEY ("store_id","order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_confirmations_store_order_key" ON "order_confirmations" USING btree ("store_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_confirmations_token_hash_key" ON "order_confirmations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "order_confirmations_order_id_idx" ON "order_confirmations" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_trigger_order_id_orders_id_fk" FOREIGN KEY ("trigger_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_confirmations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "order_confirmations_isolation" ON "order_confirmations"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "order_confirmations" TO dakly_app;
