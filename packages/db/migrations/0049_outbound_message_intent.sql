ALTER TABLE "messages" ADD COLUMN "recipient_identity_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "send_category" text;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_identity_store_fk" FOREIGN KEY ("store_id","recipient_identity_id") REFERENCES "public"."contact_identities"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_recipient_identity_idx" ON "messages" USING btree ("store_id","recipient_identity_id") WHERE "messages"."recipient_identity_id" is not null;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_send_category" CHECK ("messages"."send_category" in ('staff_reply', 'transactional', 'marketing'));