# Jobs

Planned release 1 background jobs: its queue, what starts it, its payload and what makes a second run harmless. The rules are in [jobs.md](../rules/jobs.md); the queues are the nine in [architecture.md](../architecture.md#queues). These contracts guide feature implementation; the schema PR does not implement the handlers. Every payload has `storeId` unless the row says "sweep", and is parsed with a zod schema in the job file.

A job that loses its Valkey entry is found again by a sweep: each sweep calls a `SECURITY DEFINER` function from [isolation-and-access.md](isolation-and-access.md) that returns `(store_id, id)` of due work, then queues one job per row. Sweeps run on a BullMQ repeatable schedule in the `sync` queue (or `payments` and `campaign` where marked) and carry no `storeId` themselves.

## inbound

| Job                      | Started by                          | Payload                     | Makes a rerun harmless                                                               |
| ------------------------ | ----------------------------------- | --------------------------- | ------------------------------------------------------------------------------------ |
| `process-webhook-event`  | Webhook intake after saving the row | `storeId`, `webhookEventId` | `webhook_events.status` is checked; unique `messages (conversation_id, external_id)` |
| `record-delivery-status` | Delivery or read receipt            | `storeId`, `webhookEventId` | Status only moves forward                                                            |
| `process-comment`        | Comment webhook                     | `storeId`, `webhookEventId` | Unique `social_comments (channel_connection_id, external_comment_id)`                |

## ai-reply

AI jobs take a per-store Valkey semaphore (3 at a time, Q15 working assumption). A job that cannot get it is delayed, not failed.

| Job                          | Started by                                                          | Payload                                  | Makes a rerun harmless                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reply-to-customer`          | New inbound message while `responder = ai`                          | `storeId`, `conversationId`, `messageId` | Version check before insert; reply carries `idempotency_key` = message id                                                                                                        |
| `reply-to-comment`           | New comment with auto-reply on                                      | `storeId`, `socialCommentId`             | Comment status checked                                                                                                                                                           |
| `update-conversation-memory` | Chat quiet for 2 hours or moved to done                             | `storeId`, `conversationId`              | One fast-tier call writes `conversations.ai_summary` and merges new facts into `contact_memories` (D30); uses per-conversation message checkpoint and both memory version guards |
| `learn-knowledge-item`       | File or link added to knowledge                                     | `storeId`, `knowledgeItemId`             | Deletes the item's chunks before writing new ones                                                                                                                                |
| `reembed-store`              | Configured embed model changed                                      | `storeId`                                | Re-queues items and products whose `embedding_model` differs                                                                                                                     |
| `embed-product`              | Product created, renamed or main photo changed; embed model changed | `storeId`, `productId`                   | Overwrites `search_embedding`, `image_embedding` and `embedding_model`                                                                                                           |

## transactional

| Job                       | Started by                                 | Payload                                | Makes a rerun harmless                             |
| ------------------------- | ------------------------------------------ | -------------------------------------- | -------------------------------------------------- |
| `send-sign-in-code`       | Sign-in or sign-up request                 | `userId` or target, code id (no store) | Code id in Valkey; sent once                       |
| `send-team-invite`        | Invite created                             | `storeId`, `membershipId`              | Sender idempotency key = invite token hash         |
| `send-order-confirmation` | Order created, confirm by WhatsApp or SMS  | `storeId`, `orderId`                   | Outbound message idempotency key = order id + kind |
| `send-payment-link`       | Advance requested                          | `storeId`, `paymentIntentId`           | Event `sent` recorded once                         |
| `send-notification`       | Outbox event a notification rule matches   | `storeId`, `notificationId`            | Unique `(store_id, user_id, dedupe_key)`           |
| `send-push`               | Notification needing escalation (NOTIF-R2) | `storeId`, `notificationId`            | Notification status checked                        |
| `send-invoice-email`      | Invoice paid                               | `storeId`, `invoiceId`                 | Sender idempotency key = invoice id                |

## outbound

| Job                   | Started by                          | Payload                   | Makes a rerun harmless                                   |
| --------------------- | ----------------------------------- | ------------------------- | -------------------------------------------------------- |
| `send-message`        | Staff or AI reply saved as `queued` | `storeId`, `messageId`    | Message status; provider idempotency key = message id    |
| `publish-post-target` | Due post (from `due_post_targets`)  | `storeId`, `postTargetId` | Status `publishing` set first; `external_post_id` unique |

## campaign

| Job                         | Started by                      | Payload                                     | Makes a rerun harmless                                     |
| --------------------------- | ------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| `build-campaign-audience`   | Campaign scheduled or sent now  | `storeId`, `campaignId`                     | Unique `campaign_recipients (campaign_id, contact_id)`     |
| `send-campaign-batch`       | Audience built, then each batch | `storeId`, `campaignId`, `afterRecipientId` | Only `queued` recipients are picked; status moves forward  |
| sweep `start-due-campaigns` | Every minute                    | none                                        | `due_campaigns`; status moves `scheduled` → `sending` once |

Per-store cap: one running campaign batch per store.

## workflow

| Job                       | Started by                              | Payload                                              | Makes a rerun harmless                                                                      |
| ------------------------- | --------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `start-automation-run`    | Outbox event matching an active trigger | `storeId`, `automationId`, `contactId`, `triggerKey` | Unique `automation_runs (automation_id, contact_id, trigger_key)`                           |
| `continue-automation-run` | Delayed job at `wake_at`, or the sweep  | `storeId`, `automationRunId`, `claimedAt`            | Step identity plus claim-timestamp guard; see lease contract below                          |
| sweep `wake-due-runs`     | Every minute                            | none                                                 | `due_automation_runs` claims due waits or five-minute stale running leases with SKIP LOCKED |

## sync

| Job                         | Started by                                              | Payload                          | Makes a rerun harmless                                               |
| --------------------------- | ------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| `relay-outbox`              | Every second                                            | none (sweep)                     | `claim_outbox_events`, then mark published                           |
| `refresh-post-metrics`      | Sweep `due_post_metrics`, hourly                        | `storeId`, `postTargetId`        | Overwrites metrics                                                   |
| `check-channel-token`       | Sweep `channel_connections_expiring_before`, daily      | `storeId`, `channelConnectionId` | Status only set, notification deduped                                |
| `return-conversation-to-ai` | Sweep `due_conversation_returns`, every minute          | `storeId`, `conversationId`      | Clears `ai_resumes_at` in the same update                            |
| `sync-whatsapp-templates`   | Template webhook, and daily                             | `storeId`, `channelConnectionId` | Upsert on `(channel_connection_id, name, language)`                  |
| `refresh-contact-stats`     | Order or message outbox event                           | `storeId`, `contactId`           | Recomputes the row                                                   |
| `build-daily-metrics`       | Outbox changes within 5 minutes; nightly reconciliation | `storeId`, `day`                 | Upsert on `(store_id, day, metric, dimension)`                       |
| `run-maintenance`           | Daily                                                   | none (sweep)                     | Each step is safe to repeat; see [run-maintenance](#run-maintenance) |

## bulk

| Job                     | Started by                       | Payload                                                       | Makes a rerun harmless                                                                                                             |
| ----------------------- | -------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `run-contact-import`    | Import confirmed                 | `storeId`, `importId`                                         | Phone and `external_ref` are unique per store, so a rerun updates, not duplicates                                                  |
| `run-product-import`    | Product import confirmed         | `storeId`, `importId`                                         | Durable per-import-row results; stock adjustment and row outcome committed atomically                                              |
| `export-contacts`       | Export asked for                 | `storeId`, `fileId`                                           | Writes to the same object key                                                                                                      |
| `rebuild-segment-count` | Segment saved, and nightly       | `storeId`, `segmentId`                                        | Overwrites the count                                                                                                               |
| `merge-contacts`        | Staff confirms a merge           | `storeId`, `keptContactId`, `mergedContactId`, `operationKey` | Permanent unique `(store_id, operation_key)`; an undone or redacted operation stays a no-op                                        |
| `undo-contact-merge`    | Staff undoes within 7 days (D29) | `storeId`, `contactMergeId`                                   | After-state checks preserve later edits; dependent merges block; withdrawals stay effective; `undone_at` set atomically            |
| `purge-contact`         | Sweep `due_contact_purges`       | `storeId`, `contactId`                                        | Authorized privileged erasure with deferred FK checks; redact merge evidence, preserve operation key and permitted order snapshots |

## payments

| Job                    | Started by                                    | Payload                      | Makes a rerun harmless                                                |
| ---------------------- | --------------------------------------------- | ---------------------------- | --------------------------------------------------------------------- |
| `verify-payment`       | Callback or gateway webhook                   | `storeId`, `paymentIntentId` | Status only moves forward; unique `(gateway, gateway_transaction_id)` |
| `check-payment-status` | Sweep `due_payment_checks` (every 15 minutes) | `storeId`, `paymentIntentId` | Same as above; `next_check_at` moves on                               |
| `send-refund`          | Refund requested                              | `storeId`, `refundId`        | Unique `refunds (store_id, idempotency_key)` sent to the gateway      |
| `renew-subscription`   | Sweep `due_subscription_renewals`, hourly     | `storeId`, `subscriptionId`  | Unique `wallet_ledger (store_id, idempotency_key)` per period         |
| `remind-trial-ending`  | Sweep `trials_ending_before`, daily           | `storeId`, `subscriptionId`  | Notification dedupe key per trial                                     |

No job holds a database transaction while it calls the AI model or a vendor: read in one short transaction, call outside, write in a second.

## Workflow lease and provider handoff

`due_automation_runs` claims waiting work whose wake time passed, or running work whose `claimed_at` is at least five minutes old. Each claim updates `claimed_at` and increments `attempts`. The function returns the new `claimed_at` timestamp, truncated to milliseconds for lossless JavaScript Date round-trips, and the queue job carries it as `claimedAt`; a stale worker may neither advance the run nor overwrite a later claim. Workers check the expected step and claim before committing, use a stable `(run_id, step_key)` identity, and refresh or release the lease around bounded local work. Heartbeats compare the expected `claimed_at` and return the replacement timestamp; the worker updates its local token before another write. No database lock is held during a vendor call.

A crash between claiming and enqueueing is recovered by the next stale-lease sweep. This database behavior is tested; exactly-once external delivery is not established by a unique step row. The planned worker must durably record send intent, use provider idempotency when supported, and reconcile unknown outcomes before retrying. Pausing or stopping an old version is checked again before the next step; graph data remains immutable.

## Customer memory

Read a bounded page of new messages after the conversation's `(memory_built_through_message_at, memory_built_through_message_id)` checkpoint. The timestamp survives message retention; the ID breaks ties. One contact may have several independent conversation checkpoints. Read the contact-memory version, conversation memory version, checkpoint and contact ownership before the model call; compare all of them in the final short transaction. A mismatch discards the result and schedules a fresh read. Advance the conversation checkpoint even when the response adds no durable fact, and still update its conversation summary.

Staff edits and model output use `contactMemorySchema`: summary at most 600 characters, at most 40 strict facts, each value at most 160 characters, typed source, source UUID and timestamp, with a 16,384-byte serialized memory limit. The prompt builder selects complete facts and shortens the summary until the rendered context fits both 1,200 UTF-8 bytes and 300 tokens measured by the selected model's tokenizer. If the tokenizer is unavailable, omit memory rather than estimate the token count. Staff facts are not overwritten by model extraction.

Clear empties memory, sets `cleared_at`, increments the contact-memory version and each conversation memory version, and advances every conversation checkpoint to its latest message. New extraction excludes messages and own-order evidence at or before that cutoff; it must not replay old orders into cleared memory. Merge and undo invalidate both memories, preserve correctly owned staff facts and the strictest relevant clear cutoff, and enqueue rebuilds through the outbox. Concurrent or older model writes must fail their guards.

## Metrics and attribution

Order, payment, return and send/tap outbox events schedule bounded summary work that becomes visible within five minutes. Nightly reconciliation recomputes affected days from retained source evidence; it is a repair path, not the only refresh. Late returns and corrections restate the original store-local metric day as defined by ANA-1 and refresh affected totals. Each dashboard exposes summary age. The definitions and handlers remain planned.

Attribution rebuilds cover 365 days plus the maximum seven-day lookback. They read individual `tracked_link_visits`, kept 13 months with exact times ([growth.md](growth.md#link-visits-without-personal-data)). Retain workflow steps for 372 days after their run finishes, never from step creation while the run is active. Campaign eligibility keeps equivalent evidence. A redirect creates one `event_key`; retrying its write reuses the key, while another actual visit gets a new key. First/last tap counters on the link do not replace the visits or the daily rows. See [ADR 0008](../adr/0008-retain-attribution-evidence.md).

## run-maintenance

One daily job, run in this order. Each step works in bounded batches and can be rerun after a crash. The retention for each table is in [growth.md](growth.md).

1. `ensure_monthly_partitions(3)`: create this month and the next three for `audit_log`, `ai_runs` and `tracked_link_visits`. Alert if fewer than two future months exist afterwards.
2. For each finished Asia/Dhaka day after a rollup's `maintenance_watermarks` row, page through `maintenance_store_ids(after, limit)` from a null cursor to an empty page. It includes active, suspended and closing stores; a store remains eligible until permanently purged. Process each store inside `forStore`: link visits into `tracked_link_visit_days`, AI run cost, tokens and counts by purpose into `store_daily_metrics`. Do not use `active_store_ids()` for retention. Upserts make retries safe. Advance the global watermark only after every page and store has finished the day, including stores with no source rows. A failed or unfinished store keeps the watermark unchanged; restart the day's scan from a null cursor on retry. Serialize runs for the same rollup so a stale run cannot overwrite newer progress.
3. `drop_expired_partitions()`: drop AI run and link visit months older than 13 months. It skips any month past the watermark, so a failed step 2 delays deletion instead of losing data.
4. Archive: export each `audit_log` month older than 24 months to R2 as gzipped JSON lines, check the row count, then drop it as the owner role. Export messages older than 12 months the same way, grouped by conversation and month, whether or not the chat is still active, then delete them in batches.
5. Purge in batches of 5,000: published outbox events and webhook events after 7 days, notifications and `assistant_messages` after 90 days, usage events after 13 months, campaign recipients and workflow steps 372 days after their campaign or run finishes, expired sessions and files.
6. Account history: as the owner, call `SELECT public.purge_account_security_events(1000)` in separate short transactions until it returns zero. The SQL exists in migration 0016; the daily runner remains DB-7. It deletes rows strictly older than two years and rejects limits outside 1–1,000. Retrying cannot remove newer events; it needs no store scan. No R2 archive is required for account events.

## Send-time and financial gates

Immediately before calling the provider, recheck consent, block status, channel window, campaign state and frozen routing. A queued recipient, or a sending recipient that has not been handed to the provider, may become skipped with its reason; release reserved cost in that same transition. Never label an already accepted or unknown provider outcome skipped. Messenger identity must belong to the frozen sending connection and selected contact; an address alone is insufficient.

Refund jobs consume a reservation made under the common payment-intent lock. Requested/pending capacity stays reserved until a confirmed result; succeeded and recorded-manually refunds consume captured capacity. Reconciliation, failure release and success accounting use the same intent lock and permanent key. Wallet jobs assign the next per-wallet revision under the shared advisory lock and read balances by revision. The schema bounds amounts and enforces uniqueness; these service protocols require concurrency tests before feature release.

Purge transactions use `SET CONSTRAINTS ALL DEFERRED` before dependent deletion and restore `ALL IMMEDIATE` before commit. This lets SET NULL actions finish before their supplemental NO ACTION tenant-reference checks validate final state. Supplemental CASCADE keys match the original action and ordinary cascading deletes do not require deferral. A failed final check rolls back the purge.

## Account security notices

ACC-7 stores encrypted notices durably. Sign-in and TOTP recovery queue `send-security-notice` on `transactional` with `{ noticeId }` after their transaction commits; the handler claims that one notice under the normal lease. The `send-due-security-notices` job scheduler (`packages/core/src/auth/jobs/`) runs every 30 seconds as the safety net, with batches of 20, two-minute leases and retry backoff capped at one hour. Neither payload has `storeId`: these are global account notices. Both handlers call `SecurityNoticesService`, which makes no vendor call under a database lock and acknowledges only its lease. Worker shutdown waits for the active job. Recovery eligibility begins seven days after all required notices are accepted. Duplicate delivery after uncertain vendor outcomes is possible. This does not implement the general DB-2 event relay.

The worker uses the same JSON/Pino configuration as the API. The dispatcher stores the BullMQ job id in an asynchronous context, and the logger adds it to service and vendor metrics; each scheduled run has its own id. Worker errors use the existing sanitized Sentry payload with `jobId`; a failed run is reported and logged once by the dispatcher and retried by BullMQ.
