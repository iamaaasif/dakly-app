# Architecture

This page is the short version for working in the code. What each feature does is in [features/](features/); how to build one is in [development/](development/). The original long-form [architecture doc](https://claude.ai/artifact/7fyrptKfhe9WNvH4pQTsQJ) is kept for history.

```text
apps/
  api/        NestJS HTTP API on Fastify, webhook intake. Imports feature modules from core.
  worker/     NestJS without HTTP. Same modules; runs BullMQ jobs and registers the job schedulers.
  web/        Next.js shop app.
  admin/      Next.js staff app at admin.dakly.app (not built yet).
packages/
  ui/         Generic UI components and theme tokens for web and admin (not built yet).
  core/       Features (contacts/, later chats/, orders/, products/, social/, ai/, billing/)
              and platform/ (config, errors, tenancy, database, queue).
  contracts/  zod schemas and response types shared by api and web.
  db/         Drizzle schema, migrations, RLS policies.
  providers/  Driver interfaces and vendor drivers (Meta, WhatsApp BSP, bKash, Nagad, City Bank, SMS, email, OpenAI).
```

Dependencies point one way: `apps → core → (db, contracts, providers)`. `platform/` is the base inside core; features depend on it, never the reverse.

## Request path

1. Request reaches `apps/api`. (Auth middleware, not built yet, verifies the session and sets `request.storeId`.)
2. `StoreGuard` rejects requests with no store.
3. The controller parses input with a zod schema and calls a service.
4. The service applies rules and calls repositories, other features' services and drivers.
5. Repositories run queries inside `TenantDatabase.forStore`, so Postgres RLS limits every query to that store.
6. Errors are `AppError`s, turned into `{ error: { code, message } }` by `AppErrorFilter`.

`apps/admin` forwards the client's `X-Forwarded-For` to the API (`apps/admin/src/lib/require-staff.ts`), so the API reads the staff member's address, not the admin server's. This is safe only if the admin server's address is in `API_TRUSTED_PROXIES` and Cloudflare's addresses are not.

## Store transactions

Services inject `StoreTransaction` from the global `DatabaseModule` and call `run(storeId, work)` around one atomic action. They call other features through their exported services; every participating repository still uses `TenantDatabase.forStore`. Nested calls for the same store share the open transaction. A different store throws; an error that escapes the action rolls back all its writes. There are no nested savepoints.

`runForNewStore(work)` generates a UUID v7 and passes it to `work` as the store id, so the store and its dependent rows can be created together. Both methods return the action's result without exposing Drizzle to services. Standalone repository calls still open their own transaction.

Await all work inside the action and keep vendor calls outside it. Each asynchronous request has its own scope, including concurrent requests for the same store. A scope closes when its action settles; delayed callbacks inherited from that scope are rejected rather than using a released connection or committing extra writes.

Global `users` and `sessions` use their own database operations outside the store action. They do not join it or roll back with it. Account creation commits the user and initial session first; ACC-16 then commits store setup and updates the session afterwards. If setup fails, the user resumes business details. If the session update fails, a retry finds the owned store rather than creating another ([account flow](features/01-account-and-team.md)).

## Runtime

Beta runs on one DigitalOcean Droplet; managed PostgreSQL and managed Valkey (Redis); Cloudflare R2 for files; Cloudflare in front. The API and worker scale out separately when needed. See ADR 0001 for when parts split out of the monolith.

## What is built

Only the skeleton: platform pieces, the `contacts` feature, driver interfaces for channels and payments, and the web feature-folder example. Auth is the next piece; until it exists every store route returns `401 STORE_REQUIRED`.

## API conventions

- REST over HTTPS, JSON. No `/v1` prefix in release 1 because the web app ships with the API ([rules/api-design.md](rules/api-design.md)); add it when an outside client exists. Request and response types come from `packages/contracts` so the web app and API can't drift.
- Auth by secure HttpOnly session cookie for the web app; API keys per store (release 2) for outside systems.
- Every request resolves the store from the verified session. A store id is never read from the body, query string or a header (CLAUDE.md). Switching store changes the session.
- Lists use cursor pagination (`?cursor=&limit=`, max 100).
- Writes that can be retried accept an `Idempotency-Key` header.
- Errors use one shape: `{ error: { code, message } }`, plus `fields` for validation errors, with stable codes the web app can translate to Bangla later.
- Rate limits per user and per store, returned in headers.
- Bulk actions return a job id; the client watches progress over Server-Sent Events or WebSocket.

## Real time

- Server-Sent Events, not WebSockets ([P1](plans/plumbing-channels-contacts.md#decisions-for-this-plan)). Each signed-in tab opens one `GET /events/stream`. The stream belongs to the session's current store and user; the browser never names a store.
- Every message carries the notification id as its SSE `id`. A reconnecting browser sends `Last-Event-ID`, and the API first sends that user's rows with a greater id (UUID v7, so later rows; at most 100, the list route has the rest), then live ones. Each open stream sends a row once.
- Live delivery: `NotificationsService.notify` publishes `notification.created` through the outbox. Its subscriber job `StreamNotificationOnCreated` (`transactional`) publishes the notification and user ids on the Valkey channel `notifications:<storeId>`. Each API process holds one subscriber connection, separate from its command connection because Valkey keeps a subscriber in subscribe mode, and joins a store's channel while that store has an open stream. For a message, the API reads the row by id for each matching stream's own store and user, so the channel carries only ids and a stream never sends another user's row.
- Every 25 seconds the stream sends a `: heartbeat` comment after checking the session and the membership again through `SessionsService` and `TeamService`. When either has ended, the API closes the stream. On shutdown it closes all streams so the HTTP server can stop.
- Later features (new messages, assignment changes, order stage changes, job progress) add their events to the same stream. Push notifications to phones go through Web Push (HOME-5).

## Events (outbox)

1. A service changes its tables and calls `OutboxService.publish(event)` (`platform/outbox/`) inside the same `StoreTransaction.run`; the row takes the event's `storeId`, and an event for another store than the open transaction is rejected. It parses the event with the catalogue schema in `packages/contracts/src/events/` and inserts one `outbox_events` row; outside a store transaction it throws `STORE_TRANSACTION_REQUIRED`. A rolled-back change leaves no event.
2. The `relay-outbox` job scheduler runs every second on `transactional`. Each run claims up to 100 rows through `claim_outbox_events` in one statement, then, with no transaction open, queues one job per subscriber with `addBulk` under job id `<eventId>-<subscriber>`, then marks the rows through `mark_outbox_events_published`.
3. A subscriber is a job class marked `@HandlesEvent(type, { queue })`; its class name is its job name, and the queue's dispatcher runs it like any job ([rules/jobs.md](rules/jobs.md#event-subscribers)). Its job data is the event's `id`, `storeId`, `type`, `payload` and `occurredAt`. Each subscriber retries on its own. An event with no subscriber is marked published with nothing queued, so a new subscriber only receives events relayed after every worker runs it.
4. A run that stops after queueing and before marking leaves its rows claimed; a minute later another run claims them again, and the job ids drop the repeats because completed subscriber jobs are kept an hour. A relay outage longer than that can queue a job twice, so consumers stay idempotent.
5. A row is claimed at most 10 times. When queueing or marking fails on a row's tenth claim, the relay logs one error line with the parked event ids and types (never the payload or store) and the job fails with `OUTBOX_EVENTS_PARKED`; the dispatcher reports it to Sentry once, tagged `errorCode: OUTBOX_EVENTS_PARKED`. The row stays unpublished with `attempts` 10 and is no longer claimed. Staff must keep a Sentry alert rule that sends events with that error code to the staff Slack channel. To replay a parked row, fix the cause first, then as the admin role run `update outbox_events set attempts = 0, claimed_at = null where id = '<event id>'`; the next relay claims it.
6. Order is best effort. Rows are claimed in id order (UUID v7, made at publish time), so with one relay run at a time and one worker, events one store publishes one after another, each committed before the next, reach a `bulk` subscriber in that order. Transactions that commit out of order or in the same millisecond, a re-claimed row, overlapping relay runs, several workers, five jobs at once on `transactional` and later retries can all change the order, so a subscriber that needs order checks it itself, for example by `occurredAt`.
7. Moving to Kafka later only replaces the relay's publish step; modules don't change.

Pending review: cross-store workers read due work through SECURITY DEFINER functions with a fixed `search_path`, and the outbox is a global table, so a worker never needs to bypass RLS.

## Queues

| Queue           | Examples                                                                | Priority |
| --------------- | ----------------------------------------------------------------------- | -------- |
| `inbound`       | Process Meta, WhatsApp, payment and store webhooks                      | Highest  |
| `ai-reply`      | Generate and send AI chat replies                                       | High     |
| `transactional` | Order confirmations, shipping updates, OTP, receipts                    | High     |
| `outbound`      | Send one message through a provider                                     | Medium   |
| `campaign`      | Expand an audience into recipients, then feed `outbound` in batches     | Low      |
| `workflow`      | Run due workflow steps                                                  | Medium   |
| `sync`          | Shopify and WooCommerce sync (Q13), Meta insights; courier status later | Low      |
| `bulk`          | Imports, exports, segment rebuilds, attribution recalculation           | Lowest   |

Repeating sweeps are BullMQ job schedulers that the worker upserts at startup under fixed ids, one job per interval across all workers ([rules/jobs.md](rules/jobs.md)). Today they are the account security notice sweep and the staff alert relay on `transactional` and staff audit maintenance on `bulk`, each every 30 seconds, and the outbox relay on `transactional` every second. Sign-in and TOTP recovery store their security notices, then queue one `send-security-notice` job per notice on `transactional`; the worker sends it, so no request waits for an email or SMS vendor. If queueing fails, the request still succeeds and the sweep sends the stored notice.

Per-store concurrency limits on `campaign`, `bulk` and `sync` stop one shop from filling a queue. Failed jobs retry with exponential backoff, then move to a dead-letter list with an alert.
| `payments` | Payment intent checks, renewals, reconciliation | High |

Per-store fairness for AI replies uses a Valkey semaphore (concurrency 3 per store, Q15), not BullMQ Pro groups.

## Files

- Cloudflare R2 bucket per environment; object keys `stores/<store_id>/<kind>/<uuid>`.
- Uploads go from the browser straight to R2 with a short-lived presigned URL; the API records the file after upload.
- Downloads use signed URLs valid 15 minutes. Public order-link product images are served through Cloudflare with a public, cache-friendly path that contains no personal data.
- Lifecycle rules: exports deleted after 7 days, khata photos after 30 days.

## Key flows

### 1. Inbound message and AI reply

1. Meta (or the WhatsApp BSP) posts a webhook. The API checks the `X-Hub-Signature-256` signature, saves the raw payload to `webhook_events` (unique on the provider's event id, so repeats are dropped), queues an `inbound` job and returns 200. Target under 100 ms.
2. The inbound worker resolves the store from the Page or phone id, finds or creates the contact and chat, saves the message, downloads media to R2, and pushes it to the inbox over WebSocket.
3. If AI is on for this chat and no person holds it, the worker schedules an `ai-reply` job 8 seconds later (the store's wait setting). A new customer message resets the timer, so one reply answers the whole thought.
4. The AI worker runs the agent (see AI section). It may answer, ask a question, create a draft order through tools, or hand over. Saved replies that match are sent without calling the model.
5. The reply goes to the `outbound` queue, which sends it through the provider adapter with an idempotency key, then records the status callbacks (sent, delivered, read).
6. If anything fails (model timeout, provider error) the chat is handed to the team with a reason; nothing is lost.

### 2. Outbound sending (all channels)

1. Every send, from any feature, becomes one `outbound` job with: store, contact, channel, message type (transactional or marketing), template or text, and a Dakly message id.
2. Just before sending, the worker re-checks: consent (for marketing), quiet hours, frequency cap and smart sending, the 24-hour window for Messenger and Instagram, the WhatsApp template's approval, and the store's balance (SMS credits or WhatsApp ৳ balance).
3. Cost is reserved from the balance before the call and settled after the provider's answer.
4. The provider adapter applies that provider's rate limit, retries temporary errors with backoff and fails over to the backup SMS gateway.

### 3. Campaign

1. Owner approves. The campaign worker takes a snapshot of the audience (segment rules evaluated now) into `campaign_recipients`, marking skipped people with a reason.
2. It feeds recipients into `outbound` in batches of 500, paced to the provider's limits and spread across the send window.
3. Status callbacks update recipients; roll-ups update every minute; the campaign moves to Sent when all recipients reach a final status.
4. Pause stops feeding new batches; cancel marks unsent recipients cancelled.

### 4. Order

1. An order is created (AI tool, order link, staff). Stock is reserved in the same transaction.
2. Staff send it with a courier and record the courier and tracking code (D21). Courier booking, status webhooks and polling come with the courier release.
3. Delivered and returned changes update customer stats, return risk and the order notification automations.

### 5. Store sync (Shopify, WooCommerce; waits for Q13)

Initial import runs as a `bulk` job in pages; after that, store webhooks (verified by HMAC or secret) bring new orders, customers and product changes; a nightly job reconciles anything missed.

### 6. Attribution

On `order.created`, the analytics worker looks back over the store's window (1, 3 or 7 days) for the customer's latest eligible touch and records the attribution (pending review: on the order row instead of an `attributions` table); cancellations remove it and returns reduce its money. Roll-up tables are updated in the same job.

## Valkey rate limiting

`platform/cache/CacheModule` exports one `ValkeyClient` and the shared `RateLimiter`. The client uses `REDIS_URL` through the queue connection parser, including TLS and database selection, and closes on application shutdown. One Valkey script atomically counts attempts and sets the expiry for a fixed window. The limiter returns an allowed flag and retry-after in whole seconds; blocked attempts do not extend the window. Features choose namespaced keys and import the module when they need it. Auth-specific limits arrive with ACC-2.

## Environments

| Environment | Purpose                                                                                                                       | Data                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Local       | Developer machines with Docker Compose (PostgreSQL, Valkey, MinIO for R2)                                                     | Seed data only                               |
| Staging     | Same images as production on a small Droplet and a small managed database; connected to Meta test Pages and courier sandboxes | Synthetic data only, never production copies |
| Production  | As in Deployment by stage                                                                                                     | Real shops                                   |

## CI and deploys

- GitHub Actions on every pull request: type check, lint, unit tests, cross-tenant tests, migration check, dependency and container scan.
- Merge to `main` builds Docker images, pushes them to DigitalOcean Container Registry and deploys to staging automatically.
- Production deploy is a manual approval in GitHub Actions; migrations run first, then a rolling or blue-green switch with health checks; one-click rollback to the previous image.
- Feature flags (per store) let risky features ship dark and turn on for a few shops first.

## Observability

| Need               | Tool (launch)                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Errors             | Sentry for web, API and workers                                                                                                                                     |
| Logs               | Structured JSON logs with request id and store id, shipped to Better Stack, Grafana Cloud Logs or similar                                                           |
| Metrics and alerts | Grafana Cloud (free tier at first) or DigitalOcean monitoring: queue depth, job failures, webhook latency, provider error rates, AI latency and cost, database load |
| Tracing            | OpenTelemetry in API and workers, sent to the same backend                                                                                                          |
| Uptime             | External checks on the app, API health and webhook endpoint; public status page from stage 2                                                                        |
| Queues             | Bull Board (admin only) to inspect and retry jobs                                                                                                                   |

Alerts go to an on-call channel with clear owners. First alerts: webhook intake errors, `inbound` or `ai-reply` queue older than 1 minute, outbound failure rate over 5%, database CPU over 80%, AI spend spike.

## Backups and recovery

| Item       | Approach                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL | Managed daily backups and point-in-time restore (DigitalOcean keeps 7 days); a nightly logical dump encrypted and copied to R2 in another region, kept 30 days |
| Valkey     | Holds only rebuildable data (queues are re-created from the outbox if lost)                                                                                    |
| R2 files   | Object versioning on; lifecycle rules for expiry                                                                                                               |
| Droplets   | Stateless; rebuilt from images; weekly snapshot in stage 1                                                                                                     |
| Drill      | Restore to staging every quarter and record the time taken                                                                                                     |
| Targets    | Lose at most 5 minutes of data; back online within 1 hour (stage 2 onward)                                                                                     |

Scale targets, performance budgets and the security standards are in [scale-and-security.md](scale-and-security.md).

## API request logging

The API uses `nestjs-pino` through the Nest logger. Each request gets a generated UUID returned in `X-Request-Id`; incoming request ids are ignored. Automatic logs contain the request id, response status and duration. Request URLs, query strings, headers and bodies are omitted because they can contain personal data. Known sensitive field names are redacted as a backstop.

Unknown errors are logged once by `AppErrorFilter`, with an allowlisted class, a safe `errorCode` and stack source positions. Error messages, query parameters, nested causes, function names and file paths are omitted. Expected business errors keep their existing response, including optional validation fields.

Setting `SENTRY_DSN` enables error reporting using the same safe record and request id. Its private Sentry client has no automatic integrations and sends events without global user context or breadcrumbs. Sentry requests have a two-second transport timeout. With the variable unset, no Sentry transport is created.
