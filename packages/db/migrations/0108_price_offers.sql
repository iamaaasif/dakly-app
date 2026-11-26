CREATE TABLE "price_offers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"customer_message_id" uuid NOT NULL,
	"offered_price_poisha" bigint NOT NULL,
	"step" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "price_offers_step" CHECK ("price_offers"."step" in ('opening', 'final')),
	CONSTRAINT "price_offers_nonnegative_price" CHECK ("price_offers"."offered_price_poisha" >= 0)
);
--> statement-breakpoint
ALTER TABLE "price_offers" ADD CONSTRAINT "price_offers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_offers" ADD CONSTRAINT "price_offers_conversation_store_fk" FOREIGN KEY ("store_id","conversation_id") REFERENCES "public"."conversations"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_offers" ADD CONSTRAINT "price_offers_contact_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_offers" ADD CONSTRAINT "price_offers_product_store_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_offers_customer_turn_key" ON "price_offers" USING btree ("store_id","conversation_id","product_id","customer_message_id");--> statement-breakpoint
CREATE INDEX "price_offers_scope_expiry_idx" ON "price_offers" USING btree ("store_id","conversation_id","contact_id","product_id","expires_at");--> statement-breakpoint
CREATE INDEX "price_offers_contact_idx" ON "price_offers" USING btree ("store_id","contact_id");--> statement-breakpoint
CREATE INDEX "price_offers_product_idx" ON "price_offers" USING btree ("store_id","product_id");--> statement-breakpoint
ALTER TABLE "price_offers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "price_offers_isolation" ON "price_offers"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT ON "price_offers" TO dakly_app;
