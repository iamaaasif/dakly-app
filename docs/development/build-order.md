# Release 1 build order

The order features are built in, and why. Task ids and statuses are in [tasks.md](../tasks.md).

| Milestone | What                                                               | Why here                                                                                                                                                         |
| --------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0        | Foundation: ids, outbox, audit, crypto, logging, UI kit, app shell | Every feature uses them. Building them inside the first feature would mean rewriting it later.                                                                   |
| M1        | Account, stores, team, sessions                                    | Until sessions exist every store route returns 401. Nothing else can be tried end to end.                                                                        |
| M2        | Notifications, usage                                               | Shared plumbing later features emit into.                                                                                                                        |
| M3        | Channel connections, webhook intake, contacts                      | Messages need a store, a contact and a connection to land in.                                                                                                    |
| M4        | Chats inbox for people, no AI                                      | The inbox must work by hand first. The AI then plugs into a working inbox, and shops can use Dakly even when AI is off.                                          |
| M5        | Products and stock                                                 | Orders and the AI's answers both need prices and stock.                                                                                                          |
| M6        | Orders and delivery zones                                          | The AI's `draft_order` tool needs a working order service.                                                                                                       |
| M7        | AI layer and sales agent                                           | Built on top of a working inbox, products and orders, so its tools call real services.                                                                           |
| M8        | (Couriers and COD moved to a later release, D21)                   | Shops book couriers themselves; ORD-9 records the courier and tracking code.                                                                                     |
| M9        | Payments and billing                                               | Gateway sandboxes come only after merchant approval; start the applications in M0, build when they arrive. Flow B (shop advances) before flow A (Dakly billing). |
| M10       | Content Studio and Social Auto Post                                | Needs channel connections and the AI layer.                                                                                                                      |
| M11       | Segments, campaigns, automations, analytics, dashboard             | Needs contacts with stats, orders, WhatsApp templates and balances. Analytics needs real orders to report on.                                                    |
| M12       | Admin panel                                                        | Needed before the first paying shop. Small parts (kill switches) can start earlier if the AI goes live first.                                                    |

## Outside the code, start early

These take weeks and block milestones:

- Meta app review for messaging and page permissions (M3, M4).
- Meta business verification and the WhatsApp BSP contract (M3, M11). Blocked on Q2.
- bKash, Nagad and City Bank merchant applications for Dakly's own accounts (M9).
- SMS provider account and sender id, and a SendGrid account with a verified sending domain (M1).
- Google OAuth client and consent screen verification (M1).
- OpenAI organisation, zero data retention request (M7, Q9).
- 200 anonymised chats from beta shops for the golden set (M7).

## Beta

The first beta shop can start after M7, with couriers booked by the shop and no billing: a free beta. Paying shops need M9 and M12.
