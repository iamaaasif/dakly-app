# Products and stock

|           |                                                                  |
| --------- | ---------------------------------------------------------------- |
| Release   | 1                                                                |
| Status    | Not started                                                      |
| Extension | Sales                                                            |
| Code      | `packages/core/src/products/`, `apps/web/src/features/products/` |
| Tasks     | PROD-1 to PROD-4                                                 |

## Purpose

The shop's catalogue with sizes and colours, live stock, and the names customers use for each product, so the AI and the order form always quote the right price and stock.

## Screens

![Products](../design/screenshots/products.webp)

List with readiness labels (Needs a price, Needs a photo, Hidden, Running low), stock per size, and "asked for in chats" counts. Fix the prototype's copy bug "1 people asked".

## How it works

1. A product has 0 to 3 option types (Size, Colour, Fabric) and one or more variants. A product with no options has one default variant, so an order always points at a variant.
2. Stock lives on the variant: on hand and reserved. Available = on hand − reserved.
3. Stock changes only through `ProductsService.moveStock(storeId, variantId, kind, quantity, reference)`. It runs one guarded `UPDATE ... WHERE on_hand - reserved >= quantity` and writes a `stock_movements` row in the same transaction. Zero rows updated throws `STOCK_NOT_AVAILABLE`.
4. Movement kinds: `reserve`, `release`, `ship`, `return`, `adjust`, `import`.
5. Products with stock tracking off skip all of this and never block an order.
6. Readiness labels are computed, not stored. Running low is any tracked variant at or under the store threshold (default 3).
7. Each product has AI aliases ("kurti", "কুর্তি", "three piece") and one search embedding, rebuilt by a job when the name, description or aliases change.
8. Restock: when a variant goes from 0 to available and people are on its waiting list, the owner is prompted to notify them. Sending is never automatic.

Photos upload straight to R2 with a presigned URL; the API never streams files.

## Rules

1. Price is an integer in poisha. A product with price 0 cannot be ordered or quoted by the AI.
2. Every stock change has a movement row that says why.
3. Hidden products are never offered by the AI.

## Permissions

`products.view`, `products.edit`.

## Events

Emits `product.updated`, `stock.changed`, `variant.restocked`.

## Data

`products`, `product_options`, `variants`, `stock_movements`, `product_media`. `restock_requests` is deferred by the schema review (pending review).

## Edge cases to test

- Two orders for the last unit at the same moment: one gets `STOCK_NOT_AVAILABLE`.
- Adjusting stock below reserved is rejected.
- A product with no options gets exactly one variant.

## Acceptance

- Given size M has 3 on hand and 1 reserved, when the owner opens the product, then M shows 2 available.
