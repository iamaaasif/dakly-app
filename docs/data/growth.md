# Database growth

How each high-volume table stays a manageable size as Dakly goes from a few beta shops to 10,000 stores. Decisions [D31 and D39](../product/decisions.md). Indexes for each query are in [indexes-and-scale.md](indexes-and-scale.md); the jobs that do the work are in [jobs.md](jobs.md#run-maintenance).

The approach is the same for every table: keep in Postgres only what a screen, a rule or a rebuild reads; turn old detail into daily rollups; move what must be kept but is rarely read to R2; and partition a table by month only where whole months expire together, so expiry is a `DROP TABLE` of one partition instead of millions of deletes.

## Assumptions

Numbers per active store per day, averaged across stores. The busiest 5% of shops will be about 10 times this, which matters for per-store indexes but not for totals. Replace these with beta measurements before the first trigger review.

| What                                | Per store per day | Bytes per row with indexes |
| ----------------------------------- | ----------------- | -------------------------- |
| Messages (about 40 chats)           | 400               | 700                        |
| Webhook deliveries                  | 500               | 1,500 (payload jsonb)      |
| Outbox events                       | 600               | 400                        |
| AI model calls                      | 150               | 250                        |
| Audit log rows                      | 100               | 400                        |
| Usage events                        | 150               | 200                        |
| Campaign recipients                 | 150               | 250                        |
| Workflow run steps                  | 100               | 200                        |
| Link taps                           | 40                | 150                        |
| Notifications                       | 50                | 300                        |
| SMS outside chats and campaigns     | 10                | 400                        |
| Orders with their lines             | 30                | 1,200                      |
| New contacts                        | 20                | 800                        |
| Knowledge chunks (total, not daily) | 2,000             | 3,250 (512-dim vector)     |

## Plan per table

| Table                                              | Kept in Postgres                                                     | Partitioning                    | After that                                                                  | Rollup kept                                                        |
| -------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `messages`                                         | 12 months from when each message was created                         | None yet; trigger below         | Archived to R2 by conversation and month, then deleted                      | `contact_memories` summary, `contact_stats`, `store_daily_metrics` |
| `webhook_events`                                   | 7 days; payload cleared once processed                               | None; daily purge in batches    | Deleted                                                                     | none needed                                                        |
| `outbox_events`                                    | 7 days after publish                                                 | None; daily purge in batches    | Deleted                                                                     | none needed                                                        |
| `ai_runs`                                          | 13 months                                                            | Monthly on `created_at`         | Partition dropped by `drop_expired_partitions()`                            | Daily cost, tokens and runs by purpose in `store_daily_metrics`    |
| `account_security_events`                          | 24 months                                                            | None                            | Owner-only `purge_account_security_events(1000)`; daily runner remains DB-7 | not applicable                                                     |
| `audit_log`                                        | 24 months                                                            | Monthly on `created_at`         | Month exported to R2 as gzipped JSON lines, then dropped by the owner       | none; the export is the record                                     |
| `tracked_link_visits`                              | 13 months (exact tap times for the 372-day attribution rebuild)      | Monthly on `occurred_at`        | Partition dropped by `drop_expired_partitions()`                            | `tracked_link_visit_days`: visits, unique visitors, first and last |
| `store_daily_metrics`                              | 24 months (ANA-R8, D39)                                              | None                            | Deleted in batches                                                          | is the rollup                                                      |
| `tracked_link_visit_days`                          | While its link exists                                                | None (one row per link per day) | Deleted with the link                                                       | is the rollup                                                      |
| `usage_events`                                     | 13 months                                                            | None; trigger below             | Deleted in batches once the period started over 13 months ago               | Invoice lines and `store_daily_metrics`                            |
| `campaign_recipients`                              | 372 days after the campaign finishes (attribution rebuild, ADR 0008) | None; trigger below             | Deleted in batches                                                          | Campaign counters and `store_daily_metrics`                        |
| `automation_run_steps`                             | 372 days after the run finishes                                      | None; trigger below             | Deleted in batches                                                          | Workflow counters and `store_daily_metrics`                        |
| `notifications`                                    | 90 days                                                              | None                            | Deleted in batches                                                          | none needed                                                        |
| `sms_messages`                                     | 13 months                                                            | None                            | Deleted in batches                                                          | Delivery and cost in `store_daily_metrics`                         |
| `assistant_messages`                               | 90 days (AI-R6)                                                      | None                            | Deleted in batches                                                          | none needed                                                        |
| `knowledge_chunks`                                 | While the knowledge item exists                                      | None                            | Cascade with the item                                                       | not applicable                                                     |
| `staff_audit_log_days`, `gateway_settlement_lines` | 7 years (ADM-R11, financial records)                                 | None                            | Deleted by the owner after 7 years                                          | not applicable                                                     |
| Orders, ledgers, invoices                          | Life of the store (ACC-12)                                           | None                            | Store purge                                                                 | `store_daily_metrics`                                              |

Rules that come with this plan:

- No foreign key points into a partitioned table. `messages`, `posts`, `content_pieces`, `assistant_messages` and `customer_insights` keep `ai_run_id` as a plain id, because the run it names is deleted after 13 months while the message stays.
- A partitioned table's primary key and every unique index include the partition column. `tracked_link_visits` dedupes on `(store_id, event_key, occurred_at)`: a retried write carries the tap's original time, so the key still catches it.
- The app reaches partitioned rows only through the parent, where the store policy applies. Each partition has RLS on and no grants for `dakly_app`.
- `ensure_monthly_partitions(3)` runs daily and keeps this month plus three ahead. If it stops for three months, writes to these tables fail, so the maintenance job alerts when fewer than two future months exist.
- Raw rows are dropped only behind a recorded rollup. `maintenance_watermarks` holds the last Asia/Dhaka day each rollup has finished for every store. The job rolls up every day after the watermark, not only yesterday. It pages through `maintenance_store_ids(after, limit)` for all retained stores, including suspended and closing stores, and moves the watermark only after the complete scan finishes that day. A failed store or incomplete page leaves the watermark unchanged; a retry restarts the day from a null cursor. `drop_expired_partitions()` skips any month whose last day is past the watermark.
- The app role can drop expired AI run and link visit months, never an audit month. Audit months are dropped by the archive step running as the owner, after the R2 object is written and its row count checked.
- Purges of unpartitioned tables delete in batches of 5,000 rows by primary key, so no single statement holds locks for long or bloats the table at once.

## R2 archives

Archived `audit_log` months and archived messages are kept in R2 for the life of the store (D39). When a store is purged, 30 days after it closes, its archive objects are deleted with the rest of its data. A customer's deletion request also reaches the archive: that customer's archived messages are removed or anonymised, as they are in Postgres. Message objects are named by conversation (`stores/<storeId>/archive/messages/<yyyy-mm>/<conversationId>.jsonl.gz`), so the erasure of a customer (CUS-11) finds them from the customer's conversations and deletes them after the erasure commits.

## Link visits without personal data

ADR 0008 keeps each redirect tap so attribution can be rebuilt. In its lean form a visit stores the link, the time, an event key and `visitor_hash`, an HMAC of the IP address and user agent under a key that changes every day. The raw IP and user agent are never stored, and the hash cannot be joined across days. It exists only to count unique visitors for that day.

Raw taps are kept 13 months, which covers the 365-day attribution rebuild plus its 7-day lookback with exact times, so a rebuild picks the same link a live attribution would. Each night the maintenance job also rolls each finished Asia/Dhaka day into `tracked_link_visit_days` (visits, unique visitors, first and last tap time per link). Reports older than 13 months read these rows; attribution never does.

## Size estimates

Postgres size with indexes, at the plan above. "Steady" is the size once each table has reached its retention; tables kept for the life of the store grow by the yearly figure shown.

| Table                      | Rows a year, 1k stores | Size, 1k stores | Rows a year, 10k stores | Size, 10k stores |
| -------------------------- | ---------------------- | --------------- | ----------------------- | ---------------- |
| `messages` (12 months)     | 146 million            | 100 GB          | 1.5 billion             | 1,000 GB         |
| `audit_log` (24 months)    | 36 million             | 29 GB           | 365 million             | 290 GB           |
| `ai_runs` (13 months)      | 55 million             | 15 GB           | 550 million             | 150 GB           |
| `campaign_recipients`      | 55 million             | 14 GB           | 550 million             | 140 GB           |
| `usage_events`             | 55 million             | 12 GB           | 550 million             | 120 GB           |
| `automation_run_steps`     | 36 million             | 8 GB            | 365 million             | 80 GB            |
| `webhook_events` (7 days)  | 180 million            | 5 GB            | 1.8 billion             | 53 GB            |
| `outbox_events` (7 days)   | 220 million            | 2 GB            | 2.2 billion             | 17 GB            |
| `notifications`            | 18 million             | 1.4 GB          | 180 million             | 14 GB            |
| `sms_messages` (13 months) | 3.7 million            | 1.5 GB          | 37 million              | 15 GB            |
| `tracked_link_visits`      | 15 million             | 2.4 GB          | 146 million             | 24 GB            |
| `knowledge_chunks`         | not by time            | 6.5 GB          | not by time             | 65 GB            |
| Orders and order lines     | 11 million             | 13 GB a year    | 110 million             | 130 GB a year    |
| Contacts                   | 7 million              | 6 GB a year     | 73 million              | 58 GB a year     |
| Daily rollups              | 33 million             | 2.3 GB a year   | 330 million             | 23 GB a year     |
| Total after one year       |                        | about 225 GB    |                         | about 2.25 TB    |
| Total after three years    |                        | about 275 GB    |                         | about 2.75 TB    |

What this means:

- 1,000 stores fit one managed Postgres node with room to spare. Most of the size is message history. The 12-month window applies to each message's age, not to how long a chat has been quiet, so a customer who writes every week still has only 12 months of messages in Postgres; older months of that chat load from R2 when staff scroll back. AI memory does not need them, because the summary in `contact_memories` already carries what matters.
- At 10,000 stores `messages` alone is about 1 TB. That is the point to partition it (trigger below) and to move read-heavy screens to a replica.
- Knowledge vectors use 512 dimensions instead of 1536. OpenAI's `text-embedding-3` models return shortened vectors at a small accuracy cost, and this cuts vector storage from about 15 GB to 6.5 GB at 1,000 stores. Product search and photo vectors use the same size.
- Without the time limits in this plan, message, audit and AI run history alone would add about 130 GB a year at 1,000 stores and never stop growing.

## Triggers

Check these monthly from `pg_stat_user_tables` and the maintenance job's timings. When one is hit, write an ADR with the measurement before changing the table.

| Table                                         | Trigger                                                          | Planned change                                                                                                                                                                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `messages`                                    | 200 million rows, or the nightly archive takes more than an hour | Partition monthly on `created_at`. Move the two dedupe keys (`conversation_id, external_id` and `store_id, idempotency_key`) to a small key table kept 7 days, since a partitioned unique index would need `created_at`. Archive and drop whole months. |
| `webhook_events`                              | Daily purge deletes more than 5 million rows                     | Partition daily on `received_at`; dedupe moves to the key table above.                                                                                                                                                                                  |
| `campaign_recipients`, `automation_run_steps` | 100 million rows                                                 | Partition monthly; frequency-cap lookups already filter by time.                                                                                                                                                                                        |
| `usage_events`                                | 100 million rows                                                 | Partition monthly on `period_start`; the dedupe key gains `period_start`.                                                                                                                                                                               |
| `knowledge_chunks`                            | A store passes 20,000 chunks                                     | Add an HNSW index for that store's searches.                                                                                                                                                                                                            |
| Whole database                                | 500 GB, or p95 chat-list query over 200 ms                       | Read replica for reports and admin; then split the largest stores by `store_id` if one node is not enough.                                                                                                                                              |

## Indexes on growing tables

- Every index on a large table must name the query it serves in [indexes-and-scale.md](indexes-and-scale.md). An index nothing reads costs space and slows every insert.
- Time-ordered UUID v7 ids keep inserts at the right edge of each B-tree, so indexes on new rows stay in memory.
- Indexes on a partitioned table are created on the parent and copied to each new month, so a month's index is dropped with its data.
- `messages` has no store-wide text search index. Search inside a chat is a scan of one conversation, which is small.
