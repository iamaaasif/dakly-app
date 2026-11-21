ALTER TABLE "orders" DROP CONSTRAINT "orders_source";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "recipient_phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "recipient_address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "recipient_district" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "khata_rows" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "khata_rows" ADD CONSTRAINT "khata_rows_order_id_store_fk" FOREIGN KEY ("store_id","order_id") REFERENCES "public"."orders"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "khata_rows_order_id_idx" ON "khata_rows" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_recipient_required" CHECK ("orders"."source" = 'khata_import' or ("orders"."recipient_phone" is not null and "orders"."recipient_address" is not null and "orders"."recipient_district" is not null));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_source" CHECK ("orders"."source" in ('messenger', 'instagram', 'whatsapp', 'comment', 'order_link', 'manual', 'pos_csv', 'shopify', 'woocommerce', 'khata_import'));--> statement-breakpoint
-- Orders are records. Only a khata import's undo may remove one, and only its own sale. A
-- restrictive policy narrows the store policy for deletes without replacing it.
CREATE POLICY "orders_delete_khata_import" ON "orders" AS RESTRICTIVE FOR DELETE
  USING ("source" = 'khata_import');--> statement-breakpoint
GRANT DELETE ON "orders" TO dakly_app;
