DROP INDEX "posts_store_id_created_at_idx";--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "create_key" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "create_fingerprint" text;--> statement-breakpoint
CREATE UNIQUE INDEX "posts_store_creator_create_key" ON "posts" USING btree ("store_id","created_by_user_id","create_key") WHERE "posts"."create_key" is not null;--> statement-breakpoint
CREATE INDEX "posts_store_id_created_at_idx" ON "posts" USING btree ("store_id","created_at","id");