ALTER TABLE "users" ADD COLUMN "sign_up_source" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sign_up_source_other" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "offering" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_sign_up_source" CHECK ("users"."sign_up_source" in ('facebook', 'facebook_group', 'youtube', 'chatgpt', 'google_search', 'phone_call', 'other'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_sign_up_source_other" CHECK ("users"."sign_up_source_other" is null or "users"."sign_up_source" = 'other');--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_offering" CHECK ("stores"."offering" in ('products', 'services', 'both'));