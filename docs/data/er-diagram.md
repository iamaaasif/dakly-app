# ER diagram

How the release 1 tables connect. The diagrams are built from the Drizzle snapshot (`packages/db/migrations/meta/0003_snapshot.json`), so they match the migration. Each table lists its key, foreign keys, single-column unique keys and status columns; the schema files have every column.

To keep each diagram readable:

- Each shop table's `store_id` link to `stores` is drawn only in the first diagram. Every shop table has one.
- Links to `users` (who did it), `staff_users` and `files` are drawn only where those tables live.
- Links between areas are listed in the table below and marked `FK` in the column lists.

## Overview

```mermaid
flowchart LR
    stores[Stores, accounts, team] --> channels[Channels, customers, chats]
    stores --> products[Products, orders, payments]
    stores --> billing[Billing]
    channels --> ai[AI]
    channels --> products
    channels --> marketing[Social posts, campaigns, automations]
    ai --> marketing
    billing --> products
    stores --> platform[Platform: audit, outbox, files, tasks, metrics]
```

Links between areas:

| Table                  | Points to                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `automation_run_steps` | `contact_id` → `contacts`                                                             |
| `automation_runs`      | `contact_id` → `contacts`                                                             |
| `campaign_recipients`  | `contact_id` → `contacts`                                                             |
| `contacts`             | `bd_area_id` → `bd_areas`                                                             |
| `messages`             | `ai_run_id` → `ai_runs`                                                               |
| `orders`               | `contact_id` → `contacts`, `conversation_id` → `conversations`                        |
| `payment_intents`      | `invoice_id` → `invoices`                                                             |
| `post_targets`         | `channel_connection_id` → `channel_connections`                                       |
| `posts`                | `ai_run_id` → `ai_runs`                                                               |
| `restock_requests`     | `contact_id` → `contacts`, `conversation_id` → `conversations`                        |
| `social_comments`      | `post_target_id` → `post_targets`                                                     |
| `tasks`                | `contact_id` → `contacts`, `conversation_id` → `conversations`, `order_id` → `orders` |
| `tracked_links`        | `contact_id` → `contacts`                                                             |
| `whatsapp_templates`   | `channel_connection_id` → `channel_connections`                                       |

## Stores, accounts and team

Tables from `stores.ts`, `auth.ts`, `team.ts`, `admin.ts`.

```mermaid
erDiagram
    staff_users |o--o{ platform_settings : "updated_by_staff_id"
    staff_users ||--o{ staff_audit_log : "staff_user_id"
    staff_users ||--o{ staff_sessions : "staff_user_id"
    stores ||--o{ support_grants : "store_id"
    staff_users ||--o{ support_grants : "staff_user_id"
    users |o--o{ support_grants : "approved_by_user_id"
    users ||--o{ push_subscriptions : "user_id"
    users ||--o{ sessions : "user_id"
    stores |o--o{ sessions : "active_store_id"
    stores ||--o| store_counters : "store_id"
    stores ||--o{ memberships : "store_id"
    users |o--o{ memberships : "user_id"
    roles |o--o{ memberships : "role_id"
    users |o--o{ memberships : "invited_by_user_id"
    stores ||--o{ roles : "store_id"
    platform_settings {
        text key PK
        uuid updated_by_staff_id FK
    }
    staff_audit_log {
        uuid id PK
        uuid staff_user_id FK
    }
    staff_sessions {
        uuid id PK
        bytea token_hash UK
        uuid staff_user_id FK
    }
    staff_users {
        uuid id PK
        citext email UK
        text role
        text status
    }
    support_grants {
        uuid id PK
        uuid store_id FK
        uuid staff_user_id FK
        text status
        uuid approved_by_user_id FK
    }
    push_subscriptions {
        uuid id PK
        uuid user_id FK
        text endpoint UK
    }
    sessions {
        uuid id PK
        bytea token_hash UK
        uuid user_id FK
        uuid active_store_id FK
    }
    users {
        uuid id PK
        text phone UK
        citext email UK
        text google_subject UK
    }
    store_counters {
        uuid store_id PK,FK
    }
    stores {
        uuid id PK
        text slug UK
        text status
    }
    memberships {
        uuid id PK
        uuid store_id FK
        uuid user_id FK
        text built_in_role
        uuid role_id FK
        text status
        bytea invite_token_hash UK
        uuid invited_by_user_id FK
    }
    roles {
        uuid id PK
        uuid store_id FK
    }
```

## Platform

Tables from `platform.ts`, `analytics.ts`, `tasks.ts`.

```mermaid
erDiagram
    store_daily_metrics {
        uuid store_id PK,FK
        date day PK
        text metric PK
        text dimension PK
    }
    audit_log {
        uuid id PK
        uuid store_id FK
        uuid actor_user_id FK
        uuid actor_staff_id FK
    }
    files {
        uuid id PK
        uuid store_id FK
        text object_key UK
        text status
        uuid uploaded_by_user_id FK
    }
    notifications {
        uuid id PK
        uuid store_id FK
        uuid user_id FK
        text status
    }
    outbox_events {
        uuid id PK
    }
    webhook_events {
        uuid id PK
        text status
    }
    tasks {
        uuid id PK
        uuid store_id FK
        text source
        text status
        uuid contact_id FK
        uuid conversation_id FK
        uuid order_id FK
        uuid assignee_user_id FK
        uuid created_by_user_id FK
    }
```

## Channels, customers and chats

Tables from `channels.ts`, `contacts.ts`, `chats.ts`.

```mermaid
erDiagram
    contacts ||--o{ conversations : "contact_id"
    channel_connections ||--o{ conversations : "channel_connection_id"
    conversations ||--o{ messages : "conversation_id"
    channel_connections ||--o{ social_comments : "channel_connection_id"
    contacts |o--o{ social_comments : "contact_id"
    conversations |o--o{ social_comments : "conversation_id"
    contacts ||--o{ consents : "contact_id"
    contacts ||--o{ contact_identities : "contact_id"
    channel_connections ||--o{ contact_identities : "channel_connection_id"
    contacts ||--o{ contact_match_suggestions : "contact_id"
    contacts ||--o{ contact_match_suggestions : "matched_contact_id"
    contacts ||--o{ contact_merges : "kept_contact_id"
    contacts ||--o{ contact_merges : "merged_contact_id"
    contacts ||--o| contact_stats : "contact_id"
    channel_connections {
        uuid id PK
        uuid store_id FK
        text kind
        text status
        uuid connected_by_user_id FK
    }
    sms_sender_ids {
        uuid id PK
        uuid store_id FK
        text status
        uuid trade_licence_file_id FK
        uuid nid_file_id FK
        uuid requested_by_user_id FK
    }
    conversations {
        uuid id PK
        uuid store_id FK
        uuid contact_id FK
        uuid channel_connection_id FK
        text channel
        text status
        uuid assignee_user_id FK
    }
    messages {
        uuid id PK
        uuid store_id FK
        uuid conversation_id FK
        uuid author_user_id FK
        text kind
        text status
        uuid ai_run_id FK
        uuid rated_by_user_id FK
    }
    saved_replies {
        uuid id PK
        uuid store_id FK
        uuid created_by_user_id FK
    }
    social_comments {
        uuid id PK
        uuid store_id FK
        uuid channel_connection_id FK
        uuid post_target_id FK
        uuid contact_id FK
        text status
        uuid conversation_id FK
    }
    consents {
        uuid id PK
        uuid store_id FK
        uuid contact_id FK
        text channel
        text status
        text source
        uuid captured_by_user_id FK
    }
    contact_identities {
        uuid id PK
        uuid store_id FK
        uuid contact_id FK
        uuid channel_connection_id FK
        text channel
    }
    contact_match_suggestions {
        uuid id PK
        uuid store_id FK
        uuid contact_id FK
        uuid matched_contact_id FK
        text status
        uuid decided_by_user_id FK
    }
    contact_merges {
        uuid id PK
        uuid store_id FK
        uuid kept_contact_id FK
        uuid merged_contact_id FK
        uuid merged_by_user_id FK
        uuid undone_by_user_id FK
    }
    contact_stats {
        uuid contact_id PK,FK
        uuid store_id FK
        text lifecycle_stage
    }
    contacts {
        uuid id PK
        uuid store_id FK
        integer bd_area_id FK
        text source
        text kind
    }
    imports {
        uuid id PK
        uuid store_id FK
        text kind
        text status
        uuid file_id FK
        uuid report_file_id FK
        uuid created_by_user_id FK
    }
    segments {
        uuid id PK
        uuid store_id FK
        uuid created_by_user_id FK
    }
```

## AI

Tables from `ai.ts`.

```mermaid
erDiagram
    ai_runs |o--o{ assistant_messages : "ai_run_id"
    knowledge_items ||--o{ knowledge_chunks : "knowledge_item_id"
    ai_agent_settings {
        uuid store_id PK,FK
        uuid updated_by_user_id FK
    }
    ai_runs {
        uuid id PK
        uuid store_id FK
    }
    assistant_messages {
        uuid id PK
        uuid store_id FK
        uuid user_id FK
        text role
        uuid ai_run_id FK
    }
    knowledge_chunks {
        uuid id PK
        uuid store_id FK
        uuid knowledge_item_id FK
    }
    knowledge_items {
        uuid id PK
        uuid store_id FK
        text kind
        uuid file_id FK
        text status
        uuid created_by_user_id FK
    }
```

## Products, orders and payments

Tables from `products.ts`, `areas.ts`, `orders.ts`, `payments.ts`.

```mermaid
erDiagram
    bd_areas |o--o{ bd_areas : "parent_id"
    orders ||--o{ order_items : "order_id"
    product_variants ||--o{ order_items : "variant_id"
    bd_areas |o--o{ orders : "recipient_bd_area_id"
    delivery_zones |o--o{ orders : "delivery_zone_id"
    orders |o--o{ orders : "possible_duplicate_of_order_id"
    payment_intents ||--o{ payment_events : "payment_intent_id"
    payment_gateway_credentials |o--o{ payment_intents : "credential_id"
    orders |o--o{ payment_intents : "order_id"
    payment_intents ||--o{ refunds : "payment_intent_id"
    products ||--o{ product_variants : "product_id"
    product_variants ||--o{ restock_requests : "variant_id"
    product_variants ||--o{ stock_movements : "variant_id"
    bd_areas {
        integer id PK
        text kind
        integer parent_id FK
    }
    delivery_zones {
        uuid id PK
        uuid store_id FK
    }
    order_items {
        uuid id PK
        uuid store_id FK
        uuid order_id FK
        uuid variant_id FK
    }
    orders {
        uuid id PK
        uuid store_id FK
        uuid contact_id FK
        uuid conversation_id FK
        text source
        uuid created_by_user_id FK
        integer recipient_bd_area_id FK
        uuid delivery_zone_id FK
        text stage
        text payment_status
        uuid shipped_by_user_id FK
        uuid possible_duplicate_of_order_id FK
    }
    payment_events {
        uuid id PK
        uuid store_id FK
        uuid payment_intent_id FK
        text kind
        text from_status
        text to_status
    }
    payment_gateway_credentials {
        uuid id PK
        uuid store_id FK
        text status
        uuid connected_by_user_id FK
    }
    payment_intents {
        uuid id PK
        uuid store_id FK
        uuid credential_id FK
        uuid order_id FK
        uuid invoice_id FK
        text merchant_reference UK
        text short_code UK
        text status
        uuid verified_by_user_id FK
        uuid created_by_user_id FK
    }
    refunds {
        uuid id PK
        uuid store_id FK
        uuid payment_intent_id FK
        text status
        uuid requested_by_user_id FK
    }
    product_variants {
        uuid id PK
        uuid store_id FK
        uuid product_id FK
        text status
    }
    products {
        uuid id PK
        uuid store_id FK
        text status
    }
    restock_requests {
        uuid id PK
        uuid store_id FK
        uuid variant_id FK
        uuid contact_id FK
        uuid conversation_id FK
        text status
    }
    stock_movements {
        uuid id PK
        uuid store_id FK
        uuid variant_id FK
        text kind
        uuid actor_user_id FK
    }
```

## Billing

Tables from `billing.ts`.

```mermaid
erDiagram
    invoices |o--o{ invoices : "credits_invoice_id"
    coupons |o--o{ invoices : "coupon_id"
    plans ||--o{ subscriptions : "plan_id"
    plans |o--o{ subscriptions : "pending_plan_id"
    coupons {
        uuid id PK
        citext code UK
        text kind
        uuid created_by_staff_id FK
    }
    invoice_counters {
        text financial_year PK
    }
    invoices {
        uuid id PK
        uuid store_id FK
        text number UK
        text kind
        uuid credits_invoice_id FK
        uuid coupon_id FK
        text status
    }
    plans {
        uuid id PK
        text code UK
    }
    subscriptions {
        uuid id PK
        uuid store_id FK,UK
        uuid plan_id FK
        text status
        uuid pending_plan_id FK
    }
    usage_events {
        uuid id PK
        uuid store_id FK
        text source
    }
    wallet_ledger {
        uuid id PK
        uuid store_id FK
        text kind
        uuid actor_user_id FK
        uuid actor_staff_id FK
    }
```

## Social posts, campaigns and automations

Tables from `social.ts`, `campaigns.ts`, `automations.ts`.

```mermaid
erDiagram
    automation_runs ||--o{ automation_run_steps : "run_id"
    automations ||--o{ automation_runs : "automation_id"
    automation_versions ||--o{ automation_runs : "version_id"
    automations ||--o{ automation_versions : "automation_id"
    automation_versions |o--o{ automations : "published_version_id"
    campaigns ||--o{ campaign_recipients : "campaign_id"
    whatsapp_templates |o--o{ campaigns : "whatsapp_template_id"
    posts ||--o{ post_targets : "post_id"
    automation_run_steps {
        uuid id PK
        uuid store_id FK
        uuid run_id FK
        uuid contact_id FK
        text kind
        text channel
    }
    automation_runs {
        uuid id PK
        uuid store_id FK
        uuid automation_id FK
        uuid version_id FK
        uuid contact_id FK
        text status
    }
    automation_versions {
        uuid id PK
        uuid store_id FK
        uuid automation_id FK
        uuid published_by_user_id FK
    }
    automations {
        uuid id PK
        uuid store_id FK
        text status
        uuid published_version_id FK
        uuid created_by_user_id FK
    }
    campaign_recipients {
        uuid id PK
        uuid store_id FK
        uuid campaign_id FK
        uuid contact_id FK
        text status
    }
    campaigns {
        uuid id PK
        uuid store_id FK
        text channel
        uuid whatsapp_template_id FK
        text status
        uuid approved_by_user_id FK
        uuid created_by_user_id FK
    }
    tracked_links {
        uuid id PK
        uuid store_id FK
        text code UK
        text kind
        uuid contact_id FK
    }
    whatsapp_templates {
        uuid id PK
        uuid store_id FK
        uuid channel_connection_id FK
        text status
    }
    brand_profiles {
        uuid store_id PK,FK
        uuid updated_by_user_id FK
    }
    post_targets {
        uuid id PK
        uuid store_id FK
        uuid post_id FK
        uuid channel_connection_id FK
        text status
    }
    posts {
        uuid id PK
        uuid store_id FK
        text kind
        uuid ai_run_id FK
        uuid created_by_user_id FK
        uuid approved_by_user_id FK
    }
```
