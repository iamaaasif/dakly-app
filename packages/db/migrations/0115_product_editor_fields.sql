CREATE TABLE "product_tag_links" (
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "product_tag_links_product_id_tag_id_pk" PRIMARY KEY("product_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "product_tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_tags_name_length" CHECK (char_length("product_tags"."name") between 1 and 50)
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "short_description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stock_status" text DEFAULT 'in_stock' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_tags_store_id_id_key" ON "product_tags" USING btree ("store_id","id");--> statement-breakpoint
ALTER TABLE "product_tag_links" ADD CONSTRAINT "product_tag_links_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tag_links" ADD CONSTRAINT "product_tag_links_product_store_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tag_links" ADD CONSTRAINT "product_tag_links_tag_store_fk" FOREIGN KEY ("store_id","tag_id") REFERENCES "public"."product_tags"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_tag_links_tag_idx" ON "product_tag_links" USING btree ("store_id","tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_tags_store_name_key" ON "product_tags" USING btree ("store_id",lower("name"));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stock_status" CHECK ("products"."stock_status" in ('in_stock', 'out_of_stock'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_short_description_length" CHECK ("products"."short_description" is null or char_length("products"."short_description") <= 300);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_barcode_length" CHECK ("products"."barcode" is null or char_length("products"."barcode") <= 64);--> statement-breakpoint
ALTER TABLE "product_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "product_tags_isolation" ON "product_tags" USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid) WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "product_tag_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "product_tag_links_isolation" ON "product_tag_links" USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid) WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "product_tags" TO dakly_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "product_tag_links" TO dakly_app;
