# Jobs

Every release 1 background job: its queue, what starts it, its payload and what makes a second run harmless. The rules are in [jobs.md](../rules/jobs.md); the queues are the nine in [architecture.md](../architecture.md#queues). Every payload has `storeId` unless the row says "sweep", and is parsed with a zod schema in the job file.

A job that loses its Valkey entry is found again by a sweep: each sweep calls a `SECURITY DEFINER` function from [isolation-and-access.md](isolation-and-access.md) that returns `(store_id, id)` of due work, then queues one job per row. Sweeps run on a BullMQ repeatable schedule in the `sync` queue (or `payments` and `campaign` where marked) and carry no `storeId` themselves.

## inbound

| Job                      | Started by                          | Payload                     | Makes a rerun harmless                                                               |
| ------------------------ | ----------------------------------- | --------------------------- | ------------------------------------------------------------------------------------ |
| `process-webhook-event`  | Webhook intake after saving the row | `storeId`, `webhookEventId` | `webhook_events.status` is checked; unique `messages (conversation_id, external_id)` |
| `record-delivery-status` | Delivery or read receipt            | `storeId`, `webhookEventId` | Status only moves forward                                                            |
| `process-comment`        | Comment webhook                     | `storeId`, `webhookEventId` | Unique `social_comments (channel_connection_id, external_comment_id)`                |

## ai-reply

AI jobs take a per-store Valkey semaphore (3 at a time, Q15 working assumption). A job that cannot get it is delayed, not failed.

| Job                          | Started by                                                          | Payload                                  | Makes a rerun harmless                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reply-to-customer`          | New inbound message while `responder = ai`                          | `storeId`, `conversationId`, `messageId` | Version check before insert; reply carries `idempotency_key` = message id                                                                                                  |
| `reply-to-comment`           | New comment with auto-reply on                                      | `storeId`, `socialCommentId`             | Comment status checked                                                                                                                                                     |
| `update-conversation-memory` | Chat quiet for 2 hours or moved to done                             | `storeId`, `conversationId`              | One fast-tier call writes `conversations.ai_summary` and merges new facts into `contact_memories` (D30); skips when `built_through_message_id` is already the last message |
| `learn-knowledge-item`       | File or link added to knowledge                                     | `storeId`, `knowledgeItemId`             | Deletes the item's chunks before writing new ones                                                                                                                          |
| `reembed-store`              | Configured embed model changed                                      | `storeId`                                | Re-queues items and products whose `embedding_model` differs                                                                                                               |
| `embed-product`              | Product created, renamed or main photo changed; embed model changed | `storeId`, `productId`                   | Overwrites `search_embedding`, `image_embedding` and `embedding_model`                                                                                                     |

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

| Job                       | Started by                              | Payload                                              | Makes a rerun harmless                                            |
| ------------------------- | --------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| `start-automation-run`    | Outbox event matching an active trigger | `storeId`, `automationId`, `contactId`, `triggerKey` | Unique `automation_runs (automation_id, contact_id, trigger_key)` |
| `continue-automation-run` | Delayed job at `wake_at`, or the sweep  | `storeId`, `automationRunId`                         | Unique `automation_run_steps (run_id, step_key)`                  |
| sweep `wake-due-runs`     | Every minute                            | none                                                 | `due_automation_runs` claims with SKIP LOCKED                     |

## sync

| Job                         | Started by                                         | Payload                          | Makes a rerun harmless                                                     |
| --------------------------- | -------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| `relay-outbox`              | Every second                                       | none (sweep)                     | `claim_outbox_events`, then mark published                                 |
| `refresh-post-metrics`      | Sweep `due_post_metrics`, hourly                   | `storeId`, `postTargetId`        | Overwrites metrics                                                         |
| `check-channel-token`       | Sweep `channel_connections_expiring_before`, daily | `storeId`, `channelConnectionId` | Status only set, notification deduped                                      |
| `return-conversation-to-ai` | Sweep `due_conversation_returns`, every minute     | `storeId`, `conversationId`      | Clears `responder_returns_at` in the same update                           |
| `sync-whatsapp-templates`   | Template webhook, and daily                        | `storeId`, `channelConnectionId` | Upsert on `(channel_connection_id, name, language)`                        |
| `refresh-contact-stats`     | Order or message outbox event                      | `storeId`, `contactId`           | Recomputes the row                                                         |
| `build-daily-metrics`       | Nightly per `active_store_ids`                     | `storeId`, `day`                 | Upsert on `(store_id, day, metric, dimension)`                             |
| `run-maintenance`           | Daily                                              | none (sweep)                     | Purges by time; see [indexes-and-scale.md](indexes-and-scale.md#retention) |

## bulk

| Job                     | Started by                       | Payload                                       | Makes a rerun harmless                                                                                         |
| ----------------------- | -------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `run-contact-import`    | Import confirmed                 | `storeId`, `importId`                         | Phone and `external_ref` are unique per store, so a rerun updates, not duplicates                              |
| `export-contacts`       | Export asked for                 | `storeId`, `fileId`                           | Writes to the same object key                                                                                  |
| `rebuild-segment-count` | Segment saved, and nightly       | `storeId`, `segmentId`                        | Overwrites the count                                                                                           |
| `merge-contacts`        | Staff confirms a merge           | `storeId`, `keptContactId`, `mergedContactId` | Partial unique `contact_merges (merged_contact_id)` while not undone; merged contact soft-deleted, moves by id |
| `undo-contact-merge`    | Staff undoes within 7 days (D29) | `storeId`, `contactMergeId`                   | `undone_at` set in the same transaction as the moves back                                                      |
| `purge-contact`         | Sweep `due_contact_purges`       | `storeId`, `contactId`                        | Deletes are by id                                                                                              |

## payments

| Job                    | Started by                                    | Payload                      | Makes a rerun harmless                                           |
| ---------------------- | --------------------------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| `verify-payment`       | Callback or gateway webhook                   | `storeId`, `paymentIntentId` | Status only moves forward; unique `(gateway, gateway_trx_id)`    |
| `check-payment-status` | Sweep `due_payment_checks` (every 15 minutes) | `storeId`, `paymentIntentId` | Same as above; `next_check_at` moves on                          |
| `send-refund`          | Refund requested                              | `storeId`, `refundId`        | Unique `refunds (store_id, idempotency_key)` sent to the gateway |
| `renew-subscription`   | Sweep `due_subscription_renewals`, hourly     | `storeId`, `subscriptionId`  | Unique `wallet_ledger (store_id, idempotency_key)` per period    |
| `remind-trial-ending`  | Sweep `trials_ending_before`, daily           | `storeId`, `subscriptionId`  | Notification dedupe key per trial                                |

No job holds a database transaction while it calls the AI model or a vendor: read in one short transaction, call outside, write in a second.
