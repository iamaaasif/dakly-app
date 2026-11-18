ALTER TABLE "order_items" ADD COLUMN "delivered_line_discount_poisha" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_items_subtotal_poisha" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_order_discount_poisha" bigint;