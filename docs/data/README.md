# Release 1 data design

The final database design for release 1, written before feature code starts. The schema itself is code: `packages/db/src/schema/*.ts` (Drizzle) and `packages/db/migrations/` (SQL, including the hand-written RLS, grants and functions). These docs explain it.

| Doc                                                | What it answers                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| This page                                          | Which tables exist, who owns them, and what changed from the schema review          |
| [er-diagram.md](er-diagram.md)                     | How the tables connect, in Mermaid diagrams per area                                |
| [isolation-and-access.md](isolation-and-access.md) | RLS, global tables, grants, the cross-store functions, staff access, identity rules |
| [state-machines.md](state-machines.md)             | Every status column, its values and allowed moves                                   |
| [indexes-and-scale.md](indexes-and-scale.md)       | Which query each index serves, growth, partition triggers, retention                |
| [jobs.md](jobs.md)                                 | Every queue and job, its trigger, payload and idempotency key                       |
| [api-routes.md](api-routes.md)                     | Every release 1 HTTP route by feature, with its permission                          |
| [feature-check.md](feature-check.md)               | The check of each feature against this design, and the gaps still open              |

Sources: the 13 feature docs, [decisions](../product/decisions.md) D1 to D30, the [schema review](https://claude.ai/artifact/QVk9UfT8o7vV8bnpjnVRGS) (Q10) and its five must-fix items, the development readiness review (PR #5), and D26 to D30.

## Conventions

These follow [rules/database.md](../rules/database.md); the column helpers are in `packages/db/src/schema/columns.ts`.

- `id uuid` primary key, UUID v7 made in the app (`packages/db/src/uuid-v7.ts`), so ids sort by time.
- Every shop table has `store_id uuid not null references stores(id)` and an RLS policy.
- Money is `bigint` named `*_poisha`. AI vendor cost is `cost_micro_usd` (millionths of a dollar).
- Status and kind columns are `text` with a `CHECK` built from the value lists in `packages/contracts/src/<feature>.ts`. The API, the web app and Postgres accept exactly the same values.
- Times are `timestamptz`. Store-local days (reports) are `date` computed in the store's time zone.
- JSON only for data the database never filters on, validated by a zod schema.
- Every foreign key has an index. Unique rules that must hold under races are unique indexes, often partial.

## Tables

70 tables: 57 hold shop data under RLS, 13 are global. G marks a global table. The legacy `customers` table from the example feature stays until CUS-1 moves the example to `contacts` and drops it.

| Schema file      | Tables                                                                                                                                                                                     | Owner feature (`packages/core/src/`) |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `stores.ts`      | `stores`, `store_counters`                                                                                                                                                                 | stores                               |
| `auth.ts`        | `users` G, `sessions` G, `push_subscriptions` G                                                                                                                                            | auth                                 |
| `team.ts`        | `memberships`, `roles` (custom only)                                                                                                                                                       | team                                 |
| `platform.ts`    | `audit_log`, `outbox_events` G, `webhook_events` G, `notifications`, `files`                                                                                                               | platform, notifications, files       |
| `channels.ts`    | `channel_connections`, `sms_sender_ids`                                                                                                                                                    | channels                             |
| `contacts.ts`    | `contacts`, `contact_identities`, `consents` (+ view `contact_consent_current`), `contact_stats`, `contact_match_suggestions`, `contact_merges`, `contact_memories`, `segments`, `imports` | customers, segments                  |
| `chats.ts`       | `conversations`, `messages`, `social_comments`, `saved_replies`                                                                                                                            | chats                                |
| `ai.ts`          | `ai_agent_settings`, `ai_rule_changes`, `knowledge_items`, `knowledge_chunks`, `ai_runs`, `assistant_messages`                                                                             | ai-agent, ai, assistant              |
| `products.ts`    | `products`, `product_variants`, `stock_movements`, `restock_requests`                                                                                                                      | products                             |
| `areas.ts`       | `bd_areas` G                                                                                                                                                                               | delivery                             |
| `orders.ts`      | `delivery_zones`, `orders`, `order_items`                                                                                                                                                  | orders, delivery                     |
| `payments.ts`    | `payment_gateway_credentials`, `payment_intents`, `payment_events`, `refunds`                                                                                                              | payments                             |
| `billing.ts`     | `plans` G, `coupons` G, `subscriptions`, `invoices`, `invoice_counters` G, `wallet_ledger`, `usage_events`                                                                                 | billing, usage                       |
| `social.ts`      | `brand_profiles`, `posts`, `post_targets`                                                                                                                                                  | social                               |
| `campaigns.ts`   | `whatsapp_templates`, `campaigns`, `campaign_recipients`, `tracked_links`                                                                                                                  | campaigns                            |
| `automations.ts` | `automations`, `automation_versions`, `automation_runs`, `automation_run_steps`                                                                                                            | automations                          |
| `tasks.ts`       | `tasks`                                                                                                                                                                                    | tasks                                |
| `analytics.ts`   | `store_daily_metrics`                                                                                                                                                                      | analytics                            |
| `admin.ts`       | `staff_users` G, `staff_sessions` G, `staff_audit_log` G, `support_grants`, `platform_settings` G                                                                                          | admin                                |

A feature reads another feature's tables only through that feature's service ([rules/module-boundaries.md](../rules/module-boundaries.md)). Foreign keys across features are fine; queries across features are not.

## Changes from the schema review

The review proposed 54 tables, and D23 added 2 (56). This design has 70. Everything the review cut or merged stays cut or merged; its five must-fix items are built in (see [isolation-and-access.md](isolation-and-access.md)). The 14 additions each answer a release 1 requirement the review's list had no home for:

| Added                       | Why release 1 needs it                                                                                                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contact_match_suggestions` | D27: a self-delivery phone that already belongs to another contact stays on the order and becomes a suggestion for staff; the same list holds name and email look-alikes (feature 03). The review kept no place for a suggestion. |
| `files`                     | Every upload (product photos, post media, knowledge files, imports, exports, sender documents) needs size, type and scan status, and a purge path. The review asked for upload limits and malware checks.                         |
| `imports`                   | Customer CSV import and POS CSV (D6) need mapping, counts and an error report (feature 03, 7-step import).                                                                                                                        |
| `tasks`                     | Follow-ups on a customer (CUS-R7) and the workflow builder's "task for staff" action (D23).                                                                                                                                       |
| `restock_requests`          | Deferred by the review, but D23's back-in-stock template and the AI tool `add_to_restock_list` need the waiting list.                                                                                                             |
| `sms_sender_ids`            | The review's own gap list: sender ID requests with documents.                                                                                                                                                                     |
| `push_subscriptions`        | Web push for staff (feature 10, NOTIF-R2 escalation).                                                                                                                                                                             |
| `assistant_messages`        | Ask Dakly AI history, private per user, kept 90 days (AI-R6).                                                                                                                                                                     |
| `coupons`                   | Admin release 1 scope lists coupons; redemptions need an atomic counter.                                                                                                                                                          |
| `invoice_counters`          | Invoice numbers run per financial year across all stores (PAY-R17).                                                                                                                                                               |
| `contact_merges`            | D29 keeps the 7-day undo for a staff merge. The review cut this table; undo needs the moved ids and the replaced field values.                                                                                                    |
| `contact_memories`          | D30: a short memory per customer per store, so replies can use their sizes, language and past issues.                                                                                                                             |
| `ai_rule_changes`           | Feature 04 promises undo for a taught rule; a version counter alone cannot restore the old values.                                                                                                                                |
| `store_daily_metrics`       | Analytics reads summary tables, never raw events (feature 11). One long table; ANA-1 fixes the metric list.                                                                                                                       |

Other changes from the review, each small:

- `contact_stats` has no return risk. D26 keys return risk on the delivery phone, so it is read from `orders` by `recipient_phone`.
- `orders` keeps the buyer in `contact_id` and the delivery recipient as a snapshot (`recipient_name`, `recipient_phone`, `recipient_address`, `recipient_district`, `recipient_bd_area_id`), per D26. `is_self_delivery` records whether the buyer is the recipient, which decides whether the phone is also saved on the buyer's contact (D27). The stage stays `with_courier` (glossary) rather than the review's `shipped`.
- `ai_agent_settings.test_questions` holds the go-live questions, so the test suite needs no `ai_test_cases` table.
- Built-in roles are code; `memberships.built_in_role` or `memberships.role_id` points at one or the other.
- Notifications are unique per (store, user, dedupe key), which fixes the readiness review's finding that per-user rows and a per-store key cannot both hold.
- Campaigns gain `paused` and `failed` states (readiness review F08-01).
- Payment intents add `voided_at` apart from status (readiness review F04) and one `needs_review` status with a `review_reason`, which also covers unverified manual payments.

## Deferred, and how the schema leaves room

| Later                                                          | Room left now                                                                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Courier integration (D21)                                      | `orders.courier`, `tracking_code`, `courier_charge_poisha`; add `courier_connections` and `shipments` later                |
| Shopify and WooCommerce sync (Q13)                             | `external_ref` on contacts, products, variants and orders, unique per store; sources already in the lists                  |
| Two-person approval for risky admin actions (D28 says not now) | Every risky action writes `staff_audit_log` with a reason first; an approvals table can gate that one service method later |
| Organisation above stores (Q11)                                | `subscriptions` is per store; an `organisations` table and `stores.organisation_id` are additive                           |
| Physical Shop, Due book, Khata (release 2)                     | `physical_shop` extension value; orders can take a new source; due tables are new tables                                   |
| Email campaigns                                                | `consents.channel` already allows `email`; `campaigns.channel` gains `email` by a CHECK change                             |
| Partitioning of the largest tables                             | UUID v7 ids and `created_at` on every large table; triggers in [indexes-and-scale.md](indexes-and-scale.md)                |
