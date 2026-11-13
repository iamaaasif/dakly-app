# Indexes and scale

Which query each index serves, how big the tables get, when to partition, and how long rows are kept. The rules are in [database.md](../rules/database.md) and [scale.md](../rules/scale.md).

## How indexes are chosen

- Every foreign key has an index (Postgres does not make one). Most are `(store_id, <fk>)` or the plain FK column.
- List screens sort by time inside one store, so their index starts with `store_id` and ends with the sort column.
- Sweeps across stores use a partial index on the due column, limited to rows that can be due. These stay small however big the table gets.
- Rules that must hold under races are unique indexes, often partial. The service catches the unique violation and returns the existing row.

## Hot queries

| Query                                                | Index                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Chats list by tab, newest first                      | `conversations (store_id, status, last_message_at)`                                                           |
| My chats                                             | `conversations (store_id, assignee_user_id, status)`                                                          |
| One conversation per contact per channel             | unique `conversations (channel_connection_id, contact_id)`                                                    |
| Messages of a chat, scrolling back                   | `messages (conversation_id, created_at)`                                                                      |
| Webhook dedupe                                       | unique `webhook_events (provider, external_id)`, unique `messages (conversation_id, external_id)`             |
| Delivery receipt finds the message                   | `messages (store_id, external_id)` where outbound; global `provider_message_id` on recipients and run steps   |
| Webhook finds the store                              | partial unique `channel_connections (kind, external_account_id)` where not disconnected                       |
| Customer search by phone prefix or name              | `contacts (store_id, phone text_pattern_ops)`, trigram GIN on `contacts.name`                                 |
| Segment filters                                      | `contact_stats (store_id, lifecycle_stage / last_order_at / net_spend_poisha)`, GIN on `contacts.tags`        |
| Orders board by stage                                | `orders (store_id, stage, created_at)`                                                                        |
| A customer's orders                                  | `orders (store_id, contact_id, created_at)`                                                                   |
| Return risk for a delivery phone (D26)               | `orders (store_id, recipient_phone)` where stage is delivered, partially delivered or returned                |
| Possible duplicate order                             | `orders (store_id, recipient_phone, created_at)`                                                              |
| Possible matches for staff, and the flag on an order | `contact_match_suggestions (store_id, status, created_at)`, `(store_id, order_id)`                            |
| Campaign and workflow revenue                        | `orders (store_id, attributed_source_type, attributed_source_id)` where attributed                            |
| On-hold follow-ups due                               | `orders (store_id, follow_up_on)` where on hold                                                               |
| Product search for the AI and order form             | trigram GIN on `products.name`, GIN on `products.aliases`                                                     |
| Payment callback finds the intent                    | unique `payment_intents (merchant_reference)`, unique `(short_code)`, unique `(gateway, gateway_trx_id)`      |
| Order timeline                                       | `audit_log (store_id, entity_type, entity_id, created_at)`                                                    |
| Frequency cap (messaged in the last N days)          | `campaign_recipients (store_id, contact_id, sent_at)`, `automation_run_steps (store_id, contact_id, sent_at)` |
| Usage meter                                          | `usage_events (store_id, unit, period_start)`; unique `(store_id, unit, reference)` stops double counting     |
| Notifications bell                                   | `notifications (store_id, user_id, status, created_at)`                                                       |

Sweep indexes (all partial): `automation_runs (wake_at)` waiting, `campaigns (scheduled_for)` scheduled, `post_targets (scheduled_for)` scheduled, `post_targets (next_metrics_at)`, `payment_intents (next_check_at)`, `subscriptions (next_renewal_attempt_at)`, `subscriptions (trial_ends_at)` trialing, `channel_connections (token_expires_at)` active, `conversations (responder_returns_at)`, `contacts (deleted_at)`, `files (expires_at)`, `outbox_events (id)` unpublished.

`knowledge_chunks.embedding` has no vector index. A store has a few hundred chunks, and the search filters by `store_id` first, so an exact scan is fast and exact. Add an HNSW index when the largest store passes about 20,000 chunks.

## Growth

Rough sizes at 1,000 active shops, each with about 3,000 customers and 300 chats a day. Real numbers come from the beta.

| Table                            | Rows a year | Note                                                |
| -------------------------------- | ----------- | --------------------------------------------------- |
| `messages`                       | 1 billion   | About 10 messages a chat. The largest table by far. |
| `ai_runs`                        | 300 million | One or more a reply. No prompt text stored.         |
| `campaign_recipients`            | 100 million | Depends on campaign use                             |
| `automation_run_steps`           | 100 million | Depends on workflow use                             |
| `audit_log`                      | 100 million | Every order and chat change                         |
| `webhook_events`                 | short-lived | Kept 7 days                                         |
| `contacts`, `contact_identities` | 3 million   | Grows with shops, not with time                     |
| `orders`, `order_items`          | 10 million  |                                                     |

At beta size (tens of shops) every table fits in memory and none of this matters yet. It matters for what is cheap to change later: UUID v7 ids sort by time, and every large table has `created_at`, so partitioning by month later needs no id change.

## Partition triggers

Do not partition before a trigger is hit; plain tables are simpler. When one is hit, write an ADR and partition that table by month on `created_at`.

| Table                                         | Trigger                                                                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `messages`                                    | 200 million rows, or the purge of old messages takes longer than its window         |
| `ai_runs`, `audit_log`                        | 200 million rows                                                                    |
| `campaign_recipients`, `automation_run_steps` | 100 million rows                                                                    |
| `webhook_events`                              | Daily purge deletes more than 5 million rows (switch to dropping a daily partition) |

## Retention

| Data                                                | Kept                                                                                                                               | How it is removed                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `webhook_events`                                    | 7 days; payload cleared once processed                                                                                             | `purge_webhook_events` (daily)                                       |
| `outbox_events` (published)                         | 7 days                                                                                                                             | `purge_published_outbox_events` (daily)                              |
| `sessions`                                          | Until `expires_at`                                                                                                                 | Maintenance job                                                      |
| `assistant_messages`                                | 90 days (AI-R6)                                                                                                                    | Maintenance job, by `created_at`                                     |
| `automation_run_steps`                              | 90 days after the run ends                                                                                                         | Maintenance job, by `created_at`                                     |
| Deleted contacts                                    | 30 days, then purged with their chats                                                                                              | `due_contact_purges`, then a purge job per contact inside `forStore` |
| `contact_memories`                                  | While the contact exists; cleared at once on a deletion request (including Meta data deletion callbacks), deleted with the contact | Service on request; cascade on purge                                 |
| `files` with `expires_at` (exports, import uploads) | Until `expires_at`                                                                                                                 | Maintenance job deletes the object, then the row                     |
| `audit_log`                                         | 2 years                                                                                                                            | Maintenance job as the owner role                                    |
| `staff_audit_log`                                   | 7 years                                                                                                                            | Maintenance job as the owner role                                    |
| Orders, payments, invoices, ledger                  | Life of the store, then the closure rules in ACC-12                                                                                | Store purge                                                          |
