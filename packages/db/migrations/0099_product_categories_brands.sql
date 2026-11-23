CREATE TABLE "product_brands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_brands_name_length" CHECK (char_length("product_brands"."name") between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_categories_name_length" CHECK (char_length("product_categories"."name") between 1 and 100)
);
--> statement-breakpoint
DROP INDEX "products_store_category_idx";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "product_brands_store_id_id_key" ON "product_brands" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_store_id_id_key" ON "product_categories" USING btree ("store_id","id");--> statement-breakpoint
ALTER TABLE "product_brands" ADD CONSTRAINT "product_brands_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_store_fk" FOREIGN KEY ("store_id","parent_id") REFERENCES "public"."product_categories"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_brands_store_name_key" ON "product_brands" USING btree ("store_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_top_name_key" ON "product_categories" USING btree ("store_id",lower("name")) WHERE "product_categories"."parent_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_child_name_key" ON "product_categories" USING btree ("store_id","parent_id",lower("name")) WHERE "product_categories"."parent_id" is not null;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_store_fk" FOREIGN KEY ("store_id","category_id") REFERENCES "public"."product_categories"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_store_fk" FOREIGN KEY ("store_id","brand_id") REFERENCES "public"."product_brands"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_store_category_id_idx" ON "products" USING btree ("store_id","category_id");--> statement-breakpoint
CREATE INDEX "products_store_brand_id_idx" ON "products" USING btree ("store_id","brand_id");--> statement-breakpoint
-- Each distinct existing category text (ignoring case and spaces) becomes a top-level category
-- of its store, and every product keeps pointing at what it had.
INSERT INTO "product_categories" ("id", "store_id", "name")
SELECT gen_random_uuid(), "store_id", left(min(btrim("category")), 100)
FROM "products"
WHERE btrim(coalesce("category", '')) <> ''
GROUP BY "store_id", lower(left(btrim("category"), 100));--> statement-breakpoint
UPDATE "products" SET "category_id" = c."id"
FROM "product_categories" c
WHERE c."store_id" = "products"."store_id"
  AND c."parent_id" IS NULL
  AND lower(c."name") = lower(left(btrim("products"."category"), 100));--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "category";--> statement-breakpoint
ALTER TABLE "product_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "product_categories_isolation" ON "product_categories"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "product_categories" TO dakly_app;--> statement-breakpoint
ALTER TABLE "product_brands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "product_brands_isolation" ON "product_brands"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "product_brands" TO dakly_app;
