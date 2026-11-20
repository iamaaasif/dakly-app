CREATE TABLE "meta_page_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"page_external_id" text NOT NULL,
	"access_token_ciphertext" "bytea" NOT NULL,
	"key_version" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_connections" ADD COLUMN "linked_page_external_id" text;--> statement-breakpoint
ALTER TABLE "meta_page_subscriptions" ADD CONSTRAINT "meta_page_subscriptions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meta_page_subscriptions_store_page_key" ON "meta_page_subscriptions" USING btree ("store_id","page_external_id");--> statement-breakpoint
CREATE INDEX "meta_page_subscriptions_created_at_idx" ON "meta_page_subscriptions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "channel_connections_linked_page_idx" ON "channel_connections" USING btree ("linked_page_external_id") WHERE "channel_connections"."status" <> 'disconnected';--> statement-breakpoint
ALTER TABLE "meta_page_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "meta_page_subscriptions_isolation" ON "meta_page_subscriptions"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "meta_page_subscriptions" TO dakly_app;--> statement-breakpoint
CREATE FUNCTION meta_page_subscriptions_due(p_before timestamptz, p_after uuid)
RETURNS TABLE(store_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT subscription.store_id
  FROM public.meta_page_subscriptions AS subscription
  WHERE subscription.created_at <= p_before
    AND (p_after IS NULL OR subscription.store_id > p_after)
  ORDER BY subscription.store_id
  LIMIT 100
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION meta_page_subscriptions_due(timestamptz, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION meta_page_subscriptions_due(timestamptz, uuid) TO dakly_app;
--> statement-breakpoint
CREATE FUNCTION meta_page_is_connected(p_page_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channel_connections AS connection
    WHERE connection.status <> 'disconnected'
      AND ((connection.kind = 'facebook_page' AND connection.external_account_id = p_page_id)
        OR (connection.kind = 'instagram' AND connection.linked_page_external_id = p_page_id))
  )
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION meta_page_is_connected(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION meta_page_is_connected(text) TO dakly_app;
