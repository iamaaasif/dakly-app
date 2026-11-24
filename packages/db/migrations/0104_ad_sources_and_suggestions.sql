CREATE TABLE "ad_product_suggestions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_product_suggestions_source" CHECK ("ad_product_suggestions"."source" in ('ad', 'post')),
	CONSTRAINT "ad_product_suggestions_origin" CHECK ("ad_product_suggestions"."origin" in ('catalog', 'photo')),
	CONSTRAINT "ad_product_suggestions_position" CHECK ("ad_product_suggestions"."position" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "ad_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text,
	"photo_url" text,
	"read_state" text DEFAULT 'pending' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_sources_source" CHECK ("ad_sources"."source" in ('ad', 'post')),
	CONSTRAINT "ad_sources_read_state" CHECK ("ad_sources"."read_state" in ('pending', 'read', 'unreadable'))
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "referral_photo_url" text;--> statement-breakpoint
ALTER TABLE "ad_product_suggestions" ADD CONSTRAINT "ad_product_suggestions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_product_suggestions" ADD CONSTRAINT "ad_product_suggestions_product_id_store_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_sources" ADD CONSTRAINT "ad_sources_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_product_suggestions_source_product_key" ON "ad_product_suggestions" USING btree ("store_id","source","external_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_sources_source_key" ON "ad_sources" USING btree ("store_id","source","external_id");--> statement-breakpoint
ALTER TABLE "ad_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ad_sources_isolation" ON "ad_sources"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "ad_sources" TO dakly_app;
--> statement-breakpoint
ALTER TABLE "ad_product_suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ad_product_suggestions_isolation" ON "ad_product_suggestions"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "ad_product_suggestions" TO dakly_app;
