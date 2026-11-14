DROP INDEX "users_email_key";--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email") WHERE "users"."email_verified_at" is not null;