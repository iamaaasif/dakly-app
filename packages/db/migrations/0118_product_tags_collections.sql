CREATE TABLE "product_collection_links" (
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	CONSTRAINT "product_collection_links_product_id_collection_id_pk" PRIMARY KEY("product_id","collection_id")
);
--> statement-breakpoint
CREATE TABLE "product_collections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_collections_name_length" CHECK (char_length("product_collections"."name") between 1 and 100)
);
--> statement-breakpoint
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
CREATE UNIQUE INDEX "product_collections_store_id_id_key" ON "product_collections" USING btree ("store_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "product_tags_store_id_id_key" ON "product_tags" USING btree ("store_id","id");
--> statement-breakpoint
ALTER TABLE "product_collection_links" ADD CONSTRAINT "product_collection_links_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_collection_links" ADD CONSTRAINT "product_collection_links_product_store_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_collection_links" ADD CONSTRAINT "product_collection_links_collection_store_fk" FOREIGN KEY ("store_id","collection_id") REFERENCES "public"."product_collections"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_tag_links" ADD CONSTRAINT "product_tag_links_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_tag_links" ADD CONSTRAINT "product_tag_links_product_store_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_tag_links" ADD CONSTRAINT "product_tag_links_tag_store_fk" FOREIGN KEY ("store_id","tag_id") REFERENCES "public"."product_tags"("store_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "product_collection_links_collection_idx" ON "product_collection_links" USING btree ("store_id","collection_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "product_collections_store_name_key" ON "product_collections" USING btree ("store_id",lower("name"));
--> statement-breakpoint
CREATE INDEX "product_tag_links_tag_idx" ON "product_tag_links" USING btree ("store_id","tag_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "product_tags_store_name_key" ON "product_tags" USING btree ("store_id",lower("name"));--> statement-breakpoint
ALTER TABLE "product_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "product_tags_isolation" ON "product_tags"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "product_tags" TO dakly_app;--> statement-breakpoint
ALTER TABLE "product_tag_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "product_tag_links_isolation" ON "product_tag_links"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "product_tag_links" TO dakly_app;--> statement-breakpoint
ALTER TABLE "product_collections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "product_collections_isolation" ON "product_collections"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "product_collections" TO dakly_app;--> statement-breakpoint
ALTER TABLE "product_collection_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "product_collection_links_isolation" ON "product_collection_links"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "product_collection_links" TO dakly_app;
