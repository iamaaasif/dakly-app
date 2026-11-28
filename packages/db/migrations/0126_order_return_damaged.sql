ALTER TABLE "orders" ADD COLUMN "is_return_damaged" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Returns before this column only wrote a stock movement when the units went back on the shelf.
UPDATE "orders" SET "is_return_damaged" = true
WHERE "stage" = 'returned'
  AND EXISTS (SELECT 1 FROM "order_items" i WHERE i."order_id" = "orders"."id" AND i."is_stock_tracked")
  AND NOT EXISTS (
    SELECT 1 FROM "stock_movements" m
    WHERE m."order_id" = "orders"."id" AND m."kind" = 'return' AND m."reason" = "orders"."return_reason"
  );
