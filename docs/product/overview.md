# Product overview

## What Dakly is

Dakly is a sales assistant for small Bangladeshi online shops. It answers customer chats from Messenger, Instagram and WhatsApp in one inbox, replies with AI in Bangla, Banglish or English, turns chats into cash-on-delivery orders, keeps one customer list per shop, and brings customers back with WhatsApp, SMS and Messenger messages. It also writes and schedules Facebook and Instagram posts.

The first release succeeds if a Facebook-first seller can connect their Page and WhatsApp, let Dakly answer and log orders from chats, and send a first win-back campaign within the 14-day trial.

## Who it is for

| Seller type           | How they sell today                                | What Dakly does for them                         | Release                      |
| --------------------- | -------------------------------------------------- | ------------------------------------------------ | ---------------------------- |
| Facebook-first seller | Facebook Page, Messenger, Instagram, WhatsApp; COD | AI answers chats, takes orders, wins buyers back | 1                            |
| Online store owner    | Shopify or WooCommerce                             | Syncs customers and orders, runs campaigns       | 1 (sync is an open question) |
| Shop with a POS       | Billing software at the counter                    | Imports POS sales by CSV, sends offers           | CSV in 1, connectors in 2    |
| Shop without a POS    | Cash, a notebook (khata), credit (baki)            | Counter till, Due book, scans notebook pages     | 2                            |

## Goals

- Fewer lost sales from chats: answer "price koto?" and "delivery charge koto?" in seconds and turn the chat into an order or a saved lead.
- One customer list per shop, keyed on phone number.
- More repeat sales from segments, campaigns and automations that only message customers who agreed to hear from the shop.
- Show the owner, in Taka, what Dakly earned them.
- Work the way Bangladeshi shops work: COD, couriers, baki, bKash and Nagad, VAT invoices, 64 districts, phone first.

## Not in release 1

- Accounting, payroll, full inventory (Products tracks stock per variant only).
- A storefront or website builder. The order link is the only page customers see.
- Email campaigns (D20). Transactional email (sign-in codes, invites, alerts, invoices) is in release 1.
- Courier integration (D21). Shops book couriers themselves and record the courier and tracking code on the order.
- AI voice calls (hidden, no release planned), TikTok (later), running Meta ads.
- Bangla UI (release 2). AI output in Bangla ships in release 1.

## Release scope

| Area                                   | Part of                   | Release | Feature doc                                                                     |
| -------------------------------------- | ------------------------- | ------- | ------------------------------------------------------------------------------- |
| Sign-up, stores, team, sessions        | Core                      | 1       | [01-account-and-team](../features/01-account-and-team.md)                       |
| Channel connections, webhook intake    | Core                      | 1       | [02-channel-connections](../features/02-channel-connections.md)                 |
| Customers, consent, segments           | Core                      | 1       | [03-customers-and-segments](../features/03-customers-and-segments.md)           |
| Chats inbox and AI sales agent         | Chats extension           | 1       | [04-chats-and-ai-agent](../features/04-chats-and-ai-agent.md)                   |
| Products and stock                     | Sales extension           | 1       | [05-products-and-stock](../features/05-products-and-stock.md)                   |
| Orders and delivery (no couriers)      | Sales extension           | 1       | [06-orders-and-delivery](../features/06-orders-and-delivery.md)                 |
| Payments and billing                   | Core                      | 1       | [07-payments-and-billing](../features/07-payments-and-billing.md)               |
| Content Studio and Social Auto Post    | Core and Social extension | 1       | [08-content-and-social](../features/08-content-and-social.md)                   |
| Campaigns and automations              | Core                      | 1       | [09-campaigns-and-automations](../features/09-campaigns-and-automations.md)     |
| Dashboard, notifications, Ask Dakly AI | Core                      | 1       | [10-dashboard-and-notifications](../features/10-dashboard-and-notifications.md) |
| Analytics                              | Core                      | 1       | [11-analytics](../features/11-analytics.md)                                     |
| Admin panel (staff app)                | Internal                  | 1       | [12-admin-panel](../features/12-admin-panel.md)                                 |
| Shop sales, Due book, Khata, POS API   | Physical Shop extension   | 2       | [13-physical-shop](../features/13-physical-shop.md)                             |

Extensions (Chats, Sales, Social Auto Post, Physical Shop) are free toggles on the Extensions page. Turning one off hides its pages and keeps its data.

## Team roles

| Role               | Built in | Access                                              |
| ------------------ | -------- | --------------------------------------------------- |
| Owner              | Yes      | Everything, including billing and closing the store |
| Admin              | Yes      | Everything except billing ownership                 |
| Marketer           | Yes      | Customers, segments, campaigns, automations, social |
| Support agent      | Yes      | Chats and orders                                    |
| Shop counter staff | Yes      | Shop sales, Due book (release 2)                    |

Each area is No access, View or Edit per role, plus three flags: see full phone numbers, export lists, refund. Custom roles are per store.

## Plans and usage

Plans are Free, Starter, Growth and Pro, with a 14-day trial on paid plans, prices plus 15% VAT. Chats AI is a paid add-on; extensions are free. Prices are not final (see [open questions](open-questions.md)).

| Item                    | How it is billed                                                               |
| ----------------------- | ------------------------------------------------------------------------------ |
| SMS                     | Prepaid packs that never expire. Bangla SMS is 70 characters per part.         |
| WhatsApp                | Prepaid ৳ balance through a BSP, at Meta's rate for the category plus a margin |
| Messenger, Instagram DM | Free (Meta does not charge)                                                    |
| AI                      | Each AI feature has its own unit: AI conversations, AI content, Ask Dakly AI   |

## Non-functional requirements

| Area            | Requirement                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phone first     | Every page works at 360 px wide. Long tables become card lists. The sidebar collapses.                                                            |
| Local formats   | ৳ with lakh grouping (৳3,42,800), Asia/Dhaka time, 11-digit `01XXXXXXXXX` phones, 64 districts, 15% VAT                                           |
| Speed           | Customers, chats and orders lists load in under 2 s for a shop with 50,000 customers. New messages show within 5 s. AI replies start within 10 s. |
| Messaging rules | Consent per channel at send time, quiet hours, Meta's 24-hour window, WhatsApp templates outside the window, stop on quality drops                |
| AI safety       | AI never invents prices, discounts or stock, hands complaints and refunds to a person, and every AI message is labelled AI                        |
| Privacy         | Access per area, masked phones, export blocking, data deleted 30 days after a store closes                                                        |
| Security        | 2-step codes by SMS or WhatsApp, device list with remote sign-out, rate limits, card and wallet data only on the gateway's hosted page            |
| Audit           | Who (person or AI) sent each message, confirmed each order, changed stock, refunded money                                                         |
| Scale           | Start on one server; the design must hold millions of customers across shops without a rewrite (see [ADR 0001](../adr/0001-modular-monolith.md))  |

## The design prototype

The design prototype shows layout and flow only. Its sample shop (Urban Trend), numbers, prices and some behaviour are placeholders and in places wrong. The feature docs say what to build; the screenshots show roughly how it looks. See [design/README.md](../design/README.md).
