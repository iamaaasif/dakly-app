CREATE TABLE "ad_product_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_product_links_source" CHECK ("ad_product_links"."source" in ('ad', 'post')),
	CONSTRAINT "ad_product_links_position" CHECK ("ad_product_links"."position" between 0 and 3)
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "referral_ad_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "referral_post_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "referral_title" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "referred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ad_product_links" ADD CONSTRAINT "ad_product_links_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_product_links" ADD CONSTRAINT "ad_product_links_product_id_store_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_product_links_source_product_key" ON "ad_product_links" USING btree ("store_id","source","external_id","product_id");--> statement-breakpoint
ALTER TABLE "ad_product_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ad_product_links_isolation" ON "ad_product_links"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "ad_product_links" TO dakly_app;
