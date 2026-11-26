ALTER TABLE "products" ADD COLUMN "negotiation_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "negotiation_opening_poisha" bigint;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "negotiation_floor_poisha" bigint;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_negotiation_price_order" CHECK ("products"."negotiation_floor_poisha" <= "products"."negotiation_opening_poisha");