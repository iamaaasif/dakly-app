CREATE TABLE "platform_daily_metrics" (
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"dimension" text DEFAULT '' NOT NULL,
	"value" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_daily_metrics_day_metric_dimension_pk" PRIMARY KEY("day","metric","dimension")
);
--> statement-breakpoint
CREATE TABLE "store_daily_metrics" (
	"store_id" uuid NOT NULL,
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"dimension" text DEFAULT '' NOT NULL,
	"value" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_daily_metrics_store_id_day_metric_dimension_pk" PRIMARY KEY("store_id","day","metric","dimension")
);
--> statement-breakpoint
ALTER TABLE "store_daily_metrics" ADD CONSTRAINT "store_daily_metrics_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Written by hand below this line (docs/rules/database.md, Migrations step 2). Row level
-- security: a connection sees and writes only the rows of the store set by
-- TenantDatabase.forStore. See docs/data/isolation-and-access.md.
ALTER TABLE "store_daily_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "store_daily_metrics_isolation" ON "store_daily_metrics"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint

-- Company metrics are written and read only by owner functions for the admin panel.
REVOKE ALL ON "platform_daily_metrics" FROM dakly_app;--> statement-breakpoint
