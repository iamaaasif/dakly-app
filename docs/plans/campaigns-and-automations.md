# Next build plan: segments, campaigns and automations

The order to build segments ([feature 03](../features/03-customers-and-segments.md)), campaigns and the workflow builder ([feature 09](../features/09-campaigns-and-automations.md)), split into tasks of one PR each. Segments, campaigns and automations are core: every shop gets them, with or without the Chats extension (D37). They are built as milestone M3b in [build-order.md](../development/build-order.md), before channel connections, with SMS as the first channel (D40), and before the Chats inbox (M4) and Products (M5). They never depend on the Chats extension: they send through core messaging, `MessagingService` in `messaging/`, which Chats also uses. Order confirmation then becomes a workflow template when Orders arrives, instead of separate code that the engine would replace. Status lives in [tasks.md](../tasks.md); this file holds what each task must do. Delete a task's section once it is Done and the feature doc describes it.

Read with: [CLAUDE.md](../../CLAUDE.md), [feature 09](../features/09-campaigns-and-automations.md) (the Engineering section is the spec), [plumbing-channels-contacts.md](plumbing-channels-contacts.md) (the plan before this one), [jobs.md](../data/jobs.md), [state-machines.md](../data/state-machines.md), [growth.md](../data/growth.md), the [market study](https://claude.ai/artifact/E8kkbJNVxeZx6G8a3E57UQ), D7, D23, D24 and D31 in [decisions.md](../product/decisions.md).

## What must exist first

| Needed                                                    | From                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| Outbox events and `@HandlesEvent`                         | DB-2 (done)                                                       |
| Notifications for pauses, approvals and failures          | HOME-1                                                            |
| Contacts and consent                                      | CUS-1, CUS-2                                                      |
| SMS credits and WhatsApp balance with reserve and release | PAY-11                                                            |
| Shared UI components                                      | WEB-2                                                             |
| Core send step for SMS                                    | MSG-1                                                             |
| SMS sender identity                                       | CHN-6                                                             |
| Messenger connection, inbound messages and receipts       | CHN-2, CHAT-1, CHAT-2: needed only for CAMP-7 and Messenger steps |
| Order data, order triggers and money attribution          | ORD-1 and ANA-2, added later                                      |

Until Orders exists, segments, triggers and results have no order fields. Each task below names the order part it leaves for later, so the engine is complete for Dakly's own data and Orders only adds triggers, fields and templates.

## Decisions for this plan

| #   | Question                          | Working answer                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Where the final send checks live  | One `sending/` feature with `SendPolicyService`. Campaigns, workflows and, later, Chats staff replies all call it right before `MessagingService.send`. Nothing else decides consent, window, block, quiet hours or frequency.                                                                                            |
| A2  | How the frequency cap counts      | From Postgres: marketing sends to the contact in `campaign_recipients` and `automation_run_steps` (sent, delivered or read) in the last 24 hours per channel and 7 days across channels. CAMP-9 uses the existing `(store_id, contact_id, sent_at)` indexes on both tables. No Valkey counter that could drift.           |
| A3  | Channels before WhatsApp is ready | SMS and Messenger (open window only, D24) ship first. WhatsApp sends, templates and the Stop offers button wait for CHN-3 and CAMP-1, both blocked on Q2. The code takes a channel list, so WhatsApp adds a driver and templates, not a new path.                                                                         |
| A4  | Short link domain                 | Tracked links use a short domain set by `SHORT_LINK_BASE_URL` (the docs use `dkly.co`). Local and CI use the API origin with `/l/`. Buying the domain is outside the code.                                                                                                                                                |
| A5  | Workflow graph format             | A zod schema in `packages/contracts/src/automations/graph.ts`: steps keyed by a stable `stepKey`, each with a kind (`wait`, `condition`, `random_split`, `send`, `action`, `exit`) and typed settings, plus `next` edges. Templates in code and the canvas both produce this format. The engine never reads untyped JSON. |
| A6  | Who may approve                   | Feature 09: `campaigns.edit` or `automations.edit` to build; approving, enabling and publishing need Owner or Admin while the store setting "Only owners and admins can approve sends" is on (the default). A Marketer's request shows as "Needs your OK".                                                                |

## Tasks

Each task is one PR under about 500 lines, in this order, on the branch named under its heading. The order of work is in [customers-to-automations.md](customers-to-automations.md). "Tests" lists what the reviewer looks for. Every PR also sets its row in [tasks.md](../tasks.md) and updates the feature doc when behaviour changes.

### Group 1: who to send to

### CUS-8 · Customer import, what is left

Branch: to be named when the part starts.

- Built and described in [feature 03](../features/03-customers-and-segments.md): CSV upload, column mapping, consent evidence per channel, the import job, row errors in a report and undo.
- Still to build: the import screens in the web app, and a preview of the first 20 rows before the import starts. XLSX comes with CUS-16.
- Tests: the preview reads the uploaded file without starting the import, never shows a full phone to a member without "See full phone numbers", and refuses a file that is not UTF-8.

### Group 2: campaigns

### CAMP-9 · Final send checks

Branch: `feat/camp-9-send-policy`

- Built for SMS: see "Send gate (CAMP-9)" in [feature 09](../features/09-campaigns-and-automations.md). Still to build, each with the task that brings its data:
  - Messenger and Instagram windows (24 hours for replies, 7 days with `HUMAN_AGENT`, 23 hours for marketing) once CHAT-2 stores inbound message times, with the test that a window 23 hours and 1 minute old skips as `window_closed`; the sending identity on the frozen connection, with CHN-2.
  - WhatsApp windows and templates, with CHN-3 and CAMP-1.
  - The extension checks for staff replies and transactional sends, and the campaign and run state checks, belong to CAMP-3 and CAMP-5: their sending jobs check them before they call the gate.
  - AUTO-R2 priority between two workflows on the same day: it needs the waiting runs, with CAMP-5.
  - `do_not_call`, `daily_reach_limit` and `meta_user_limit` come from the SMS provider and Meta, with ACC-14 and CHN-3.
  - What a short balance does for a transactional send (CAMP-3 for its sending job) and for a workflow step (CAMP-5).
  - The settings screen that edits `stores.settings.sending` through `PATCH /store`. Features 01 and 02 show quiet hours under SMS settings and WhatsApp settings; the gate holds one store-wide setting, so that screen settles whether quiet hours are per channel.

#### The final send gate

The gate runs once for each message, inside the short store transaction in which the sending job moves the message from `queued` to sending: the campaign batch or workflow step job for SMS (MSG-1), and `send-message` (CHAT-2) for Messenger. That transaction commits before the provider call ([jobs.md](../data/jobs.md#send-time-and-financial-gates)). Campaigns may run the same checks at approval to show skips, but only the run inside the send transaction decides. A skip writes its reason and releases any reserved cost in the same transaction; a defer leaves the message queued until the next allowed time. The checks run top to bottom and stop at the first one that fails.

Staff replies, typed by a person in the Chats inbox:

1. Extension: the Chats extension is on. Turning an extension off stops its background jobs ([feature 01](../features/01-account-and-team.md)); the gate repeats the check so a reply queued before the switch is not sent.
2. Block: a blocked contact is skipped as `blocked`.
3. Consent and STOP: not checked. STOP withdraws marketing consent; it does not stop a person answering the customer.
4. Window: Messenger and Instagram allow a free-form reply within 24 hours of the customer's last message, and up to 7 days after it with Meta's `HUMAN_AGENT` tag (CHAT-R2). After 7 days the reply is skipped as `window_closed`. WhatsApp allows free-form within 24 hours and only an approved template after that (CHAT-R3); WhatsApp sends wait for CHN-3.
5. Frequency cap and quiet hours: not checked.
6. Wallet: not checked; Messenger and Instagram replies are free.

Transactional sends, such as order confirmation, shipping update, payment receipt and due reminder. Sign-in codes are not channel sends and do not pass this gate.

1. Extension: the extension that owns the source is on, for example Sales for an order update.
2. Block: a blocked contact is skipped as `blocked`; transactional messages respect it ([feature 03](../features/03-customers-and-segments.md)).
3. Consent and STOP: marketing consent is not needed (CAMP-R2), and a STOP does not stop order updates. The send needs a phone for SMS and WhatsApp, or the contact's identity on the sending connection for Messenger; without it the message is skipped.
4. Window: Messenger only inside the 24-hour window. Meta has rejected the `POST_PURCHASE_UPDATE`, `CONFIRMED_EVENT_UPDATE` and `ACCOUNT_UPDATE` tags since 27 Apr 2026, so no tag can carry an order update. Outside the window the message is skipped as `window_closed`, and a workflow's channel order tries the next channel. WhatsApp outside the window needs an approved utility template with no offer. SMS has no window.
5. Frequency cap and quiet hours: exempt.
6. Wallet: not part of `SendPolicyService.check`. The sending job reserves SMS credits, or the WhatsApp utility rate, through `WalletService.reserve` around the gate in the same transaction, or releases on a skip; Messenger is free. If the reserve is refused, nothing is sent. What a short balance does for a transactional send is still to build.

Marketing sends, from campaigns and workflows:

1. Extension: none needed; campaigns and workflows are core (D37). The campaign must still be `sending`, and the workflow run active on a version that is not stopped; otherwise the send is skipped.
2. Block and kind: a blocked contact is skipped as `blocked`, a Not a customer contact as `not_customer`.
3. Consent and STOP: the channel's row in `contact_consent_current` must be `granted`. STOP or `বন্ধ` on WhatsApp or Messenger, the SMS opt-out link and blocking the Page each write a withdrawal, so a withdrawal after approval is skipped as `no_consent`.
4. Window: Messenger only when the contact's last inbound message on the sending Page is under 23 hours old at send time (D24, CAMP-R6), otherwise `window_closed`. No message tag carries marketing. WhatsApp needs an approved marketing template (CAMP-1, waits for Q2). SMS has no window.
5. Quiet hours: inside the store's quiet hours (default 21:00 to 09:00 Asia/Dhaka) the send defers to the next allowed time. Quiet hours are checked before the frequency cap, as in feature 09.
6. Frequency cap: at most 1 marketing message per store per channel per day and 3 per 7 days across campaigns and workflows (CAMP-R3), counted from Postgres (A2); over the cap is skipped as `frequency_cap`. When two workflows fire the same day, only the higher priority message sends (AUTO-R2).
7. Wallet: not part of `SendPolicyService.check`. A campaign recipient's cost was reserved at approval (CAMP-2) and must still be held; a workflow step's job reserves its cost in the gate transaction; a skip reserves nothing, a refused first try releases it, and an unknown outcome keeps it for reconciliation (feature 09). A campaign with a short balance pauses and notifies the Owner (feature 09); a workflow step's short balance is described there too.

Where the feature docs disagree, the gate follows these:

- Frequency cap. [Feature 09](../features/09-campaigns-and-automations.md) CAMP-R3 says "a person gets at most 1 marketing message per store per channel per day and 3 per 7 days across campaigns and automations (editable)". Its entry and frequency rules say "**Frequency cap** across everything (default 2 marketing messages a week)". The gate follows CAMP-R3, as A2 and the CAMP-9 scope do.
- Messenger marketing. Feature 09's channel branch says "else Messenger if inside the 24-hour window or opted in". D24 says the opted-in path does not exist, and CAMP-R6 uses 23 hours. The gate follows D24 and CAMP-R6.
- WhatsApp staff replies. [Feature 04](../features/04-chats-and-ai-agent.md) CHAT-R3 says "From Oct 1, 2026 Meta charges service messages beyond 1,000 free per number per month, so WhatsApp AI replies count toward the store's WhatsApp balance". The CAMP-9 scope says "`staff_reply` (block and window only)". The gate follows the CAMP-9 scope; CHN-3 settles whether a WhatsApp staff reply reserves WhatsApp balance.

### CAMP-3 · Sender job, callbacks and results counts

Branches in merge order: `feat/camp-3-campaign-queue`, `feat/camp-3-campaign-sender`, and `feat/camp-3-campaign-results`.

- Scope: `send-campaign-batch` job: use `sending_campaigns()` to find the earliest sending campaign in each store, then claim up to 200 queued recipients per campaign under store RLS, run `SendPolicyService` again right before each send, create tracked links, call `MessagingService.send` (MSG-1 for SMS) with operation key `campaign-<recipientId>`, write status and settle cost per recipient (`charge` on delivered, `release` on skipped or failed). Restartable: a recipient in `sending` with an expired claim is reconciled by provider message id before any resend. Delivery, read and failure callbacks from core messaging (CHAT-2) update recipients. Roll-up counts on `campaigns` refresh from recipients at most every 10 seconds. A short balance mid-send pauses the campaign and notifies the Owner (resumes after top-up). Only a `manual` pause resumes by hand; each other reason resumes through its own rule. Balance resumes on top-up (CAMP-3). Quality, template and provider pauses resume when their cause clears (CAMP-3 and CHN-3). Emit `campaign.sent` when the last recipient settles. Cancel of a `sending` or `paused` campaign (state-machines.md), charging what was sent and releasing the rest.
- Notes from CAMP-2: the estimate counts the text as written, and the CAMP-R4 opt-out link the sender appends adds characters, so the reserved credits may fall short. The sender must settle each recipient against the one campaign reservation, while `WalletService.charge` settles the whole reservation, so per-recipient settlement needs a design.
- Tests (integration): a crash after the provider call and before the status write sends once; two workers never send to the same recipient; a consent withdrawal between approval and send skips and releases cost once; quiet hours defer the rest to 09:00; a failed SMS is refunded; the counts match the recipient rows.

### CAMP-7 · Messenger campaigns to open windows

Branch: `feat/camp-7-messenger-campaigns`

- Scope: D24. The audience step for Messenger keeps only contacts whose last inbound message on the selected Page is under 23 hours old at approval, and the send check repeats it per recipient. The estimate shows ৳0. The builder explains why the count is small.
- Tests: a contact on two Pages uses the identity on the selected Page; a window closing during the send skips as `window_closed`; the feature 09 edge case list for Messenger.

### CAMP-4 · Web: campaign list, builder and results

Branches: `feat/camp-4-campaign-list-and-results`, `feat/camp-4-campaign-builder`

- Scope: two PRs. List with statuses (Draft, Scheduled, Sending with progress, Paused, Sent, Failed), search, channel and date filters in the URL; results page from feature 09 "Missing design" with sent, delivered, read, tapped and the failure groups (orders and revenue show "after Orders is set up" until ANA-2); builder steps Goal, Channel, Content, Audience, Schedule, Review with save draft on every step, live preview, SMS part counter, cost and balance after, and the approval checkbox. Send test to my phone.
- Owner decision (18 Nov 2026): build the list and builder now from `campaigns.webp` and `campaigns-and-automations/`. Draft rows open the builder and sent rows open a read-only builder summary. Defer results until ORD-3, then build from the feature 09 screen table and "Missing design" section without a separate design. Keep CAMP-4 In progress after the list and builder merge.
- Tests: component states for each step; Playwright creates an SMS campaign to a seeded segment, approves it and sees it sending with the fake SMS driver.

### Group 3: automations

### CAMP-5 · Workflow engine: versions, runs and steps

Branches: `feat/camp-5-automation-versions`, then `feat/camp-5-automation-runner`, `feat/camp-5-automation-steps`, `feat/camp-5-prepare-sms-dispatch`, `feat/camp-5-automation-send-costs`, `feat/camp-5-prepare-sms-retries`, `feat/camp-5-automation-send-retries`, `feat/camp-5-prepare-balance-pause`, `feat/camp-5-automation-balance-pause`

- Scope: drafts and versions, then the runner. Drafts and versions: `automations/` feature with draft CRUD, the publish checks from feature 09 (no end or loop, unreachable channel, split on tapped or replied with under 2 hours of wait, missing trigger source), publish writing an immutable `automation_versions` row, enable, disable, pause, "Stop the old version". Then the runner starts with the sweeper, claims, step job and guards with wait, random split and exit; then conditions, exit checks, the store-time waits, tag actions and the category column; then SMS dispatch preparation and the credit reservation gate; then sends with the opt-out link and SMS credits; then provider retry and unknown-send handling; then the pause for a short SMS balance, the owner's notice and the resume after a top-up. A sweeper job every minute claims due runs through a `SECURITY DEFINER` due-work function in batches, with leases on `claimed_at`, and queues one job per (run, step), deduplicated on `<runId>-<stepKey>-<claimedAt ms>` so a new claim of a step is never dropped. The step job checks workflow filters and exit conditions, then runs the step: `wait` sets `wake_at` (quiet hours apply to sends, not waits); `condition` and `random_split` pick a path (random by a hash of run id, so a retry picks the same path); `send` calls `SendPolicyService` then `MessagingService.send` with operation key `run:<runId>:<stepKey>`, and "if not reachable" skips or exits; `action` calls the owning feature's service (tag, task for staff; "hand to a person" appears only when the Chats extension is on). Each step writes `automation_run_steps`, and CAMP-5 adds a `category` column to it so the frequency cap can count a send step's own category; until then the cap uses `automations.is_transactional`. Temporary provider errors retry with back-off for up to 36 hours, then the run fails with a readable reason. No row lock during a provider call. Guard every write with the claim time so a stale worker cannot advance a newly claimed run.
- Merge send-costs, retry preparation, send-retries, balance preparation and balance-pause back to back, with no deploy between them. Before balance-pause, a short balance skips a message, which the owner rejected.
- Tests (integration): the feature 09 edge cases: a crash between claim and enqueue is recovered by the lease and sends once; a version published while 40 runs wait on a deleted step leaves them finishing on the old version; changing a delay affects only steps not yet scheduled; pausing then resuming skips sends more than 24 hours late; a consent withdrawal mid-run skips the send; publish refuses each blocked case.

- Left for later, each with the task named: AUTO-R2 priority between two workflows on the same day (needs a ranking rule over waiting runs); waking a wait early on a reply or tap, and the wait before the Messenger window closes (CHAT-2); recording taps on workflow messages, which the `tapped` condition and the `tapped_link` exit need (CAMP-10 follow-up); the review list behind "Review before sending"; dynamic fields and tracked links in message text; the create task, notify team, hand to a person and give coupon actions (their owning features); an audit row or event for a workflow's tag action, which writes neither yet, and the `contact.tag_added` event that CAMP-11's tag-added trigger needs; reconciling a workflow send whose provider outcome is unknown, which keeps its SMS credits reserved, and refunding undelivered sends (ACC-14, with provider status reports and delivery receipts).

### CAMP-11 · Triggers and entry rules

Branch: `feat/camp-11-automation-triggers`

- Scope: `@HandlesEvent` subscribers for the triggers the [workflow catalogue](../features/09-campaigns-and-automations.md#workflow-catalogue) marks ready before channels: consent given, tag added and link tapped, plus the birthday date trigger. Chat started, comment on a post and lead captured follow with the channels work; segment joined waits for stored segment membership (feature 03). `start-automation-run` checks the trigger filter once, the re-entry rule (once ever, once every N days, every time; default 30 days), one active run per contact per workflow, and creates the run unique on (automation, contact, trigger key). A daily job fires date triggers in store time.
- Tests (integration): the same event delivered twice starts one run; a contact still inside cannot re-enter; once every 30 days refuses day 29 and allows day 30; a disabled workflow starts nothing; the trigger preview returns the last 10 matching events.

### CAMP-12 · Web: automations list and template library

Branch: `feat/camp-12-automation-templates`

- Scope: stage 1 of the builder (feature 09: templates can ship if the canvas slips). Automations list with tabs and 30-day numbers, the template library filtered by type and channel, Use template copies the graph into a draft, and a settings form per template (delays, message text, channel order, exit rules) that edits the same graph. Templates whose trigger source the store lacks show what they need instead of Use. Publish with "N people are in this workflow now".
- Tests: component states; Playwright uses the chat follow-up template, edits its delay, publishes and sees it active.

### CAMP-6 · Web: workflow canvas

Branches: `feat/camp-6-canvas-view`, `feat/camp-6-canvas-editing`

- Scope: two PRs. A read-only canvas of the graph with step numbers, then editing: add, move and delete steps, the add-step menu, the built-in checks with one-click fixes, and Save draft. Pick an existing graph library only if it meets the 3-day release age rule and works at 360 px; otherwise draw with plain SVG.
- Tests: component tests for each step kind; the canvas and the settings form produce the same graph for the same template.

## Waiting on other work

| Work                                                                                                                     | Waits for              |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| CAMP-1 WhatsApp templates, WhatsApp campaigns and send steps, Stop offers                                                | Q2, CHN-3              |
| Order fields in segments, order triggers, COD confirmation, shipped, delivery feedback, reorder and cross-sell templates | ORD-1, ORD-3 and ORD-4 |
| Orders and revenue on results pages, return per ৳1                                                                       | ANA-2                  |
| SMS and WhatsApp top-ups bought by the shop                                                                              | PAY-8                  |
| AI-written campaign text (approval required, D7)                                                                         | AI-2                   |

ORD-4 changes meaning with this plan: it adds the order triggers and the COD confirmation template to the engine, and handles Confirm and Cancel replies, instead of a separate confirmation sender.

ORD-4 also adds the workflow templates that need Orders, left out of CAMP-8: COD order confirmation, advance not paid, shipped and tracking, delivery feedback and review, order link not finished, thank you after the first order, cross-sell, reorder reminder, win back, cancellation follow-up and welcome new lead. Abandoned cart, abandoned checkout and browse abandonment wait for store sync (Q13) and the tracking script.

## How each task is reviewed

As in [core.md](core.md#how-each-task-is-reviewed), plus: every send goes through `SendPolicyService` immediately before `MessagingService.send`, with a stable operation key; no transaction or row lock is open during a provider call; cost is reserved, charged and released through `WalletService` only, once per recipient or step; consent is read only from `contact_consent_current`; nothing sends without an approval, enable or publish by a person (CAMP-R1).
