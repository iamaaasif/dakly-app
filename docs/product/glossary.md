# Glossary and metrics

One definition for every word and number (decision D13). If two screens show the same label, they show the same value for the same store, period and attribution window. Each metric is built once, in a shared metrics service, and every screen reads from it. If a screen needs a number that is not here, add it here first.

This page is the PRD glossary of 12 November 2026 plus the words the code uses. Where an older definition in a feature doc differs, this page wins; fix the feature doc.

## Words

| Word               | Meaning                                                                                                                                                                                              | In code                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Store              | One shop on Dakly. Every row of shop data belongs to one store. A user may belong to several stores.                                                                                                 | `store`, `storeId`                                    |
| Member             | A user's place in one store, with a role                                                                                                                                                             | `membership`                                          |
| Channel            | Messenger, Instagram, WhatsApp, SMS                                                                                                                                                                  | `channel`                                             |
| Chat               | One conversation with one contact on one connected channel account                                                                                                                                   | `conversation`                                        |
| Window             | The 24 hours after a customer's last message when Meta lets the shop reply freely                                                                                                                    | `windowExpiresAt`                                     |
| Hand-over          | The AI stops and asks a person to answer, with a reason                                                                                                                                              | `handover`                                            |
| Buyer              | The contact placing an order; the purchase belongs to their history and is counted once                                                                                                              | `orders.buyerContactId`                               |
| Delivery recipient | Person receiving an order; name, phone and address form its delivery snapshot. Self-delivery also saves the buyer's supplied own phone under D27; another recipient's details stay only on the order | `recipientName`, `recipientPhone`, `recipientAddress` |
| Order              | A purchase linked to its buyer, with a recipient delivery snapshot, stage and payment status (D26)                                                                                                   | `order`                                               |
| Stage              | Where an order is in fulfilment: To confirm, On hold, To pack, With courier, Delivered, Partly delivered, Returned, Cancelled (Inquiry is a chat flag until Q7 is answered)                          | `stage`                                               |
| COD                | Cash on delivery. The courier collects and pays the shop later.                                                                                                                                      | `cod`                                                 |
| Advance            | Part of the price paid before shipping, by bKash, Nagad or card                                                                                                                                      | `advance`                                             |
| Parcel             | One courier shipment for one order                                                                                                                                                                   | `shipment`                                            |
| Consent            | A contact's yes or no to marketing on one channel. The latest answer wins.                                                                                                                           | `consent`                                             |
| Transactional      | A message about the contact's own order. Needs a phone, not marketing consent.                                                                                                                       | `transactional`                                       |
| Quiet hours        | 9 pm to 9 am store time by default. Marketing waits; transactional messages do not.                                                                                                                  | `quietHours`                                          |
| Campaign           | One message sent to a frozen audience once, after approval                                                                                                                                           | `campaign`                                            |
| Automation         | A recipe that sends messages when a contact does something                                                                                                                                           | `automation`                                          |
| Poisha             | 1/100 of a Taka. All money in code and the database is an integer number of poisha.                                                                                                                  | `amountPoisha`                                        |

## General rules

| Rule                      | Definition                                                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Time zone                 | All dates and periods use the store's time zone (default Asia/Dhaka, GMT+6). A "day" runs 00:00 to 23:59 local time.                                                                                           |
| Period "last 30 days"     | The 30 calendar days ending today, including today. "Previous 30 days" is the 30 days before that. Same pattern for 7, 90 and 365 days.                                                                        |
| Change vs previous period | (current − previous) ÷ previous × 100, one decimal. If previous is 0, show "New" instead of a percentage.                                                                                                      |
| Money                     | Taka, rounded to whole ৳, shown with lakh grouping (৳3,42,800). Order money is the order's item total after discount, excluding delivery charge, unless the label says otherwise.                              |
| Store scope               | Every metric is for the store selected in the store switcher. Nothing is summed across stores except on the billing invoice.                                                                                   |
| Refresh                   | Counts on lists and dashboards update within 5 minutes of the event. Segment membership refreshes nightly at 03:00 local time and on demand when a segment is opened. Each page shows "Updated N minutes ago". |
| Excluded people           | People marked "Not a customer", blocked people and deleted customers never appear in customer counts, segments, campaigns or attribution.                                                                      |

## People

| Term                   | Exact definition                                                                                                                                                                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact                | Any person record in a store. May have an own phone (normalised to 01XXXXXXXXX, 11 digits) or a channel identity without a phone. Buyer identity matching follows the customer rules; a delivery phone, order confirmation or delivery never triggers a merge (D26).                      |
| Lead                   | A contact with a phone number and 0 orders who came from a chat, comment or order link. An own phone saved during self-delivery capture qualifies under D27; a phone held only on a draft or order does not. Shown under "Leads from chats". Not counted in "Total customers".            |
| Customer               | A contact with at least 1 non-cancelled order, or added on purpose as a customer (manual add, import, store sync, POS, khata).                                                                                                                                                            |
| Total customers        | Count of customers in the store after merging duplicates. This is the number on Customers, Dashboard and plan usage. Integrations instead shows "records received" from that source (for example 3,412 Shopify records), with a note: "N merged into existing customers, M had no phone". |
| Walk-in sale           | A shop or POS sale with no phone attached. Counts in sales totals, never creates a customer, never used for messages.                                                                                                                                                                     |
| Not a customer         | A chat contact the team marked as supplier, courier, friend, job seeker, spam or other. Excluded everywhere above.                                                                                                                                                                        |
| Reachable on a channel | Customer has an identifier for the channel (phone for SMS and WhatsApp, PSID for Messenger, IGSID for Instagram; email once email campaigns ship (D20)), has marketing consent for it, and is not blocked.                                                                                |

## Customer lifecycle stages (exclusive)

Every customer is in exactly one stage, so the 6 Dashboard groups always add up to Total customers. Stages are checked top to bottom; the first rule that matches wins.

| Order | Stage (Dashboard label) | Rule                                                                                                                                                                         |
| ----- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Stopped buying          | Last order more than 60 days ago (the store's "inactivity period", editable 30 to 180 days). Customers with 0 orders who were imported more than 60 days ago also land here. |
| 2     | Best customers          | Total net spend in the top 10% of the store's customers, or over ৳20,000, whichever gives fewer people.                                                                      |
| 3     | Slipping away           | 2 or more orders, and days since last order are more than 1.5 × the customer's usual gap between orders.                                                                     |
| 4     | New                     | First order within the last 30 days.                                                                                                                                         |
| 5     | Regulars                | 2 or more orders.                                                                                                                                                            |
| 6     | Bought once             | Exactly 1 order outside the last 30 calendar days, or 0 orders but added as a customer. Earlier stages still take precedence.                                                |

## Ready-made segments (can overlap)

Segments are filters. A customer can be in several. To avoid confusion with the lifecycle stages, segment names never reuse a stage label exactly; the Dashboard links each stage to its matching list, not to a segment.

| Segment              | Rule                                                                                        | Editable          |
| -------------------- | ------------------------------------------------------------------------------------------- | ----------------- |
| New customers        | First order in the last 30 days                                                             | Days              |
| Regular customers    | 2 to 5 orders and last order within 60 days                                                 | Order range, days |
| VIP customers        | Total net spend over ৳30,000 and 8 or more orders                                           | Amount, orders    |
| High-value customers | Total net spend over ৳20,000                                                                | Amount            |
| At-risk customers    | 2 or more orders and past their usual reorder gap by 50% or more, last order within 60 days | Percent           |
| Inactive customers   | No order in 60+ days (inactivity period)                                                    | Days              |
| One-time buyers      | Exactly 1 order, any time                                                                   | None              |
| Repeat buyers        | 2 or more orders                                                                            | None              |

## Customer measures

| Measure                  | Definition                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Orders (per customer)    | Count of the customer's orders that are not cancelled. Returned orders count as orders but not as spend.                                                                                                           |
| Total spent (net spend)  | Sum of item totals after discount of delivered and paid orders, minus returns and refunds. Pending and in-transit orders are not yet included.                                                                     |
| Average order value      | Net spend ÷ delivered orders.                                                                                                                                                                                      |
| Lifetime value           | Same as net spend to date. The prototype's 1.35 × multiplier is dropped. A predicted value can be added later and must be labelled "Predicted".                                                                    |
| Usual gap between orders | Median number of days between consecutive orders. Needs 2 or more orders; shown as "Not enough orders yet" otherwise. Store-level gap is the median across all repeat customers.                                   |
| Favourite category       | Category with the most units bought; ties go to the most recent.                                                                                                                                                   |
| Return risk              | Returned parcels ÷ (delivered + returned parcels) for this phone in this store. Shown only with 2 or more past parcels. 0–20%: Good buyer. 21–49%: Some returns. 50%+: High return risk. No history: New customer. |

## Sales and marketing metrics

| Metric                        | Definition                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orders (Dashboard KPI)        | Count of orders created in the period from every source (chats, order link, Shopify, WooCommerce, POS, shop sales, manual), excluding cancelled.                                                                                                                                                                                                  |
| Sales                         | Item totals after discount of all non-cancelled orders, excluding delivery. Counted on the order's creation day and split by order source. A later return still counts here.                                                                                                                                                                      |
| Delivered sales               | Net spend on delivered and paid orders, using kept items after discount and excluding delivery. A later return or correction restates the order's creation day.                                                                                                                                                                                   |
| New customers (KPI)           | Customers whose first-ever order is in the period.                                                                                                                                                                                                                                                                                                |
| Customers who came back (KPI) | Distinct customers who ordered in the period and had at least one earlier order before the period started.                                                                                                                                                                                                                                        |
| Touch                         | A marketing contact that can earn credit: a WhatsApp message (or email, once email campaigns ship) that was read, any message whose link was tapped, or an SMS that was delivered. Messenger and Instagram DM count when read or tapped. A social post counts only when the customer tapped a Dakly-tracked link in it or started a chat from it. |
| Attribution window            | 1, 3 or 7 days (default 7), set once per store under "How Dakly counts orders" and used by every screen.                                                                                                                                                                                                                                          |
| Attributed order              | A non-cancelled order placed within the window after a touch. Credit goes to the most recent touch only (last touch). One order is never credited twice.                                                                                                                                                                                          |
| Money from marketing          | Sum of attributed order totals (items after discount, excluding delivery), minus any later return. Same number on Dashboard ("Money from Dakly messages"), Analytics headline and Analytics Overview.                                                                                                                                             |
| Orders from marketing         | Count of attributed orders. The Analytics funnel's "Ordered" step uses this same count, so headline and funnel always match.                                                                                                                                                                                                                      |
| Messages sent                 | Messages Dakly handed to a provider in the period (each SMS part counts once as a message, not per part).                                                                                                                                                                                                                                         |
| Delivered rate                | Delivered ÷ sent.                                                                                                                                                                                                                                                                                                                                 |
| Read rate                     | Read ÷ delivered, for WhatsApp, Messenger and Instagram only (email added when email campaigns ship). SMS is excluded from both parts of the fraction.                                                                                                                                                                                            |
| Tap rate                      | Unique people who tapped a link or button ÷ people delivered to. Shown as one decimal. Used on Campaigns, Analytics and the funnel.                                                                                                                                                                                                               |
| Message cost                  | What the store actually paid: SMS parts × its pack rate, WhatsApp messages × Meta's rate for that category plus Dakly's margin. Messenger and Instagram are ৳0.                                                                                                                                                                                   |
| Return per ৳1                 | Money from marketing ÷ message cost, rounded to whole ৳. Hidden when cost is ৳0.                                                                                                                                                                                                                                                                  |
| Campaign status label         | Working well: tap rate at or above the store's 90-day median and at least 1 order. Doing okay: below median, at least 1 order. Needs attention: 0 orders after 3 days. Too early: sent less than 24 hours ago.                                                                                                                                    |
| Repeat purchase rate          | Customers with 2+ orders ÷ customers with 1+ order.                                                                                                                                                                                                                                                                                               |

## Chats and orders metrics

| Metric                         | Definition                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat                           | All messages with one contact on one channel. A new message after a chat is marked Done reopens it.                                                       |
| Needs you                      | Chats where the AI handed over, the customer asked for a person, or the AI is off, and the last message is from the customer.                             |
| AI-handled chat                | A chat where every reply in the last 24 hours was sent by Dakly AI.                                                                                       |
| AI conversation (billing unit) | One contact, one rolling 24-hour window, with at least one AI-written reply. Used to count AI chat usage against the plan or add-on.                      |
| Orders from chats              | Orders whose source is Messenger, Instagram, WhatsApp or a comment, created in the period. Value is the order total including delivery.                   |
| COD with couriers              | Sum of COD amounts of orders marked Delivered whose money the courier has not yet paid to the store. In release 1 staff mark COD collected by hand (D21). |
| Due (baki)                     | Sum of unpaid amounts in the Due book for a person. Payments reduce the oldest debt first.                                                                |

## Formats

- Money: `৳` then the amount with lakh grouping, no decimals unless the amount has poisha: `৳3,42,800`, `৳1,250.50`. One formatter in the web app does this.
- Phone: stored `01712345678`; shown `01712-345678`; masked `01712-XXX678` for roles without the full-phone flag.
- Dates: store time zone, default Asia/Dhaka. Today and yesterday by name, then `7 Nov`, then `7 Nov 2025` for other years.
- Times: `10:03 am`.

Web display helpers live in `apps/web/src/lib/format-money.ts`, `format-date.ts` and
`format-phone.ts`. `formatMoney` accepts safe integer poisha, keeps negative amounts
and exact poisha, and throws `RangeError` for fractional, nonfinite or unsafe inputs.
`formatDate(value, reference, timeZone)` requires a reference instant shared between
server and initial browser render. It never reads the current clock. `formatTime`
also accepts the store time zone; both default to Asia/Dhaka. ISO date inputs must carry
an explicit UTC offset; invalid or ambiguous inputs throw `RangeError`.
`formatDateTime` retains exact dates, minutes and the Asia/Dhaka label for security
history and support deadlines. Relative dates do not replace expiry timestamps.
