# Release 1 data design

The release 1 schema and implementation contracts, reviewed before feature code starts. Schema coverage does not mean the feature services or provider integrations are implemented. The schema itself is code: `packages/db/src/schema/*.ts` (Drizzle) and `packages/db/migrations/` (SQL, including the hand-written RLS, grants and functions). These docs explain it.

| Doc                                                | What it answers                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| This page                                          | Which tables exist, who owns them, and what changed from the schema review          |
| [er-diagram.md](er-diagram.md)                     | How the tables connect, in Mermaid diagrams per area                                |
| [isolation-and-access.md](isolation-and-access.md) | RLS, global tables, grants, the cross-store functions, staff access, identity rules |
| [state-machines.md](state-machines.md)             | Every status column, its values and allowed moves                                   |
| [indexes-and-scale.md](indexes-and-scale.md)       | Which query each index serves, growth, partition triggers, retention                |
| [jobs.md](jobs.md)                                 | Every queue and job, its trigger, payload and idempotency key                       |
| [api-routes.md](api-routes.md)                     | Every release 1 HTTP route by feature, with its permission                          |
| [review-fixes.md](review-fixes.md)                 | PR #6 findings, corrections, checks and remaining implementation work               |
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
- FK maintenance needs an unconditional leading index; tenant-prefixed or partial indexes cover only their named queries. See the coverage notes in [indexes-and-scale.md](indexes-and-scale.md). Unique rules that must hold under races are unique indexes, often partial.
- Tenant-owned references also have `(store_id, parent_id)` foreign keys against a unique `(store_id, id)` parent key. RLS alone cannot prove that a referenced parent belongs to the store.

## Tables

After migration 0031 the schema has 95 tables. Column, index and FK counts are taken from the latest snapshot in [er-diagram.md](er-diagram.md).

Release 1 is split into one migration per feature area, in dependency order. The development-only core migrations formerly numbered 0016–0044 are folded into 0016–0024; their final schema and grants are unchanged. The plan catalogue remains a separate data migration because its integration test re-runs it. Each holds its generated tables, then by hand the RLS policies, grants and functions for those tables. A later change is a new migration; a merged one is never edited.

| Migration                             | Schema files                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `0003_stores_and_accounts`            | `stores`, `auth`, `team`, `areas` (with BD areas)                                         |
| `0004_platform_and_admin`             | `admin`, `platform`                                                                       |
| `0005_billing`                        | `billing`                                                                                 |
| `0006_channels_and_contacts`          | `channels`, `contacts`, `contact-memory`                                                  |
| `0007_social`                         | `social`                                                                                  |
| `0008_chats`                          | `chats`                                                                                   |
| `0009_ai`                             | `ai`                                                                                      |
| `0010_products`                       | `products`                                                                                |
| `0011_orders_and_payments`            | `orders`, `payments`, `tasks`                                                             |
| `0012_campaigns_and_automations`      | `campaigns`, `automations`                                                                |
| `0013_analytics`                      | `analytics`                                                                               |
| `0014_partitions_and_maintenance`     | Monthly partitions for `audit_log`, `ai_runs`, `tracked_link_visits`; partition functions |
| `0015_maintenance_store_scan`         | Paginated IDs for all retained stores before retention rollups advance                    |
| `0016_account_security_events`        | Final account history constraint, append-only grants and bounded purge                    |
| `0017_billing_plans_trials`           | Plan trials and coupon duration                                                           |
| `0018_plans_catalogue`                | Verbatim plan catalogue data migration, replayed by its integration test                  |
| `0019_auth_identity_recovery_notices` | Verified email identity, TOTP recovery, security notices and locked Owner contacts        |
| `0020_team_ownership_pagination`      | Ownership transfer and bounded member/store pages                                         |
| `0021_staff_authentication`           | Staff factors, sessions and disable invalidation                                          |
| `0022_staff_audit_support`            | Staff identity links, audit/seals and support access                                      |
| `0023_break_glass_alerts`             | Break-glass alert delivery and final request metadata                                     |
| `0024_staff_account_recovery`         | Final recovery history and locked recovery snapshot                                       |
| `0025_app_role_table_grants`          | App role grants on every earlier table, with no default privileges                        |
| `0026_support_requests_next_page`     | Support request metadata returns one row past the page                                    |
| `0030_move_customers_to_contacts`     | Copies the example `customers` rows into `contacts`, keeping their ids                    |
| `0031_drop_customers`                 | Drops the example `customers` table                                                       |
| `0039_bd_upazila_areas`               | Adds 495 upazilas and fills Bangla names for all areas                                    |

`packages/db/migrations/meta` is written by drizzle-kit and never edited by hand: `_journal.json` lists the migrations in the order the migrator applies them, and each `NNNN_snapshot.json` is the whole schema after that migration, which `drizzle-kit generate` compares with the TypeScript schema to write the next one. G marks a global table.

| Schema file                                                     | Tables                                                                                                                                                                                                                                                              | Owner feature (`packages/core/src/`) |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `stores.ts`                                                     | `stores`, `store_counters`                                                                                                                                                                                                                                          | stores                               |
| `auth.ts`                                                       | `users` G, `sessions` G, `push_subscriptions` G                                                                                                                                                                                                                     | auth                                 |
| `account-security-events.ts`                                    | `account_security_events` G                                                                                                                                                                                                                                         | account-security-events              |
| `team.ts`                                                       | `memberships`, `roles` (custom only)                                                                                                                                                                                                                                | team                                 |
| `platform.ts`                                                   | `audit_log`, `outbox_events` G, `webhook_events` G, `notifications`, `files` (store-less only for staff exports and settlement reports), `maintenance_watermarks` G                                                                                                 | platform, notifications, files       |
| `channels.ts`                                                   | `channel_connections`, `meta_page_subscriptions`, `sms_sender_ids`                                                                                                                                                                                                  | channels                             |
| `contacts.ts`, `consents.ts`, `imports.ts`, `contact-memory.ts` | `contacts`, `contact_identities`, `consents` (+ view `contact_consent_current` in `consents.ts`), `contact_stats`, `contact_match_suggestions`, `contact_merges`, `contact_memories`, `segments`, `imports` (in `imports.ts`), `customer_insights`, `data_requests` | customers, segments                  |
| `chats.ts`                                                      | `conversations`, `messages`, `social_comments`, `saved_replies`, `sms_messages`                                                                                                                                                                                     | chats                                |
| `ai.ts`                                                         | `ai_agent_settings`, `ai_rule_changes`, `knowledge_items`, `knowledge_chunks`, `ai_runs`, `assistant_messages`                                                                                                                                                      | ai-agent, ai, assistant              |
| `products.ts`                                                   | `products`, `product_variants`, `stock_movements`, `restock_requests`                                                                                                                                                                                               | products                             |
| `areas.ts`                                                      | `bd_areas` G                                                                                                                                                                                                                                                        | delivery                             |
| `orders.ts`                                                     | `delivery_zones`, `orders`, `order_items`, `discount_codes`                                                                                                                                                                                                         | orders, delivery                     |
| `payments.ts`                                                   | `payment_gateway_credentials`, `payment_intents`, `payment_events`, `refunds`, `gateway_settlement_lines` G                                                                                                                                                         | payments                             |
| `billing.ts`                                                    | `plans` G, `coupons` G, `subscriptions`, `subscription_items`, `invoices`, `invoice_counters` G, `wallet_ledger`, `usage_events`                                                                                                                                    | billing, usage                       |
| `social.ts`                                                     | `brand_profiles`, `content_pieces`, `posts`, `post_targets`                                                                                                                                                                                                         | social                               |
| `campaigns.ts`                                                  | `whatsapp_templates`, `campaigns`, `campaign_recipients`, `tracked_links`, `tracked_link_visits`, `tracked_link_visit_days`                                                                                                                                         | campaigns                            |
| `automations.ts`                                                | `automations`, `automation_versions`, `automation_runs`, `automation_run_steps`                                                                                                                                                                                     | automations                          |
| `tasks.ts`                                                      | `tasks`                                                                                                                                                                                                                                                             | tasks                                |
| `due-book.ts`                                                   | `due_entries`                                                                                                                                                                                                                                                       | due book                             |
| `analytics.ts`                                                  | `store_daily_metrics`, `platform_daily_metrics` G                                                                                                                                                                                                                   | analytics                            |
| `admin.ts`                                                      | `staff_users` G, `staff_sessions` G, `staff_audit_log` G, `staff_audit_log_days` G, `abuse_reports` G, `support_grants`, `platform_settings` G                                                                                                                      | admin                                |

A feature reads another feature's tables only through that feature's service ([rules/module-boundaries.md](../rules/module-boundaries.md)). Foreign keys across features are fine; queries across features are not.

`knowledge_chunks.token_count` apportions the request's token count by each
chunk's share of the batch's UTF-8 bytes. It is an estimate per chunk. The final
chunk gets the remainder, and `ai_runs.input_tokens` holds the measured total
for the request.

## Bangladesh areas

`bd_areas` uses the Bangladesh Bureau of Statistics list published by UN OCHA on
HDX as [Bangladesh – Subnational Administrative Boundaries, COD-AB v03](https://data.humdata.org/dataset/cod-ab-bgd).
The workbook is `bgd_admin_boundaries.xlsx`, last modified 26 January 2026. HDX
records 1 June 2025 as the dataset review date. Source attribution is Bangladesh
Bureau of Statistics (BBS), published by UN OCHA on the Humanitarian Data Exchange.
HDX lists the licence as [Creative Commons Attribution for Intergovernmental Organisations (CC BY-IGO)](https://creativecommons.org/licenses/by/3.0/igo/).

Bangla names come from the Bangladesh National Portal's [division and district
directory](https://bangladesh.gov.bd/views/district-list) and [upazila directory](https://bangladesh.gov.bd/views/upazila-list).
The portal's site-wide footer shows 17 October 2026 as its last update. We
retrieved the directories on 18 November 2026 and matched upazilas within their
own districts. The 8 divisions and 64 districts keep their existing ids.
We keep the 495 workbook upazilas whose city code is `00`. Each id is the numeric
part of the BBS code. Savar
(`BD30260072`) has id `30260072` and parent district `301` (Dhaka).

## Changes from the schema review

The review proposed 54 tables, and D23 added 2 (56). This design keeps those responsibilities and adds the tables below. The database constraints are implemented; service-level matching, final-send gates and conflict handling remain planned. The later PR #6 review corrections are tracked separately in [review-fixes.md](review-fixes.md).

| Added                       | Why release 1 needs it                                                                                                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contact_match_suggestions` | D27: a self-delivery phone that already belongs to another contact stays on the order and becomes a suggestion for staff; the same list holds name and email look-alikes (feature 03). The review kept no place for a suggestion. |
| `files`                     | Every upload (product photos, post media, knowledge files, imports, exports, sender documents) needs size, type and scan status, and a purge path. The review asked for upload limits and malware checks.                         |
| `imports`                   | Customer, product and POS CSV imports (D6) need mapping, counts and an error report (feature 03, 7-step import).                                                                                                                  |
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
| `content_pieces`            | Saved Library text, type, language, owner and AI provenance; AI telemetry intentionally stores no generated output.                                                                                                               |
| `tracked_link_visits`       | Individual tap times so changing the attribution window can reconstruct historical eligibility.                                                                                                                                   |
| `tracked_link_visit_days`   | Daily visits and unique visitors per link for reports older than the 13 months of raw taps (D31).                                                                                                                                 |
| `maintenance_watermarks`    | Proof that a daily rollup finished, so raw months are never dropped before their summary exists (D31).                                                                                                                            |
| `store_daily_metrics`       | Analytics reads summary tables, never raw events (feature 11). One long table; ANA-1 fixes the metric list.                                                                                                                       |

Other changes from the review, each small:

- `contact_stats` has no return risk. D26 keys return risk on the delivery phone, so it is read from `orders` by `recipient_phone`.
- `orders` keeps the buyer in `buyer_contact_id` and the delivery recipient as a snapshot (`recipient_name`, `recipient_phone`, `recipient_address`, `recipient_district`, `recipient_bd_area_id`), per D26. `is_recipient_buyer` records whether the buyer is the recipient, which decides whether the phone is also saved on the buyer's contact (D27). The stage stays `with_courier` (glossary) rather than the review's `shipped`.
- `ai_agent_settings.test_questions` holds the go-live questions, so the test suite needs no `ai_test_cases` table.
- Built-in roles are code; `memberships.built_in_role` or `memberships.role_id` points at one or the other.
- Notifications are unique per (store, user, dedupe key), which fixes the readiness review's finding that per-user rows and a per-store key cannot both hold.
- Campaigns gain `paused` and `failed` states (readiness review F08-01).
- Payment intents add `voided_at` apart from status (readiness review F04) and one `needs_review` status with a `review_reason`, which also covers unverified manual payments.

## Deferred, and how the schema leaves room

| Later                                                          | Room left now                                                                                                                                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Courier integration (D21)                                      | `orders.courier`, `tracking_code`, `courier_charge_poisha`; add `courier_connections` and `shipments` later                                                                      |
| Shopify and WooCommerce sync (Q13)                             | Contacts/products/orders retain store-scoped external refs; variants use store/source/account/ref uniqueness. Import reconciliation and provider ownership checks remain planned |
| Two-person approval for risky admin actions (D28 says not now) | Every risky action writes `staff_audit_log` with a reason first; an approvals table can gate that one service method later                                                       |
| Organisation above stores (Q11)                                | `subscriptions` is per store; an `organisations` table and `stores.organisation_id` are additive                                                                                 |
| Physical Shop, Due book, Khata (release 2)                     | `physical_shop` extension value; orders can take a new source; due tables are new tables                                                                                         |
| Email campaigns                                                | `consents.channel` already allows `email`; `campaigns.channel` gains `email` by a CHECK change                                                                                   |
| Partitioning of the largest tables                             | Requires a key/FK migration or a different partition design; UUID v7 does not remove PostgreSQL partition-key restrictions. See [indexes-and-scale.md](indexes-and-scale.md)     |

## Table and column review

The reviewed tables each map to a named product responsibility; no second customer model is needed. CUS-1 moved the example `customers` rows into `contacts` and dropped that table. Do not remove buyer and recipient snapshots, order-line prices/costs, issued invoice contents, subscription prices or published workflow graphs merely because current values can be joined elsewhere: those records preserve historical facts.

Derived contact stats, conversation previews and dashboard summaries are useful read models only with one owning writer and a rebuild path. External IDs identify provider records; operation keys identify our requests. They serve different purposes. Optional counters and integration placeholders need a named consumer before feature implementation; their presence is not evidence that synchronization, search latency or provider behavior is ready. JSON is reserved for bounded structures that are not independently filtered. The schema, contracts, migrations and [review resolution](review-fixes.md) must stay consistent.
