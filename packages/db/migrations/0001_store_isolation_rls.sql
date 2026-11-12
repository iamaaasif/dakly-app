-- Row level security: a connection only sees rows of the store set by
-- TenantDatabase.forStore (set_config('app.store_id', ..., true)).
-- With no store set, it sees nothing. The table owner (migrations) is not affected.
-- Every new table with store_id needs the same three lines. See docs/rules/multi-tenancy.md.

ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "stores_isolation" ON "stores"
  USING ("id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "customers_isolation" ON "customers"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);
