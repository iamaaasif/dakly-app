ALTER TABLE "webhook_events" DROP CONSTRAINT "webhook_events_provider";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "attributed_touch_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "attributed_amount_poisha" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "attributed_window_days" smallint;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_provider" CHECK ("webhook_events"."provider" in ('meta', 'whatsapp', 'sms', 'sendgrid'));