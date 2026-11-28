CREATE TABLE "platform_interests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_interests_platform" CHECK ("platform_interests"."platform" in ('tiktok'))
);
--> statement-breakpoint
ALTER TABLE "platform_interests" ADD CONSTRAINT "platform_interests_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_interests" ADD CONSTRAINT "platform_interests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_interests_key" ON "platform_interests" USING btree ("store_id","user_id","platform");--> statement-breakpoint
CREATE INDEX "platform_interests_user_id_idx" ON "platform_interests" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "platform_interests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "platform_interests_isolation" ON "platform_interests"
  USING ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK ("store_id" = NULLIF(current_setting('app.store_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_interests" TO dakly_app;
