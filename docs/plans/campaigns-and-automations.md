# Next build plan: segments, campaigns and automations

The order to build segments ([feature 03](../features/03-customers-and-segments.md)), campaigns and the workflow builder ([feature 09](../features/09-campaigns-and-automations.md)), split into tasks of one PR each. Segments, campaigns and automations are core: every shop gets them, with or without the Chats extension (D37). They are built as milestone M3b in [build-order.md](../development/build-order.md), after channels, contacts and core messaging (M3) and before the Chats inbox (M4) and Products (M5). They never depend on the Chats extension: they send through core messaging, `MessagingService` in `messaging/`, which Chats also uses. Order confirmation then becomes a workflow template when Orders arrives, instead of separate code that the engine would replace. Status lives in [tasks.md](../tasks.md); this file holds what each task must do. Delete a task's section once it is Done and the feature doc describes it.

Read with: [CLAUDE.md](../../CLAUDE.md), [feature 09](../features/09-campaigns-and-automations.md) (the Engineering section is the spec), [plumbing-channels-contacts.md](plumbing-channels-contacts.md) (the plan before this one), [jobs.md](../data/jobs.md), [state-machines.md](../data/state-machines.md), [growth.md](../data/growth.md), the [market study](https://claude.ai/artifact/E8kkbJNVxeZx6G8a3E57UQ), D7, D23, D24 and D31 in [decisions.md](../product/decisions.md).

## What must exist first

| Needed                                                    | From                         |
| --------------------------------------------------------- | ---------------------------- |
| Outbox events and `@HandlesEvent`                         | DB-2                         |
| Notifications for pauses, approvals and failures          | HOME-1                       |
| Contacts, identities, consent and contact stats           | CUS-1, CUS-2, CUS-3          |
| SMS credits and WhatsApp balance with reserve and release | PAY-11                       |
| Messenger connection and SMS sender                       | CHN-2, CHN-6                 |
| Core messaging: send, delivery and read receipts, window  | CHAT-1, CHAT-2 (core, M3)    |
| Order data, order triggers and money attribution          | ORD-1 and ANA-2, added later |

Until Orders exists, segments, triggers and results have no order fields. Each task below names the order part it leaves for later, so the engine is complete for Dakly's own data and Orders only adds triggers, fields and templates.

## Decisions for this plan

| #   | Question                          | Working answer                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Where the final send checks live  | One `sending/` feature with `SendPolicyService`. Campaigns, workflows and, later, Chats staff replies all call it right before `MessagingService.send`. Nothing else decides consent, window, block, quiet hours or frequency.                                                                                            |
| A2  | How the frequency cap counts      | From Postgres: marketing sends to the contact in `campaign_recipients` and `automation_run_steps` (sent, delivered or read) in the last 24 hours per channel and 7 days across channels. Add the indexes these queries need in CAMP-9's migration. No Valkey counter that could drift.                                    |
| A3  | Channels before WhatsApp is ready | SMS and Messenger (open window only, D24) ship first. WhatsApp sends, templates and the Stop offers button wait for CHN-3 and CAMP-1, both blocked on Q2. The code takes a channel list, so WhatsApp adds a driver and templates, not a new path.                                                                         |
| A4  | Short link domain                 | Tracked links use a short domain set by `SHORT_LINK_BASE_URL` (the docs use `dkly.co`). Local and CI use the API origin with `/l/`. Buying the domain is outside the code.                                                                                                                                                |
| A5  | Workflow graph format             | A zod schema in `packages/contracts/src/automations/graph.ts`: steps keyed by a stable `stepKey`, each with a kind (`wait`, `condition`, `random_split`, `send`, `action`, `exit`) and typed settings, plus `next` edges. Templates in code and the canvas both produce this format. The engine never reads untyped JSON. |
| A6  | Who may approve                   | Feature 09: `campaigns.edit` or `automations.edit` to build; approving, enabling and publishing need Owner or Admin while the store setting "Only owners and admins can approve sends" is on (the default). A Marketer's request shows as "Needs your OK".                                                                |

## Tasks

Each task is one PR under about 500 lines, in this order, on the branch named under its heading. Groups 1 and 3 can start in parallel; group 2 needs CAMP-9. "Tests" lists what the reviewer looks for. Every PR also sets its row in [tasks.md](../tasks.md) and updates the feature doc when behaviour changes.

### Group 1: who to send to

### CUS-6 · Segments: condition tree, compiler and counts

Branch: `feat/cus-6-segments`

- Scope: `segments/` feature on the `segments` table. A condition tree (AND or OR groups, at most 3 levels, at most 20 conditions) over a fixed field list in `packages/contracts/src/segments.ts`: tags, district, source, kind, lifecycle stage, consent per channel, first and last inbound message, last campaign received. Order fields (order count, spend, last order, usual gap) are in the field list but marked unavailable until ORD-1, and the compiler refuses them with a clear error until then. `SegmentsService.count` and `SegmentsService.contactIds` compile the tree to a Drizzle `where` with bound parameters only. Not a customer contacts never match. Emit `segment.saved`.
- Tests (integration): every operator against seeded contacts; a value with SQL characters is a plain value; a tree over the depth limit is refused; counts on 50,000 contacts under 2 seconds (a seeded performance test, skipped in unit runs); store B's segment never counts A's contacts.

### CUS-7 · Web: segments list and builder

Branch: `feat/cus-7-segments-web`

- Scope: list with counts, builder with live count (debounced), save, duplicate, delete; the ready-made lifecycle segments from feature 03 appear as read-only starting points.
- Tests: component states; Playwright builds a segment with two conditions and sees the count change.

### CUS-8 · Customer import

Branch: `feat/cus-8-customer-import`

- Scope: CSV and XLSX upload to R2, preview of the first 20 rows, column mapping, consent evidence per channel (the shop must state where consent came from, or the rows import with no marketing consent), row errors in a downloadable report, undo within 7 days for contacts the import created. An `imports` row tracks each run; the work runs in a bulk job in batches of 500.
- Tests (integration): bad phones are reported, not dropped silently; an existing phone updates allowed fields and never changes consent without evidence; undo removes only contacts the import created and nothing a later edit touched; a 10,000-row file finishes in batches without one long transaction.

### Group 2: campaigns

### CAMP-9 · Final send checks

Branch: `feat/camp-9-send-policy`

- Scope: `sending/` feature (A1). `SendPolicyService.check(storeId, { contactId, channel, connectionId, identityId, category, at })` returns `send`, `defer` with the next allowed time, or `skip` with a reason from the schema's skip reasons (`no_consent`, `window_closed`, `blocked`, `not_customer`, `frequency_cap`, `quiet_hours`, `do_not_call`, `daily_reach_limit`, `meta_user_limit`). Categories: `staff_reply` (block and window only), `transactional` (phone or identity, block, window or template), `marketing` (all checks). Quiet hours from the store setting, default 21:00 to 09:00 Asia/Dhaka, transactional exempt. Frequency cap per CAMP-R3 and A2, with workflow priority per AUTO-R2. Smart sending (24 hours) is the per-channel daily part of the same check. Migration adds the indexes A2 needs.
- Tests (unit and integration): a table of cases, one per reason; a withdrawal after approval skips; a window 23 hours and 1 minute old skips as `window_closed`; 20:59 sends and 21:00 defers to 09:00 the next day in Dhaka time across a date change; transactional ignores quiet hours and the cap; the cap counts campaign and workflow sends together.

### CAMP-10 · Tracked links and the SMS opt-out page

Branch: `feat/camp-10-tracked-links`

- Scope: `links/` feature on `tracked_links`, `tracked_link_visits` and `tracked_link_visit_days`. `LinksService.create` makes a per-recipient code (8 characters, unguessable, unique per store); `GET /l/:code` (`@Public()`, rate limited) records a visit with only the daily-rotating visitor hash (D31) and redirects; the first tap emits `message.tapped`. Opt-out links (`kind = opt_out`) open a one-tap Bangla and English page that writes a consent withdrawal through `ConsentService` and emits `message.opted_out` (CAMP-R4). The link domain follows A4.
- Tests (integration): a tap stores no IP or user agent; a second tap counts a visit but not a second first-tap; an unknown code returns 404 with no timing difference from a known one; the opt-out page withdraws once even when tapped twice; a link never redirects to a URL that was not stored.

### CAMP-2 · Campaigns: draft, approval, frozen recipients and cost

Branch: `feat/camp-2-campaigns`

- Scope: `campaigns/` feature. Draft CRUD with content per channel (SMS text with the part counter from feature 09, Messenger text, image and buttons). `estimate` returns matching, without consent, reachable and final counts plus cost. `approve` (A6) in one store transaction: freeze recipients into `campaign_recipients` from the segment include and exclude lists at that moment, run `SendPolicyService` for each to set skips, bind the connection (immutable after approval), reserve cost through `WalletService.reserve` (refused if the balance is short, CAMP-R5), set `scheduled` or `sending`. Edit and cancel until 5 minutes before the scheduled time (CAMP-R7). Pause and resume. States as in feature 09 and [state-machines.md](../data/state-machines.md). Emit `campaign.approved`.
- Tests (integration): the feature 09 acceptance case (128, 109, 6 gives 103) with SMS in place of WhatsApp; approval with a short balance changes nothing; a Marketer cannot approve while the setting is on; an approved campaign's audience does not change when contacts are added later; cancelling 4 minutes before send is refused; reserved cost equals the estimate.

### CAMP-3 · Sender job, callbacks and results counts

Branch: `feat/camp-3-campaign-sender`

- Scope: `send-campaign-batch` job: claim up to 200 queued recipients through a `SECURITY DEFINER` due-work function, run `SendPolicyService` again right before each send, create tracked links, call `MessagingService.send` with operation key `campaign:<recipientId>`, write status and settle cost per recipient (`charge` on delivered, `release` on skipped or failed). Restartable: a recipient in `sending` with an expired claim is reconciled by provider message id before any resend. Delivery, read and failure callbacks from core messaging (CHAT-2) update recipients. Roll-up counts on `campaigns` refresh from recipients at most every 10 seconds. A short balance mid-send pauses the campaign and notifies the Owner (resumes after top-up). Emit `campaign.sent` when the last recipient settles.
- Tests (integration): a crash after the provider call and before the status write sends once; two workers never send to the same recipient; a consent withdrawal between approval and send skips and releases cost once; quiet hours defer the rest to 09:00; a failed SMS is refunded; the counts match the recipient rows.

### CAMP-7 · Messenger campaigns to open windows

Branch: `feat/camp-7-messenger-campaigns`

- Scope: D24. The audience step for Messenger keeps only contacts whose last inbound message on the selected Page is under 23 hours old at approval, and the send check repeats it per recipient. The estimate shows ৳0. The builder explains why the count is small.
- Tests: a contact on two Pages uses the identity on the selected Page; a window closing during the send skips as `window_closed`; the feature 09 edge case list for Messenger.

### CAMP-4 · Web: campaign list, builder and results

Branches: `feat/camp-4-campaign-list-and-results`, `feat/camp-4-campaign-builder`

- Scope: two PRs. List with statuses (Draft, Scheduled, Sending with progress, Paused, Sent, Failed), search, channel and date filters in the URL; results page from feature 09 "Missing design" with sent, delivered, read, tapped and the failure groups (orders and revenue show "after Orders is set up" until ANA-2); builder steps Goal, Channel, Content, Audience, Schedule, Review with save draft on every step, live preview, SMS part counter, cost and balance after, and the approval checkbox. Send test to my phone.
- Tests: component states for each step; Playwright creates an SMS campaign to a seeded segment, approves it and sees it sending with the fake SMS driver.

### Group 3: automations

### CAMP-8 · Workflow catalogue and typed graph

Branch: `docs/camp-8-workflow-catalogue`

- Scope: A5. The graph schema in `packages/contracts/src/automations/`, with the limits from feature 09 (50 steps, 90 days of waiting, 5 exit conditions, 10 condition paths plus Else, 4 random paths). A catalogue file listing every release 1 trigger with its source event, filters and whether it is available before Orders; every action with its typed settings; every template with trigger, steps, goal, category and prerequisites. Update feature 09 so its trigger list matches the catalogue, and split the CAMP-5 row as below.
- Tests: the schema accepts every template in the catalogue and rejects a graph with a loop, a dead end, a step over the limits or an unknown step kind.

### CAMP-5 · Workflow engine: versions, runs and steps

Branches: `feat/camp-5-automation-versions`, `feat/camp-5-automation-runner`

- Scope: two PRs. First: `automations/` feature with draft CRUD, the publish checks from feature 09 (no end or loop, unreachable channel, split on tapped or replied with under 2 hours of wait, missing trigger source), publish writing an immutable `automation_versions` row, enable, disable, pause, "Stop the old version". Second: the runner. A sweeper job every minute claims due runs through a `SECURITY DEFINER` due-work function in batches, with leases on `claimed_at`, and queues one job per (run, step) with that pair as job id. The step job checks workflow filters and exit conditions, then runs the step: `wait` sets `wake_at` (quiet hours apply to sends, not waits); `condition` and `random_split` pick a path (random by a hash of run id, so a retry picks the same path); `send` calls `SendPolicyService` then `MessagingService.send` with operation key `run:<runId>:<stepKey>`, and "if not reachable" skips or exits; `action` calls the owning feature's service (tag, task for staff; "hand to a person" appears only when the Chats extension is on). Each step writes `automation_run_steps`. Temporary provider errors retry with back-off for up to 36 hours, then the run fails with a readable reason. No row lock during a provider call. Guard every write with the claim time so a stale worker cannot advance a newly claimed run.
- Tests (integration): the feature 09 edge cases: a crash between claim and enqueue is recovered by the lease and sends once; a version published while 40 runs wait on a deleted step leaves them finishing on the old version; changing a delay affects only steps not yet scheduled; pausing then resuming skips sends more than 24 hours late; a consent withdrawal mid-run skips the send; publish refuses each blocked case.

### CAMP-11 · Triggers and entry rules

Branch: `feat/camp-11-automation-triggers`

- Scope: `@HandlesEvent` subscribers for the triggers available before Orders (from CAMP-8: consent given, tag added, segment joined, chat started, comment on a post, lead captured, date property such as birthday). `start-automation-run` checks the trigger filter once, the re-entry rule (once ever, once every N days, every time; default 30 days), one active run per contact per workflow, and creates the run unique on (automation, contact, trigger key). Segment-joined triggers fire after the segment's refresh, and the builder adds the 2-minute delay feature 09 describes. A daily job fires date triggers in store time.
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

## How each task is reviewed

As in [core.md](core.md#how-each-task-is-reviewed), plus: every send goes through `SendPolicyService` immediately before `MessagingService.send`, with a stable operation key; no transaction or row lock is open during a provider call; cost is reserved, charged and released through `WalletService` only, once per recipient or step; consent is read only from `contact_consent_current`; nothing sends without an approval, enable or publish by a person (CAMP-R1).
