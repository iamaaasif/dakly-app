CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"title" text NOT NULL,
	"option_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sku" text,
	"price_poisha" bigint,
	"cost_poisha" bigint,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"external_source" text,
	"external_account" text,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_external_identity" CHECK (("product_variants"."external_ref" is null and "product_variants"."external_source" is null and "product_variants"."external_account" is null)
        or ("product_variants"."external_ref" is not null and "product_variants"."external_source" is not null and "product_variants"."external_account" is not null)),
	CONSTRAINT "product_variants_status" CHECK ("product_variants"."status" in ('active', 'hidden', 'archived')),
	CONSTRAINT "product_variants_reserved" CHECK ("product_variants"."reserved" >= 0),
	CONSTRAINT "product_variants_money" CHECK (coalesce("product_variants"."price_poisha", 0) >= 0 and coalesce("product_variants"."cost_poisha", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"price_poisha" bigint DEFAULT 0 NOT NULL,
	"compare_at_price_poisha" bigint,
	"image_file_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_stock_tracked" boolean DEFAULT true NOT NULL,
	"is_visible_in_chats" boolean DEFAULT true NOT NULL,
	"is_visible_in_order_link" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"ask_count" integer DEFAULT 0 NOT NULL,
	"search_embedding" vector(512),
	"image_embedding" vector(512),
	"embedding_model" text,
	"search_text_hash" text,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_status" CHECK ("products"."status" in ('active', 'hidden', 'archived')),
	CONSTRAINT "products_price" CHECK ("products"."price_poisha" >= 0 and coalesce("products"."compare_at_price_poisha", 0) >= 0),
	CONSTRAINT "products_name_length" CHECK (char_length("products"."name") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "restock_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"conversation_id" uuid,
	"status" text DEFAULT 'waiting' NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restock_requests_status" CHECK ("restock_requests"."status" in ('waiting', 'notified', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer NOT NULL,
	"on_hand_after" integer NOT NULL,
	"reserved_after" integer NOT NULL,
	"order_id" uuid,
	"reason" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_kind" CHECK ("stock_movements"."kind" in ('reserve', 'release', 'ship', 'return', 'adjust', 'import')),
	CONSTRAINT "stock_movements_quantity" CHECK ("stock_movements"."quantity" <> 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_store_id_id_key" ON "product_variants" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_store_id_sku_key" ON "product_variants" USING btree ("store_id","sku") WHERE "product_variants"."sku" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_external_identity_key" ON "product_variants" USING btree ("store_id","external_source","external_account","external_ref") WHERE "product_variants"."external_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_one_default_key" ON "product_variants" USING btree ("product_id") WHERE "product_variants"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "products_store_id_id_key" ON "products" USING btree ("store_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_store_id_external_ref_key" ON "products" USING btree ("store_id","external_ref") WHERE "products"."external_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "restock_requests_waiting_key" ON "restock_requests" USING btree ("variant_id","contact_id") WHERE "restock_requests"."status" = 'waiting';--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_store_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_variant_id_store_fk" FOREIGN KEY ("store_id","variant_id") REFERENCES "public"."product_variants"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_contact_id_store_fk" FOREIGN KEY ("store_id","contact_id") REFERENCES "public"."contacts"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restock_requests" ADD CONSTRAINT "restock_requests_conversation_id_store_fk" FOREIGN KEY ("store_id","conversation_id") REFERENCES "public"."conversations"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_store_fk" FOREIGN KEY ("store_id","variant_id") REFERENCES "public"."product_variants"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_variants_product_id_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_variants_store_id_idx" ON "product_variants" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "products_store_id_status_idx" ON "products" USING btree ("store_id","status","name");--> statement-breakpoint
CREATE INDEX "products_name_trgm_idx" ON "products" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_aliases_idx" ON "products" USING gin ("aliases");--> statement-breakpoint
CREATE INDEX "restock_requests_store_id_variant_idx" ON "restock_requests" USING btree ("store_id","variant_id","status");--> statement-breakpoint
CREATE INDEX "restock_requests_variant_id_idx" ON "restock_requests" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "restock_requests_contact_id_idx" ON "restock_requests" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "restock_requests_conversation_id_idx" ON "restock_requests" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "stock_movements_variant_idx" ON "stock_movements" USING btree ("store_id","variant_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_variant_id_idx" ON "stock_movements" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "stock_movements_store_id_order_id_idx" ON "stock_movements" USING btree ("store_id","order_id") WHERE "stock_movements"."order_id" is not null;--> statement-breakpoint
CREATE INDEX "stock_movements_actor_user_id_idx" ON "stock_movements" USING btree ("actor_user_id");--> statement-breakpoint

-- Written by hand below this line (docs/rules/database.md, Migrations step 2). Row level
-- security: a connection sees and writes only the rows of the store set by
-- TenantDatabase.forStore. See docs/data/isolation-and-access.md.
ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "product_variants_isolation" ON "product_variants"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "products_isolation" ON "products"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "restock_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "restock_requests_isolation" ON "restock_requests"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "stock_movements_isolation" ON "stock_movements"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint

-- Stock history is append-only: a correction is a new movement.
REVOKE UPDATE, DELETE ON "stock_movements" FROM dakly_app;--> statement-breakpoint
ALTER TABLE "restock_requests" ALTER CONSTRAINT "restock_requests_conversation_id_store_fk" DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
