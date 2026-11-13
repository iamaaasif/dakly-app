# Isolation and access

How the schema keeps one store's data away from another, and how the few paths that start without a store get in. The rules are in [multi-tenancy.md](../rules/multi-tenancy.md) and [database.md](../rules/database.md); this page records what the release 1 migration does. The SQL is the hand-written part of `packages/db/migrations/0003_release_1_schema.sql`.

## Roles

| Role        | Used by                     | RLS                                                  |
| ----------- | --------------------------- | ---------------------------------------------------- |
| `dakly`     | Migrations, maintenance job | Owns the tables, so policies do not apply to it      |
| `dakly_app` | API, worker, admin app      | Not an owner, so every policy applies on every query |

No table uses `FORCE ROW LEVEL SECURITY` (schema review must-fix 3). With FORCE, every data migration as the owner would fail its policy checks. The integration test fails if any table turns FORCE on.

## Shop tables

Each of the 55 shop tables has `store_id` and one policy, `<table>_isolation`:

```sql
USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
```

`TenantDatabase.forStore(storeId, ...)` sets `app.store_id` for the transaction. Outside `forStore` the setting is empty, the comparison is null, and the query sees no rows. `store-isolation.int.spec.ts` checks that every table with a `store_id` column has RLS on and a policy that reads `app.store_id`, so a table added later without one fails CI.

Foreign keys skip RLS: Postgres checks a reference as the table owner. A child row in store A could point at a parent in store B if the code passed a foreign id. Rule: a service loads the parent inside `forStore` (which proves it belongs to the store) before writing a child that points at it. Ids from the client are never written into a foreign key unread.

## Global tables

13 tables have no `store_id`: `users`, `sessions`, `push_subscriptions`, `outbox_events`, `webhook_events`, `bd_areas`, `plans`, `coupons`, `invoice_counters`, `staff_users`, `staff_sessions`, `staff_audit_log`, `platform_settings`. They hold sign-in records, reference data, the platform's own records, or rows written before the store is known. Only the auth, admin, billing and platform modules read them, by primary or unique key.

`support_grants` holds a `store_id` and has a policy like any shop table: a store can list the grants on itself, and the admin app reads a grant inside `forStore` for that store.

## Grants

| Grant               | Tables                                                                                                           | Why                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| No UPDATE or DELETE | `audit_log`, `staff_audit_log`, `payment_events`, `wallet_ledger`, `stock_movements`, `usage_events`, `consents` | Records of what happened. A correction is a new row.                              |
| No DELETE           | `orders`, `order_items`, `invoices`, `payment_intents`, `refunds`, `automation_versions`                         | Money and published workflows. Cancel, void or archive instead.                   |
| No UPDATE           | `automation_versions`                                                                                            | A published version never changes; editing makes a new draft.                     |
| INSERT only         | `outbox_events`                                                                                                  | Global table; the relay reads it only through `claim_outbox_events` (must-fix 4). |
| No DELETE           | `webhook_events`                                                                                                 | Purged by `purge_webhook_events` after 7 days.                                    |

Retention purges of append-only tables (audit log after 2 years, staff audit log after 7) run in the maintenance job as `dakly`, never through the app role.

Sending reads consent only through the view `contact_consent_current` (latest row per contact and channel). It is `security_invoker`, so RLS applies to the caller.

## Ways in without a store

Some work starts before the store is known: a webhook names a page id, a payment callback names a reference, a public order page names a slug, a sign-in names a user. Sweeps that find due work look across stores. Each of these goes through one small `SECURITY DEFINER` function that returns only ids. The caller then does the real work inside `forStore` for each returned store.

Every function sets `search_path = pg_catalog, public`, has EXECUTE revoked from PUBLIC and granted to `dakly_app` only (must-fix 6). The integration test checks both for every definer function.

| Function                                      | Returns                                      | Caller                                    |
| --------------------------------------------- | -------------------------------------------- | ----------------------------------------- |
| `store_id_for_channel_account(kind, account)` | store of a connected page, number or account | Webhook intake (Meta, WhatsApp)           |
| `store_id_for_slug(slug)`                     | store for a public page                      | Order link page, opt-out page             |
| `payment_intent_for_reference(reference)`     | store and payment intent                     | Payment callbacks and gateway webhooks    |
| `tracked_link_for_code(code)`                 | store and tracked link                       | Link redirect, SMS opt-out link           |
| `store_id_for_provider_message(id)`           | store of a sent campaign or workflow message | Delivery and read receipts                |
| `stores_for_user(user)`                       | the user's stores and roles                  | Sign-in, store switcher                   |
| `membership_for_invite(token hash)`           | store and membership                         | Accepting a team invite                   |
| `claim_outbox_events(limit)`                  | claimed events (locks with SKIP LOCKED)      | Outbox relay                              |
| `mark_outbox_events_published(ids)`           | count                                        | Outbox relay                              |
| `purge_published_outbox_events(before)`       | count                                        | Maintenance job                           |
| `purge_webhook_events(before)`                | count                                        | Maintenance job                           |
| `due_automation_runs(limit)`                  | runs whose wait ended (claimed)              | Workflow sweeper                          |
| `due_campaigns(as_of)`                        | scheduled campaigns now due                  | Campaign sweeper                          |
| `due_post_targets(as_of)`                     | scheduled posts now due                      | Social sweeper                            |
| `due_post_metrics(limit)`                     | published posts due a metrics refresh        | Social metrics job                        |
| `due_payment_checks(limit)`                   | pending payments due a status check          | Payment reconciliation                    |
| `due_subscription_renewals(as_of)`            | subscriptions due to renew                   | Billing renewal job                       |
| `trials_ending_before(before)`                | trials ending soon                           | Trial reminder job                        |
| `channel_connections_expiring_before(before)` | tokens close to expiry                       | Token check job                           |
| `due_conversation_returns(limit)`             | chats whose "return to AI" time passed       | Chats sweeper                             |
| `due_contact_purges(limit)`                   | contacts deleted more than 30 days ago       | Purge job                                 |
| `active_store_ids()`                          | stores with status `active`                  | Nightly metrics, other per-store fan-outs |
| `admin_store_overview(search, limit)`         | store name, plan, status, member count       | Admin stores list (metadata only)         |

Prefer a job that carries its `storeId` (a delayed BullMQ job per item) over a sweep. Sweeps exist as the safety net for jobs lost in Valkey and for work that is due by time.

## Staff access

The admin app connects as `dakly_app` like the shop app. It never bypasses RLS.

- Platform screens (stores list, plans, coupons, settings) read global tables and `admin_store_overview`, which returns metadata and counts, no customer or order content.
- Opening one store's data needs a `support_grants` row: requested by staff, approved by the shop owner from inside the shop app, read or write, with an expiry. The admin service checks the grant, then reads inside `forStore` for that store. Every read and write is written to `staff_audit_log` with a reason.
- Risky actions (store deletion, large refunds or credits, bulk price changes, global AI pause, break-glass) need one staff member with the right role, a reason and a confirmation; no second approver (D28). They all run through one admin service method that writes `staff_audit_log` before the change and fails if that write fails. Two-person approval, if wanted later, is a table and a check in that one method; the audit record stays as it is.

## Customer identity (D26, D27)

The schema keeps the buyer and the delivery recipient apart, and nothing merges contacts on its own:

- `orders.contact_id` is the buyer: the contact who chatted or placed the order.
- `orders.recipient_name`, `recipient_phone`, `recipient_address`, `recipient_district`, `recipient_bd_area_id` are a snapshot of who receives it. `orders.is_self_delivery` says whether that is the buyer (the default).
- `contacts.phone` is the person's own phone, one contact per phone per store (partial unique index `contacts_store_id_phone_key`). It is saved when the buyer gives it for an order to themselves, including during chat capture before the order exists (D27), from a WhatsApp sender identity (then `phone_verified_at` is set), from an import, or by a staff edit. Once set, only a direct profile edit changes it. Saving it is not verification, not a merge and not marketing consent.
- If the phone already belongs to another contact, the unique index refuses the save (also when two saves race). The service keeps the phone on the order only and writes a `contact_match_suggestions` row (`reason = same_phone`, with `order_id` or `conversation_id`). Staff merge or dismiss it; the order is never blocked.
- A phone for another recipient (`is_self_delivery = false`) stays only on the order and never touches a contact.
- Return risk is read from `orders` by `recipient_phone` (index `orders_store_id_recipient_phone_outcome_idx`), so it follows the delivery phone, not the contact.
- AI order tools read only orders of this conversation or of a WhatsApp-verified identity (must-fix 1). A saved but unverified phone gives no access to other orders.
- A contact's `kind` is `customer` while it has at least one order that is not cancelled (D27). The orders service asks the customers service to update it when an order is created or cancelled.
