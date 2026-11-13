# Orders and delivery

|           |                                                                                      |
| --------- | ------------------------------------------------------------------------------------ |
| Release   | 1                                                                                    |
| Status    | Not started                                                                          |
| Extension | Sales                                                                                |
| Code      | `packages/core/src/{orders,delivery}/`, `apps/web/src/features/{orders,order-link}/` |
| Tasks     | ORD-1 to ORD-6, ORD-9 (ORD-7 and ORD-8 are later)                                    |

## Purpose

Takes an order from a chat, the order link or a person, confirms it with the customer, and tracks it to delivery.

Courier integration (booking through courier APIs, automatic parcel status, COD reconciliation) is not in release 1 (D21). In release 1 the shop books the courier itself and records it in Dakly.

## Screens

![Orders](../design/screenshots/orders.webp)

Pipeline by stage with counts and return risk badges. The order link page customers see is not designed yet. Hide the prototype's courier connections and Book courier buttons in release 1; show a simple "Sent with courier" form instead.

## How it works

An order has two state fields: `stage` for fulfilment and `paymentStatus` for money.

| Stage                              | Next stages                                    | Stock effect on entering          |
| ---------------------------------- | ---------------------------------------------- | --------------------------------- |
| `to_confirm`                       | `to_pack`, `on_hold`, `cancelled`              | Reserve tracked items             |
| `on_hold` (reason, follow-up date) | `to_confirm`, `to_pack`, `cancelled`           | None                              |
| `to_pack`                          | `with_courier`, `on_hold`, `cancelled`         | None                              |
| `with_courier`                     | `delivered`, `partially_delivered`, `returned` | Ship (reserved → deducted)        |
| `delivered`, `partially_delivered` | `returned` (late return)                       | Partial: return undelivered units |
| `returned`                         | none                                           | Return units unless damaged       |
| `cancelled`                        | none                                           | Release reservations              |

`paymentStatus`: `cod_pending`, `advance_requested`, `advance_paid`, `paid`, `cod_collected`, `refund_due`, `refunded`.

The transition table is data in `orders/order-stage.ts`. `OrdersService.changeStage` rejects anything not in it with `ORDER_STAGE_NOT_ALLOWED` and writes a stage event (from, to, actor, reason).

Create order (`OrdersService.createOrder`, one transaction)

1. Validate with the contracts schema; normalise the phone; find or create the contact.
2. Take the next order number from the store counter (starts at 1001).
3. Resolve the delivery charge: area → zone → charge. Staff may override; the AI may not.
4. Copy prices from the variants, compute COD = items − discount + delivery − advance (never below 0), reserve stock, warn on a likely duplicate (same phone and variant within 24 hours), emit `order.created`.
5. If the store's payment rule asks for an advance (always, or when return risk is High), create a payment intent and set `advance_requested`.

Confirmation: a WhatsApp utility template or SMS. A yes reply ("হ্যাঁ", yes, ji, ok, confirm, "ঠিক আছে") moves the order to `to_pack` when it is the contact's only order in `to_confirm`; with two, the AI asks which.

Sending with a courier (release 1): staff move the order to `with_courier` and may type the courier name (from a fixed list: Steadfast, Pathao, RedX, own delivery, other) and the tracking code. Staff mark the order delivered, partly delivered or returned by hand, and mark COD collected when the money arrives. The shipping update message to the customer includes the tracking code when there is one.

Later release (D21), kept here so the data model does not block it: courier connections with the shop's own keys, booking as an idempotent job per order, parcel status by webhook or polling, and COD reconciliation from courier payouts matched by consignment id. Do not build any of it in release 1.

Order link: a public page per store and product (`dakly.shop/{store}/{product}`). It posts to a public endpoint that finds the store from the slug on the server, needs a Turnstile token, allows 5 orders per phone per day and 30 per IP per hour, and calls the same `createOrder`.

## Rules

1. An order always has at least one item, a phone and an address.
2. Stage changes follow the table; nothing else.
3. Money is poisha; the COD amount is computed, never typed.
4. Moving to `with_courier` records who did it; courier name and tracking code are optional.
5. Return risk uses only the shop's own parcels (D12).
6. Cancelling after an advance sets `refund_due`.

## Permissions

`orders.view`, `orders.edit`; refunds need the `refund` flag.

## Events

Emits `order.created`, `order.stage_changed`, `order.confirmed`, `order.cod_collected`.

## Data

`orders` (with `courier_name` and `tracking_code` columns in release 1), `order_items`, `order_stage_events`, `store_counters`, `delivery_zones`, `delivery_areas`. Courier tables (`courier_connections`, `shipments`, `cod_settlements`) come with the courier integration in a later release.

## Edge cases to test

- Marking delivered an order that is still `to_pack` is refused.
- Items edited after confirmation re-reserve the difference and send a new summary.

## Acceptance

- Given an order for ৳1,250 with ৳60 delivery and a ৳200 advance paid, then COD is ৳1,110.
- Given an order in `to_pack`, when staff mark it sent with Pathao and tracking code DP123, then it moves to `with_courier`, stock is deducted and the customer gets the tracking code.

## Open questions

Q7 (Inquiry as a stage).
