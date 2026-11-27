ALTER TABLE "products" ADD COLUMN "short_description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stock_status" text DEFAULT 'in_stock' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "allow_orders_when_out_of_stock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stock_status" CHECK ("products"."stock_status" in ('in_stock', 'out_of_stock'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_short_description_length" CHECK ("products"."short_description" is null or char_length("products"."short_description") <= 300);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_barcode_length" CHECK ("products"."barcode" is null or char_length("products"."barcode") <= 64);