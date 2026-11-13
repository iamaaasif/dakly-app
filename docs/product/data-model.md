# Data model and events (product view)

The PRD's entity and event list of 12 November 2026. It says what the product stores and which events exist, in product words. The tables each feature owns, and the changes from the schema review (pending review, Q10), are in each feature doc under Engineering › Data. Where they differ, the feature doc wins.

This tab is the shared vocabulary for engineering. It lists the main records, their key fields and how they connect, the events every module emits, and the background jobs. Field lists are the minimum; engineers may add technical fields (created\_at, updated\_at, deleted\_at and so on are on every record and not repeated).

## Principles

- **Multi-tenant by store.** Every record except User belongs to exactly one Store (`store_id`). Every query is scoped by store; no API returns data across stores.
- **Customer phones and delivery phones are separate.** Buyer phone identities are normalised as `01XXXXXXXXX` and unique per store when present. A contact may start with only a channel identity. Delivery phones are order snapshots, may recur across orders from different buyers, and do not create or merge customer identities (D26).
- **Money in paisa.** Amounts are integers in paisa (৳1 = 100) to avoid rounding errors; shown rounded to whole ৳.
- **Soft delete, then purge.** Deleted customers are hidden at once and purged after 30 days, with their messages anonymised.
- **Events first.** Each change emits an event to an internal bus; metrics, automations, notifications and attribution listen to events instead of reading each other's tables.
- **Audit log.** Changes to consent, roles, billing, due entries, attribution window and AI settings are written to an append-only audit log with who, when, before and after.

## Entities

### Account and team

| Entity             | Key fields                                                                                                                                                                                                  | Notes                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| User               | id, name, mobile, email, password hash, language (bn or en), 2FA on                                                                                                                                         | A person who signs in. Can belong to many stores.                    |
| Store              | id, name, business type, district, address, time zone, currency BDT, how\_you\_sell\[\], size band, logo, brand voice, inactivity days (default 60), attribution window (1, 3 or 7), SMS sender id, plan id | The tenant.                                                          |
| Membership         | store\_id, user\_id, role\_id, status (invited, active, removed), last active                                                                                                                               | Links User to Store.                                                 |
| Role               | store\_id (null for built-in), name, access per area (none, view, edit), see\_full\_phone, download\_lists                                                                                                  | Built-in: Owner, Admin, Marketer, Support agent, Shop counter staff. |
| Extension setting  | store\_id, extension (chats, sales, social\_auto\_post, physical\_shop), on, changed\_by                                                                                                                    | Turning off keeps data.                                              |
| Channel connection | store\_id, type (fb\_page, instagram, whatsapp, sms, shopify, woocommerce, pos), external id, token (encrypted), status, quality rating, expires at                                                         | Tokens stored encrypted with a store-scoped key.                     |

### Customers

| Entity                   | Key fields                                                                                                                                                                                          | Notes                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Contact                  | id, store\_id, phone, name, email, city, district, address, gender, birthday, source, tags\[\], kind (lead, customer, not\_a\_customer), blocked, notes                                             | One per phone per store.                                                                                          |
| Channel identity         | contact\_id, channel (messenger, instagram, whatsapp), external id (PSID, IGSID, wa\_id), profile name                                                                                              | A chat buyer may have no phone. Only buyer identity evidence can support merging; recipient details cannot (D26). |
| Consent                  | contact\_id, channel (whatsapp, sms, messenger, instagram, email), status (granted, withdrawn), source (form, chat, counter, import, store sync), captured by, captured at, evidence (text or link) | Latest row wins; full history kept.                                                                               |
| Customer stats (derived) | contact\_id, orders count, net spend, first order at, last order at, usual gap days, favourite category, stage, return risk                                                                         | Recomputed on order events; read by every screen.                                                                 |
| Segment                  | id, store\_id, name, type (ready\_made, custom), rules (JSON condition tree), member count, refreshed at                                                                                            | Rules use the fields in tab 3.                                                                                    |
| Merge record             | store\_id, kept contact, merged contact, by, at                                                                                                                                                     | Allows undo for 7 days.                                                                                           |

### Chats

| Entity            | Key fields                                                                                                                                                                                                                                  | Notes                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Chat              | id, store\_id, contact\_id, channel, status (open, needs\_you, done), assigned to, AI on, last customer message at, window ends at                                                                                                          | One per contact per channel.                  |
| Message           | id, chat\_id, direction (in, out), author (customer, ai, user id, system), type (text, image, voice, product card, order card, template), body, media url, external id, status (queued, sent, delivered, read, failed), error code, sent at | Also stores comment replies with the post id. |
| AI agent settings | store\_id, on, mode, hours, handover rules, tone, languages, max discount allowed (0 by default)                                                                                                                                            | From tab 4.                                   |
| Knowledge item    | store\_id, type (faq, policy, delivery, payment, file, url), question, answer, source, active                                                                                                                                               | Used for AI answers.                          |
| AI feedback       | message\_id, rating, correction, by                                                                                                                                                                                                         | Good or bad marks on AI replies.              |

### Orders and products

| Entity          | Key fields                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Notes                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Product         | id, store\_id, name, category, description, images\[\], price, compare at price, visible in chats, visible in order link, visible at counter, external ids                                                                                                                                                                                                                                                                                                              |                                                                     |
| Variant         | product\_id, size or option, sku, stock, low stock level                                                                                                                                                                                                                                                                                                                                                                                                                | Stock is per variant.                                               |
| Restock request | variant\_id, contact\_id, created at, notified at                                                                                                                                                                                                                                                                                                                                                                                                                       | The "waiting list".                                                 |
| Order           | id, store\_id, number, contact\_id (buyer; nullable for walk-in), source (messenger, instagram, whatsapp, comment, order\_link, shop\_counter, pos, khata, shopify, woocommerce, manual), stage (inquiry, to\_confirm, to\_pack, with\_courier, delivered, returned, cancelled), item total, discount, delivery charge, COD amount, paid amount, payment method, recipient name, recipient phone, recipient address, recipient area, notes, created by (ai, user, sync) | Buyer owns the purchase; recipient details stay on the order (D26). |
| Order item      | order\_id, variant\_id, name, quantity, unit price, discount                                                                                                                                                                                                                                                                                                                                                                                                            |                                                                     |
| Courier booking | order\_id, courier (steadfast, pathao, redx, carrybee), consignment id, tracking code, status, charge, COD collected, paid to store at                                                                                                                                                                                                                                                                                                                                  | Synced by webhook or polling.                                       |
| Payment         | order\_id or due entry id, amount, method (cash, bkash, nagad, rocket, card, bank, cod), reference, recorded by                                                                                                                                                                                                                                                                                                                                                         |                                                                     |

### Marketing

| Entity                | Key fields                                                                                                                                                                                                              | Notes                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Campaign              | id, store\_id, name, goal, channel, template id, content, audience (segments in and out), status (draft, waiting\_approval, scheduled, sending, sent, cancelled), approved by, scheduled at, cost estimate, actual cost |                                       |
| Recipient             | campaign\_id, contact\_id, status (skipped with reason, queued, sent, delivered, read, tapped, failed), message id, cost                                                                                                | One row per person.                   |
| WhatsApp template     | store\_id, name, category (marketing, utility, authentication), language, body, buttons, Meta status                                                                                                                    | Synced with Meta.                     |
| Workflow (automation) | id, store\_id, name, trigger, steps (JSON graph of send, wait, condition, tag, notify), status (draft, active, paused), version                                                                                         |                                       |
| Enrollment            | workflow\_id, contact\_id, current step, status (active, done, exited with reason), entered at, next run at                                                                                                             |                                       |
| Tracked link          | id, store\_id, short code, target url, source type and id, contact\_id                                                                                                                                                  | `dak.ly/<code>`; taps create touches. |
| Touch                 | id, store\_id, contact\_id, channel, source type (campaign, automation, post), source id, eligible at, kind (delivered, read, tapped)                                                                                   | Input for attribution.                |
| Attribution           | order\_id, touch\_id, money, window days                                                                                                                                                                                | At most one per order (tab 8).        |
| Post                  | id, store\_id, networks\[\], content, media\[\], status (draft, waiting\_approval, scheduled, posted, failed), scheduled at, external ids, insights (reach, reactions, comments, taps)                                  |                                       |
| Content item          | id, store\_id, type (post, message, product description), prompt, output, saved                                                                                                                                         | Content Studio history.               |

### Physical shop

| Entity     | Key fields                                                                                                                                                                                      | Notes                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Shop sale  | is an Order with source shop\_counter; extra fields: device id, local id, cashier, recorded at (device), synced at                                                                              | Offline sales are stored with local id until synced.     |
| Due entry  | id, store\_id, contact\_id, type (baki, payment, write\_off), amount, order\_id, method, note, recorded by                                                                                      | Balance = baki − payments − write-offs; FIFO settlement. |
| Reminder   | contact\_id, type (due, restock, reorder), channel, message id, sent at                                                                                                                         | Enforces the 7-day limit.                                |
| Import job | id, store\_id, type (csv\_customers, khata, pos\_csv, shopify, woocommerce, pos\_api), file, status, counts (read, imported, merged, failed, duplicates, without phone), report url, undo until | Also used for khata photo batches.                       |
| Khata row  | import\_id, page, fields (date, name, phone, item, amount, type), confidence, matched contact, decision (import, skip, merge)                                                                   |                                                          |

### Platform

| Entity                | Key fields                                                                                                                                                          | Notes                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Notification          | id, store\_id, user\_id (or all with access), category, priority, title, why, data, action, status (new, seen, done, snoozed), dedupe key                           | Smart notifications (tab 2).      |
| Plan and subscription | store\_id, plan, status (trial, active, past\_due, cancelled), period start and end, add-ons                                                                        |                                   |
| Usage counter         | store\_id, period, unit (customers, team seats, ai\_conversations, ai\_content, ai\_scans, ai\_voice\_entries, sms\_credits, whatsapp\_balance\_paisa), used, limit | Each AI feature has its own unit. |
| Wallet transaction    | store\_id, type (top\_up, whatsapp\_charge, sms\_pack, refund), amount, balance after, reference                                                                    | WhatsApp prepaid ৳ balance.       |
| Invoice               | store\_id, number, lines, VAT 15%, total, paid by, paid at                                                                                                          |                                   |
| Audit log             | store\_id, actor, action, entity, before, after, at                                                                                                                 | Append only, kept 2 years.        |

## Relationships at a glance

Store 1–N Membership N–1 User. Store 1–N Contact. Contact 1–N Channel identity, Consent, Chat, Order, Due entry, Recipient, Enrollment, Touch. Chat 1–N Message. Order 1–N Order item, Payment; Order 1–1 Courier booking; Order 0–1 Attribution 1–1 Touch. Product 1–N Variant. Campaign 1–N Recipient. Workflow 1–N Enrollment. Import job 1–N Khata row.

## Events

Every event carries `store_id`, `event_id`, `occurred_at`, `actor` (user id, ai, system, integration) and the entity id. Listeners must be idempotent (the same event may arrive twice).

| Area      | Events                                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Account   | user.signed\_up, store.created, store.extension\_changed, member.invited, member.joined, role.changed, channel.connected, channel.disconnected, channel.token\_expiring        |
| Customers | contact.created, contact.updated, contact.merged, contact.deleted, consent.granted, consent.withdrawn, contact.stage\_changed, segment.refreshed                               |
| Chats     | message.received, message.sent, message.status\_changed, chat.handed\_over, chat.assigned, chat.done, ai.reply\_sent, ai.order\_drafted                                        |
| Orders    | order.created, order.stage\_changed, order.cancelled, order.returned, courier.booked, courier.status\_changed, courier.cod\_paid, stock.low, stock.out, restock.notified       |
| Marketing | campaign.approved, campaign.sent, recipient.status\_changed, link.tapped, workflow.started, enrollment.created, enrollment.exited, post.scheduled, post.published, post.failed |
| Analytics | touch.created, attribution.created, attribution.removed, attribution.window\_changed                                                                                           |
| Shop      | sale.created, sale.synced\_offline, due.added, due.payment\_recorded, due.reminder\_sent, khata.rows\_imported, pos.import\_completed                                          |
| Billing   | plan.changed, trial.ending, payment.succeeded, payment.failed, usage.threshold\_reached (80% and 100%), wallet.low\_balance                                                    |

Webhooks for outside systems (release 2): order.created, order.stage\_changed, contact.created, consent.changed, signed with an HMAC secret per store.

## Background jobs

| Job                  | Schedule                                                      | What it does                                                                               |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Segment refresh      | Nightly 03:00 store time, and on open                         | Recomputes members and counts.                                                             |
| Customer stats       | On order events, and nightly full pass                        | Updates stage, net spend, gap, return risk.                                                |
| Campaign sender      | When scheduled time arrives                                   | Sends in batches respecting provider rate limits and quiet hours; writes Recipient status. |
| Workflow runner      | Every minute                                                  | Runs enrollments whose next run time has passed.                                           |
| Courier status sync  | Webhooks; polling every 30 minutes as fallback                | Updates bookings and order stages.                                                         |
| Store sync           | Webhooks from Shopify and WooCommerce; full reconcile nightly | Imports orders, customers, products, consent.                                              |
| POS sync (release 2) | Every 15 minutes                                              | Pulls new sales.                                                                           |
| Social publisher     | At scheduled time                                             | Posts to Meta; retries 3 times over 30 minutes, then marks failed and notifies.            |
| Insights fetch       | Every 6 hours for 7 days after posting                        | Reach, reactions, comments.                                                                |
| Attribution          | On order.created, and on window change (recalc 365 days)      | Creates or removes attribution.                                                            |
| Smart notifications  | Hourly and nightly                                            | Evaluates rules from tab 2, dedupes, notifies.                                             |
| Token watcher        | Daily                                                         | Warns 7 days before Meta tokens expire.                                                    |
| Usage and billing    | Daily, and at period end                                      | Counts usage, sends threshold alerts, renews, invoices.                                    |
| Purge                | Daily                                                         | Deletes soft-deleted data after 30 days, khata photos after 30 days.                       |
