ALTER TABLE "payment_events" ADD COLUMN "gateway" text;--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "gateway_event_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_gateway_event_key" ON "payment_events" USING btree ("gateway","gateway_event_id");