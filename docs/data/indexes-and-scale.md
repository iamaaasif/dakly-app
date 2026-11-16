# Indexes and scale

Which query each index serves, how big the tables get, when to partition, and how long rows are kept. The rules are in [database.md](../rules/database.md) and [scale.md](../rules/scale.md).

## How indexes are chosen

- Unrestricted FK maintenance needs an unconditional index with the FK columns first. A partial index or `(store_id, foreign_id)` index does not fully cover lookup by `foreign_id` alone. Composite tenant keys need compatible parent uniqueness; retain useful ID-leading child indexes.
- List screens sort by time inside one store, so their index starts with `store_id` and ends with the sort column.
- Sweeps across stores use a partial index on the due column, limited to rows that can be due. Their size follows the due backlog; a stalled worker can still grow it.
- Rules that must hold under races are unique indexes, often partial. The service catches the unique violation and returns the existing row.

## Hot queries

| Query                                                | Index                                                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Chats list by tab, newest first                      | `conversations (store_id, status, last_message_at)`                                                              |
| My chats                                             | `conversations (store_id, assignee_user_id, status)`                                                             |
| One conversation per contact per channel             | unique `conversations (channel_connection_id, contact_id)`                                                       |
| Messages of a chat, scrolling back                   | `messages (conversation_id, created_at)`                                                                         |
| Webhook dedupe                                       | unique `webhook_events (provider, external_id)`, unique `messages (conversation_id, external_id)`                |
| Delivery receipt finds the message                   | `messages (store_id, external_id)` where outbound; global `provider_message_id` on recipients and run steps      |
| Webhook finds the store                              | partial unique `channel_connections (kind, external_account_id)` where not disconnected                          |
| Customer search by phone prefix or name              | `contacts (store_id, phone text_pattern_ops)`, trigram GIN on `contacts.name`                                    |
| Segment filters                                      | `contact_stats (store_id, lifecycle_stage / last_order_at / net_spend_poisha)`, GIN on `contacts.tags`           |
| Orders board by stage                                | `orders (store_id, stage, created_at)`                                                                           |
| A customer's orders                                  | `orders (store_id, contact_id, created_at)`                                                                      |
| Return risk for a delivery phone (D26)               | `orders (store_id, recipient_phone)` where stage is delivered, partially delivered or returned                   |
| Possible duplicate order                             | `orders (store_id, recipient_phone, created_at)`                                                                 |
| Possible matches for staff, and the flag on an order | `contact_match_suggestions (store_id, status, created_at)`, `(store_id, order_id)`                               |
| Campaign and workflow revenue                        | `orders (store_id, attributed_source_type, attributed_source_id)` where attributed                               |
| On-hold follow-ups due                               | `orders (store_id, follow_up_on)` where on hold                                                                  |
| Product search for the AI and order form             | trigram GIN on `products.name`, GIN on `products.aliases`                                                        |
| Payment callback finds the intent                    | unique `payment_intents (merchant_reference)`, unique `(short_code)`, unique `(gateway, gateway_transaction_id)` |
| User security history                                | `account_security_events (user_id, id)`; newest UUID v7 first, exclusive id cursor                               |
| Order timeline                                       | `audit_log (store_id, entity_type, entity_id, created_at)`                                                       |
| Frequency cap (messaged in the last N days)          | `campaign_recipients (store_id, contact_id, sent_at)`, `automation_run_steps (store_id, contact_id, sent_at)`    |
| Usage meter                                          | `usage_events (store_id, unit, period_start)`; unique `(store_id, unit, reference)` stops double counting        |
| Wallet current balance                               | unique `wallet_ledger (store_id, wallet, revision)`; read greatest revision                                      |
| Admin active member count                            | full `memberships (store_id, status)`                                                                            |
| Frozen campaign batch                                | `campaign_recipients (campaign_id, status, id)`                                                                  |
| Notifications bell                                   | `notifications (store_id, user_id, status, created_at)`                                                          |

Sweep indexes (all partial): `automation_runs (wake_at)` waiting, `automation_runs (claimed_at)` running, `campaigns (scheduled_for)` scheduled, `post_targets (scheduled_for)` scheduled, `post_targets (next_metrics_at)`, `payment_intents (next_check_at)`, `subscriptions (next_renewal_attempt_at)`, `subscriptions (trial_ends_at)` trialing, `channel_connections (token_expires_at)` active, `conversations (ai_resumes_at)`, `contacts (deleted_at)`, `files (expires_at)`, `outbox_events (id)` unpublished.

`knowledge_chunks.embedding` has no vector index. Vectors have 512 dimensions (D31). A store has a few hundred chunks, and the search filters by `store_id` first, so an exact scan is the initial implementation choice; measure the largest and most skewed stores before claiming latency. Add an HNSW index when the largest store passes about 20,000 chunks.

## Growth and partitions

Sizes at 1,000 and 10,000 stores, which tables are partitioned by month, and the triggers for partitioning the rest are in [growth.md](growth.md) (D31). `audit_log`, `ai_runs` and `tracked_link_visits` are partitioned by month from the first migration; `messages`, `webhook_events`, `usage_events`, `campaign_recipients` and `automation_run_steps` are plain tables with written triggers.

## Retention

| Data                                                | Kept                                                                                                                               | How it is removed                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `webhook_events`                                    | 7 days; payload cleared once processed                                                                                             | `purge_webhook_events` (daily)                                                               |
| `outbox_events` (published)                         | 7 days                                                                                                                             | `purge_published_outbox_events` (daily)                                                      |
| `sessions`                                          | Until `expires_at`                                                                                                                 | Maintenance job                                                                              |
| `assistant_messages`                                | 90 days (AI-R6)                                                                                                                    | Maintenance job, by `created_at`                                                             |
| `automation_run_steps`                              | At least 372 days after the run finishes (365-day rebuild plus 7-day maximum lookback); never purge an active run                  | Maintenance joins the run and uses `finished_at`                                             |
| Deleted contacts                                    | 30 days, then purged with their chats                                                                                              | Due sweep, then authorized privileged erasure; ordinary app grants cannot delete all history |
| `contact_memories`                                  | While the contact exists; cleared at once on a deletion request (including Meta data deletion callbacks), deleted with the contact | Service on request; cascade on purge                                                         |
| `files` with `expires_at` (exports, import uploads) | Until `expires_at`                                                                                                                 | Maintenance job deletes the object, then the row                                             |
| `account_security_events`                           | 24 months                                                                                                                          | Owner-only bounded purge function; daily runner remains DB-7                                 |
| `audit_log`                                         | 24 months, then the month is exported to R2 (D31)                                                                                  | Partition dropped by the archive step as the owner role                                      |
| `ai_runs`                                           | 13 months; daily cost and token rollups kept                                                                                       | `drop_expired_partitions()`                                                                  |
| `tracked_link_visits`                               | 13 months; dropped only behind the rollup watermark; daily rows kept with the link                                                 | `drop_expired_partitions()`                                                                  |
| `messages`                                          | 12 months from sending, then archived to R2 by conversation and month                                                              | Maintenance job, per conversation                                                            |
| `notifications`                                     | 90 days                                                                                                                            | Maintenance job, in batches                                                                  |
| `usage_events`                                      | 13 months                                                                                                                          | Maintenance job, in batches                                                                  |
| `staff_audit_log`                                   | At least 7 years (D39)                                                                                                             | Maintenance job as the owner role                                                            |
| Orders, payments, invoices, ledger                  | Life of the store, then the closure rules in ACC-12                                                                                | Store purge                                                                                  |

Retain campaign delivery/read eligibility for the same 372-day attribution horizon. Link taps are kept as individual visits with exact times for 13 months; first/last tap counters on the link are display summaries. Keep linked source/contact routing evidence until the newest relevant visit and source completion have both passed the horizon. Customer erasure takes precedence and removes personal attribution evidence; aggregate metrics may remain where they no longer identify the person. Merge before/after images last only through the seven-day undo window or earlier erasure; preserve the opaque operation key permanently for retry protection.

## Query review and remaining measurements

The review found repeated membership scans within one SQL statement, not an implemented application N+1 loop. On its synthetic fixture (30 selected stores, 20 active memberships each), a full `(store_id, status)` index changed the admin query to indexed lookups: 184 shared buffers and 1.266 ms. This is local evidence, not a production latency guarantee. The corrected schema also adds complete ID-leading indexes for both merge contact links, credential store links, restock variant links, target connections and the settings staff link. A small settings table alone would not justify an index on performance grounds.

Before each feature ships, fetch contacts, variants, consent and stock through bounded batch service APIs. Use keyset cursors with a unique tie-breaker such as `(created_at, id)`; an existing timestamp-only index is not proof of stable paging. Check indexes against each filter and sort: `(store_id, status, time)` cannot directly order all statuses together. Measure consent-view latest-row ordering with long histories and tied times, global trigram/GIN selectivity under tenant skew, and store-filtered vector search. Bound sweeps, queue handoffs, batch sizes and provider work; LIMIT without recovery does not ensure durability. Full-payload load tests remain required.
