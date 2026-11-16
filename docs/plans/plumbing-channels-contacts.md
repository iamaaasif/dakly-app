# Next build plan: shared plumbing, channels and contacts

The order to build milestones M2 ([feature 10](../features/10-dashboard-and-notifications.md) notifications, [feature 07](../features/07-payments-and-billing.md) usage) and M3 ([feature 02](../features/02-channel-connections.md), [feature 03](../features/03-customers-and-segments.md) contacts), split into tasks of one PR each. These come right after the core in [core.md](core.md) and before the campaigns and automations engine in [campaigns-and-automations.md](campaigns-and-automations.md). Status lives in [tasks.md](../tasks.md); this file holds what each task must do. Delete a task's section once it is Done and the feature doc describes it.

Read with: [CLAUDE.md](../../CLAUDE.md), [workflow.md](../development/workflow.md), [architecture.md](../architecture.md), [jobs.md](../data/jobs.md), [isolation-and-access.md](../data/isolation-and-access.md), [rules/jobs.md](../rules/jobs.md), [rules/providers.md](../rules/providers.md).

## Decisions for this plan

The docs disagree in a few places. These are the working answers; each is easy to change until its task is built.

| #   | Question                             | Working answer                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Real time: SSE or Socket.IO          | Server-Sent Events, as in [frontend-data-and-state.md](../rules/frontend-data-and-state.md), HOME-1 and `GET /events/stream`. One stream per signed-in tab; Valkey pub/sub fans events out across API servers. HOME-1 changes the Socket.IO text in architecture.md.                                                                                                                          |
| P2  | Usage units versus wallets           | `usage_events` holds only the AI allowance units the schema allows (`ai_conversation`, `ai_content`, `ai_ask`). SMS credits and WhatsApp money are wallets in `wallet_ledger`. PAY-1 fixes the unit list in feature 07.                                                                                                                                                                       |
| P3  | Event names and payloads             | One catalogue in `packages/contracts/src/events/`, names `area.past_tense_verb` (`contact.created`, `consent.changed`). Payloads hold ids and enum values only, never phone, email, names or message text. REV-7 writes it before the first producer.                                                                                                                                         |
| P4  | Sending money before billing         | Until PAY-8 sells SMS packs and WhatsApp top-ups, staff grant credits from the admin app with a reason and a staff audit row (D28). Free beta shops get their SMS credits this way.                                                                                                                                                                                                           |
| P5  | One subscriber per event handler     | The outbox relay turns one event into one BullMQ job per subscriber, with job id `<eventId>-<subscriber>` (BullMQ rejects `:` in custom job ids), so a relay retry cannot queue a handler twice. Handlers stay idempotent anyway.                                                                                                                                                             |
| P6  | Messages without the Chats extension | Storing conversations and messages, sending, delivery and read receipts, and the 24-hour window are core (`messaging/`), because campaigns, workflows and consent need them on every shop (D37). The Chats extension adds the inbox screens, assignment, notes, saved replies, comments and the AI agent on top. With Chats off, messages are still stored and shown on the customer profile. |

## External accounts and dev stubs

Meta app review for messaging (M3, M4) and the SMS provider (ACC-14) are not ready. Every vendor sits behind a driver in `packages/providers`, chosen by config:

| Driver          | Development, CI and tests                                                                    | Production                    |
| --------------- | -------------------------------------------------------------------------------------------- | ----------------------------- |
| `ChannelDriver` | `FakeMetaChannelDriver`: signs and replays recorded Messenger and Instagram webhook fixtures | Meta Graph API driver (CHN-2) |
| `SmsDriver`     | `MailpitSmsDriver` (exists)                                                                  | Provider driver, ACC-14       |
| Web push        | None in M2; HOME-5 adds it                                                                   | VAPID keys, HOME-5            |

Recorded webhook fixtures live in `packages/providers/src/channel/meta/fixtures/` with personal data replaced. A live Page on a Meta test app is checked by hand on staging before beta.

## Tasks

Each task is one PR under about 500 lines, in this order, on the branch named under its heading ([branch names](../rules/pull-requests.md)). Tasks in the same group can run in parallel once their dependencies merge. "Tests" lists what the reviewer looks for. Every PR also sets its row in [tasks.md](../tasks.md) and updates the feature doc when behaviour changes.

### Group 1: events and the outbox

### REV-7 · Event catalogue and send gate definitions

Branch: `docs/rev-7-event-catalogue`

- Scope: `packages/contracts/src/events/` with one file per area (`contacts.ts`, `messaging.ts`, `notifications.ts` now; later areas add theirs). No M2 or M3 task emits a channel event, so there is no `channels.ts` yet. Each event is a zod schema with `type`, `storeId`, `occurredAt` and an ids-only payload; `events/dakly-event.ts` holds the union of all events and the `DaklyEvent` type. [jobs.md](../data/jobs.md#events-in-m2-and-m3) lists which events exist in M2 and M3, who emits each and who listens. The final send gate for staff replies, transactional and marketing sends is defined in the [CAMP-9 section](campaigns-and-automations.md#the-final-send-gate) (CAMP-9 builds it). Real-time recovery and AI latency measurements moved to REV-10.
- Tests: every event schema accepts a valid example and rejects a payload with a `phone`, `email`, `name` or `text` key; the union rejects an unknown type; `pnpm lint:docs`.

### Group 2: notifications and usage (M2)

### HOME-1 · Notifications and the live stream

Branch: `feat/home-1-notifications`

- Scope: `notifications/` feature. `NotificationsService.notify(storeId, { type, category, dedupeKey, recipients, ... })` resolves recipients from a permission (for example everyone with `chats.view`), writes one row per user with `ON CONFLICT (store_id, user_id, dedupe_key) DO NOTHING`, and publishes a `notification.created` event. Routes: list with cursor, mark seen, done, snooze. `GET /events/stream` (P1): SSE for the session's current store, events carry an id so `Last-Event-ID` replays missed notifications from the table; a heartbeat every 25 seconds; the stream closes when the session or membership ends (checked on each heartbeat). Valkey pub/sub channel per store. Update architecture.md "Real time".
- Tests (integration): a rule firing twice makes one card per user; a member without the permission gets none; store B's stream never receives store A's events; reconnect with `Last-Event-ID` gets the missed rows; a revoked session's stream closes within one heartbeat.

### HOME-2 · Web: notification bell and list

Branch: `feat/home-2-notification-bell`

- Scope: bell with unread count in the app shell, list sheet with categories from feature 10, mark seen and done, snooze. One `useEventStream` hook that opens the SSE stream once and updates the React Query cache; polling every 60 seconds only when the stream fails.
- Tests: component tests for empty, loading, error and data states; Playwright: a notification created through the API appears in the open page without reload.

### PAY-1 · Usage service

Branch: `feat/pay-1-usage-service`

- Scope: `usage/` feature. `UsageService.consume(storeId, { unit, quantity, reference })` checks the period allowance from the plan, then top-ups, and writes a `usage_events` row unique on reference, all in one store transaction; a repeated reference returns the first result. Notify at 80% and 100% once per period through HOME-1. Fix the unit list in feature 07 (P2).
- Tests (integration): two parallel consumes of the last unit let exactly one through; the same reference twice charges once; the 80% notice is sent once per period; a new period starts at zero.

### Group 3: contacts and channels (M3)

### CUS-1 · Contacts, channel identities and kinds

Branch: `feat/cus-1-contacts`

- Scope: the example `customers/` feature becomes `contacts/` on the `contacts` and `contact_identities` tables already in the schema. Kinds follow the glossary (`chat_only`, `lead`, `customer`, `not_customer`). Phone unique per store; masking through the shared `maskPhone` (REV-9 Task E). Emit `contact.created`.
- Tests (integration): phone with Bangla digits or `+880` saves normalised; the cross-store suite covers every new route.

### CHN-1 · Meta webhook intake

Branch: `feat/chn-1-meta-webhooks`

- Scope: `POST /webhooks/meta` (`@Public()`), verification GET, signature check on `req.rawBody` with `timingSafeEqual`, save to `webhook_events` unique on provider and event id, queue `process-webhook-event`, answer 200. Nothing else in the request. Bad signature: 401 and a security log.
- Tests (integration): the same delivery twice stores one row; a body re-serialised after parsing fails the signature; the request answers without waiting for the job; a 2 MB body over the limit is refused.

### CHN-2 · Messenger and Instagram connect

Branch: `feat/chn-2-meta-connect`

- Scope: Facebook Login for Business, list Pages and linked Instagram accounts, connect the chosen ones: token encrypted with `platform/crypto`, Page subscribed to `messages`, `messaging_postbacks` and `feed`. One external account belongs to one store (unique across stores). Owner or Admin only. Disconnect keeps chats.
- Tests (integration, fake driver): a Page connected to store A cannot be connected to B; the token is never returned by any route or logged; disconnect keeps conversations; a Marketer gets 403.

### CHN-4 · Store lookup for webhooks and token health

Branch: `feat/chn-4-webhook-routing`

- Scope: the `process-webhook-event` handler parses with the driver, finds the store through `store_id_for_channel_account`, and hands messages to `MessagingService.receiveInboundMessage` (CHAT-1; until it merges, the event is recorded as `ignored` with a reason). A disconnected Page's event is stored and ignored. Daily token health job warns 7 days before expiry and marks `needs_reconnect` on an auth error, with a notification.
- Tests: a webhook for an unknown account is `ignored`; a token 6 days from expiry creates one notification; the job is idempotent per day.

### CHN-5 · Web: Integrations page

Branch: `feat/chn-5-integrations-page`

- Scope: cards for Messenger, Instagram, WhatsApp (shows "Waiting for setup", CHN-3 blocked on Q2) and SMS sender; connect, reconnect and disconnect with confirmation.
- Tests: component states; Playwright with the fake driver connects a Page.

### CHN-6 · SMS sender identity

Branch: `feat/chn-6-sms-sender`

- Scope: `sms_sender_ids`: request a masking sender name, staff approve or reject it from the admin app with a reason, test send to the owner's own phone, status on the Integrations page. Until approved, SMS goes from Dakly's shared sender.
- Tests (integration): only one active sender per store; a rejected request shows the reason; staff approval writes a staff audit row.

### CHAT-1 · Core messaging: receive and store

Branch: `feat/chat-1-core-messaging-inbound`

- Scope: P6. `messaging/` feature (core, not the Chats extension) on `conversations` and `messages`. `MessagingService.receiveInboundMessage(storeId, { connectionId, externalSenderId, externalMessageId, content, sentAt })` finds or creates the contact through `ContactsService`, the conversation for that contact and connection, and the message (unique on connection and external message id), and sets `last_inbound_at` and `window_expires_at`. CHAT-1 adds `ContactsService.findOrCreateByIdentity(storeId, { channel, connectionId, externalId, profile })`, the one way a channel creates a contact, safe under concurrent webhooks (unique key plus retry on conflict). STOP keywords in Bangla and English (`STOP`, `বন্ধ`, and the list in feature 03) on WhatsApp and Messenger call `ConsentService.record` (CUS-2) with source `stop_keyword` to write a withdrawal. Emits `message.received` and `conversation.started`. No inbox screen: the customer profile shows the message history.
- Tests (integration): a duplicate webhook stores one message; two messages from a new sender at once create one contact and one conversation; a contact on two Pages keeps two identities; the window moves with each inbound message and never with an outbound one; each STOP keyword withdraws consent on that channel; works with the Chats extension switched off.

### CHAT-2 · Core messaging: send and receipts

Branch: `feat/chat-2-core-messaging-send`

- Scope: `MessagingService.send(storeId, { contactId, channel, connectionId, identityId, category, content, operationKey })` writes the outbound message as `queued` and enqueues `send-message` with the operation key as job id; the job calls the channel driver (Messenger and Instagram now; SMS through `SmsService` with an `sms_messages` row; WhatsApp after CHN-3) outside any transaction, then records the provider message id. An uncertain provider result is reconciled before any resend. Delivery, read and failure webhooks update the message and emit `message.delivered`, `message.read`, `message.failed`. An auth error marks the connection `needs_reconnect`. Campaigns, workflows and the Chats inbox all send through this one method.
- Tests (integration, fake drivers): the same operation key twice sends once; a crash after the provider call sends once on retry; a read receipt before the delivery receipt still ends `read`; an auth error marks the connection and notifies the Owner; no transaction is open during the driver call.

### CUS-3 · Contact stats

Branch: `feat/cus-3-contact-stats`

- Scope: one `contact_stats` row per contact. In M3 only the message fields are filled (first and last inbound, last outbound); order fields stay null until ORD-1 emits order events, and the refresh handler already reads them through `OrdersService` once it exists. `refresh-contact-stats` on contact and message events; a nightly job recomputes all contacts of a store in batches.
- Tests (integration): an event refreshes one row; the nightly job is idempotent; lists read only `contact_stats`.

### CUS-4 · Own-phone capture and possible matches

Branch: `feat/cus-4-phone-matches`

- Scope: D27: save a buyer's own phone on the profile; if another contact has it, keep it on the record and create a `contact_match_suggestions` row for staff instead of merging. Merge with the 7-day undo is CUS-14.
- Tests: the D26 and D27 edge cases listed in feature 03.

### CUS-5 · Web: customers list and profile

Branch: `feat/cus-5-customers-web`

- Scope: list with filters in the URL, profile with identities, consent per channel, tags, notes, masked phone unless `seeFullPhone`.
- Tests: component states; a Support agent sees `01712-XXX678`.

## Out of this plan

WhatsApp connect (CHN-3) waits on Q2. Customer import (CUS-8) is planned with campaigns, because a shop's first campaign usually goes to an imported list. The Chats inbox (M4, the Chats extension) is planned separately; it reads and sends through core messaging.

## How each task is reviewed

As in [core.md](core.md#how-each-task-is-reviewed), plus: every event written goes through `OutboxService.publish` inside the change's transaction; no event payload carries personal data; every job handler is idempotent and keyed as in [jobs.md](../data/jobs.md).
