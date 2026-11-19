ALTER TABLE "webhook_events" DROP CONSTRAINT "webhook_events_provider";--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "gateway" text;--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "gateway_event_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_gateway_event_key" ON "payment_events" USING btree ("gateway","gateway_event_id");--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_provider" CHECK ("webhook_events"."provider" in ('meta', 'whatsapp', 'sms', 'sendgrid', 'bkash', 'nagad', 'city_bank'));