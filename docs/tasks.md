# Release 1 tasks

Every release 1 task, in build order, with its status. This file is the task list; there is no second copy elsewhere.

## How to use this file

- Statuses: `Todo`, `In progress`, `In review`, `Done`, `Blocked`. `pnpm lint:docs` rejects any other value and duplicate ids.
- Starting a task: set it to `In progress` in your first commit on the branch.
- Opening the PR: set `In review` and put the PR number in the PR column (`#12`).
- When the PR merges, the same PR has already set `Done`; reviewers check it.
- `Blocked`: write the blocking question id (`Q6`) or task id in Notes.
- New work found while building gets a new row in the right milestone, with the next free number for its prefix. Do not renumber.
- One task is one vertical slice that fits in one to three PRs ([development/workflow.md](development/workflow.md)).

Milestones follow the build order in [development/build-order.md](development/build-order.md). A milestone starts when the one before it is mostly done; tasks inside a milestone can run in parallel unless Depends says otherwise.

## M0. Foundation

| ID    | Task                                                                                     | Status    | Depends     | PR  | Notes                                                            |
| ----- | ---------------------------------------------------------------------------------------- | --------- | ----------- | --- | ---------------------------------------------------------------- |
| FND-1 | Monorepo, lint, boundaries, CI, customers example feature                                | Done      |             | -   |                                                                  |
| FND-2 | Fastify adapter and Express ban                                                          | Done      | FND-1       | #1  |                                                                  |
| FND-3 | Docs: product context, feature docs, rules, workflow, tracker, docs lint                 | Done      | FND-1       | #2  | Merged                                                           |
| FND-4 | Docs: full PRD per feature, prototype sub-screens, glossary, scale and security          | Done      | FND-3       | #3  |                                                                  |
| FND-5 | Docs: automations, segments and campaigns decisions (D23, D24) and channel rules         | Done      | FND-4       | #4  |                                                                  |
| DB-1  | UUID v7 ids generated in the app; switch existing tables                                 | Done      |             | #6  | Done in DB-5; `customers` goes with CUS-1                        |
| DB-2  | Outbox table, outbox relay job, event publishing helper                                  | Todo      | DB-5        |     | Table in DB-5; relay and helper left                             |
| DB-3  | Store and account audit services                                                         | In review | DB-5, REV-4 | #12 | Atomic audit writes and account retention; [plan](plans/core.md) |
| DB-4  | Envelope encryption for shop credentials (`platform/crypto`)                             | In review |             | #27 | Needed by ACC-7; [plan](plans/core.md)                           |
| DB-5  | Release 1 schema, RLS, cross-store functions, ER diagram and data docs                   | In review |             | #6  | Schema #6; core migration fold #43; [data/](data/README.md)      |
| DB-6  | Upazila list and Bangla area names from the BBS list into `bd_areas`                     | Todo      | DB-5        |     |                                                                  |
| DB-7  | `run-maintenance` job: partitions, daily rollups, R2 archive, batched purges             | Todo      | DB-5        |     | [growth.md](data/growth.md); all-store rollups                   |
| API-1 | Logging (nestjs-pino), request ids, Sentry                                               | In review |             | #9  | [plan](plans/core.md)                                            |
| API-2 | Rate limiting with Valkey storage                                                        | In review |             | #10 | Valkey client and per-key limiter; [plan](plans/core.md)         |
| API-3 | Route test that fails when a route has no access rule or a store route has no permission | In review | ACC-3       | #15 | [plan](plans/core.md)                                            |
| WEB-1 | Tailwind v4, theme tokens, `packages/ui` with Button, Input, Card, Badge, Skeleton       | In review |             | #29 | [design/theme.md](design/theme.md)                               |
| WEB-2 | `packages/ui`: Dialog, Sheet, DropdownMenu, Tabs, Table, Toast, Tooltip, form fields     | Todo      | WEB-1       |     |                                                                  |
| WEB-3 | App shell: sidebar, header, store switcher, phone layout                                 | In review | WEB-1       | #35 | Verified session context and responsive shell                    |
| WEB-4 | `lib/format-money.ts`, `lib/format-date.ts`, `lib/format-phone.ts` with tests            | In review |             | #36 | Exact money, store dates and supplied phone display values       |
| WEB-5 | Testing Library and Playwright set up with one end-to-end test                           | In review | WEB-3       | #37 | Real API browser flow and component tests                        |
| WEB-6 | Add `eslint-plugin-react-hooks` to lint                                                  | Todo      |             |     | Lockfile age rule blocked it on 13 Nov; retry after 15 Nov       |

## M1. Account, stores and team

Task briefs, order and assumed decisions: [plans/core.md](plans/core.md).

| ID     | Task                                                                                                  | Status    | Depends                                                                          | PR                                                    | Notes                                                              |
| ------ | ----------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| ACC-4  | Permissions function, built-in roles, `@RequirePermission`                                            | In review |                                                                                  | #13                                                   |                                                                    |
| ACC-3  | Sessions: cookie, database revocation checks, session guard, origin check, store switching            | In review | ACC-4, API-2, REV-3                                                              | #14                                                   | [plan](plans/core.md); revocation plan clarified in #7             |
| ACC-1  | SMS driver interface, Mailpit dev driver                                                              | In review |                                                                                  | #16                                                   | Real provider is ACC-14                                            |
| ACC-2  | Sign-up and sign-in by SMS code                                                                       | In review | ACC-1, ACC-3                                                                     | #17                                                   |                                                                    |
| PAY-10 | Plan trial length, coupon duration and the starting plan catalogue as data                            | In review |                                                                                  | [#18](https://github.com/iamaaasif/dakly-app/pull/18) | D34; [plan](plans/core.md)                                         |
| ACC-16 | Create the store and start the Free plan or a trial                                                   | In review | ACC-2, REV-4, DB-3, PAY-10                                                       | [#19](https://github.com/iamaaasif/dakly-app/pull/19) | Catalogue prices remain Q1 placeholders                            |
| ACC-9  | Email driver: SendGrid for production, SMTP to Mailpit for local dev and tests; sign-in by email code | In review | ACC-2                                                                            | [#20](https://github.com/iamaaasif/dakly-app/pull/20) | D20, D22                                                           |
| ACC-10 | Password sign-in for phone and email; forgot password                                                 | In review | ACC-2                                                                            | [#21](https://github.com/iamaaasif/dakly-app/pull/21) | D20                                                                |
| ACC-11 | Google sign-in (OpenID Connect)                                                                       | In review | ACC-2                                                                            | [#22](https://github.com/iamaaasif/dakly-app/pull/22) | D20; dev uses a fake driver                                        |
| ACC-5  | Invite, accept and remove members                                                                     | In review | ACC-16                                                                           | [#23](https://github.com/iamaaasif/dakly-app/pull/23) |                                                                    |
| ACC-17 | Custom roles                                                                                          | In review | ACC-5                                                                            | [#24](https://github.com/iamaaasif/dakly-app/pull/24) |                                                                    |
| ACC-18 | Transfer ownership                                                                                    | In review | ACC-5                                                                            | [#25](https://github.com/iamaaasif/dakly-app/pull/25) | Feature 01 rule 1                                                  |
| ACC-6  | Store switcher and store settings                                                                     | In review | ACC-16                                                                           | [#26](https://github.com/iamaaasif/dakly-app/pull/26) | Q3 extra stores                                                    |
| ACC-7  | Devices list and remote sign-out; TOTP 2-step                                                         | In review | ACC-2, ACC-3, DB-4                                                               | [#28](https://github.com/iamaaasif/dakly-app/pull/28) |                                                                    |
| ACC-14 | SMS provider driver for production                                                                    | Blocked   | ACC-1                                                                            |                                                       | Waits for the SMS provider account and sender id                   |
| ACC-15 | Cross-store test for every store route                                                                | In review | ACC-5, ACC-6, ACC-17, ACC-18, API-3                                              | #34                                                   | M1 exit check                                                      |
| ACC-8  | Web: sign-up, sign-in, team, store settings screens                                                   | In review | ACC-6, ACC-7, ACC-9, ACC-10, ACC-11, ACC-16, ACC-17, ACC-18, WEB-3, WEB-4, WEB-5 | #38, #39, #40                                         | All three slices In review; final core review corrections in REV-8 |

## M2. Shared plumbing

| ID     | Task                                                    | Status | Depends     | PR  | Notes |
| ------ | ------------------------------------------------------- | ------ | ----------- | --- | ----- |
| HOME-1 | Notifications: table, dedupe, Server-Sent Events stream | Todo   | DB-2, ACC-3 |     | Q10   |
| HOME-2 | Web: notification bell and list                         | Todo   | HOME-1      |     |       |
| PAY-1  | Usage service: units, allowances, usage events          | Todo   | ACC-3       |     |       |

## M3. Channels and customers

| ID    | Task                                                                   | Status  | Depends      | PR  | Notes                                                |
| ----- | ---------------------------------------------------------------------- | ------- | ------------ | --- | ---------------------------------------------------- |
| CUS-1 | Rename customers to contacts; add channel identities and contact kinds | Todo    | ACC-3        |     | Q10                                                  |
| CUS-2 | Consent: append-only rows, current-consent view, STOP keywords         | Todo    | CUS-1        |     |                                                      |
| CUS-3 | Contact stats table and refresh jobs                                   | Todo    | CUS-1        |     |                                                      |
| CUS-4 | Own-phone capture, possible matches and identity merge                 | Todo    | CUS-1        |     | Q10 must-fix; D27 own-phone save is not verification |
| CHN-1 | Meta webhook intake: signature, `webhook_events`, enqueue              | Todo    | DB-1         |     |                                                      |
| CHN-2 | Messenger and Instagram connect (Facebook Login for Business)          | Todo    | DB-4, ACC-4  |     |                                                      |
| CHN-3 | WhatsApp connect (Embedded Signup)                                     | Blocked | CHN-2        |     | Q2 BSP                                               |
| CHN-4 | Store lookup function for webhooks; token health job                   | Todo    | CHN-1        |     |                                                      |
| CHN-5 | Web: Integrations page                                                 | Todo    | CHN-2, WEB-3 |     |                                                      |
| CUS-5 | Web: All customers list and profile                                    | Todo    | CUS-3, WEB-2 |     |                                                      |

## M4. Chats inbox (people only)

| ID     | Task                                                     | Status | Depends       | PR  | Notes |
| ------ | -------------------------------------------------------- | ------ | ------------- | --- | ----- |
| CHAT-1 | Conversations and messages; `receiveInboundMessage`      | Todo   | CHN-1, CUS-1  |     |       |
| CHAT-2 | Outbound send job, delivery and read receipts            | Todo   | CHAT-1        |     |       |
| CHAT-3 | Status, responder, assignment, take over, internal notes | Todo   | CHAT-1        |     |       |
| CHAT-4 | Saved replies                                            | Todo   | CHAT-1        |     |       |
| CHAT-5 | Web: inbox list, conversation, composer, customer panel  | Todo   | CHAT-3, WEB-2 |     |       |
| CHAT-6 | Comments: receive, reply publicly and privately, hide    | Todo   | CHAT-2        |     |       |

## M5. Products

| ID     | Task                                   | Status | Depends       | PR  | Notes |
| ------ | -------------------------------------- | ------ | ------------- | --- | ----- |
| PROD-1 | Products, options, variants            | Todo   | ACC-3         |     |       |
| PROD-2 | Stock ledger and `moveStock`           | Todo   | PROD-1        |     |       |
| PROD-3 | Photo upload to R2 with presigned URLs | Todo   | PROD-1        |     |       |
| PROD-4 | Web: products list and product editor  | Todo   | PROD-2, WEB-2 |     |       |

## M6. Orders

| ID    | Task                                                                         | Status | Depends       | PR  | Notes                                                                         |
| ----- | ---------------------------------------------------------------------------- | ------ | ------------- | --- | ----------------------------------------------------------------------------- |
| ORD-1 | Orders, items, stage table, stage events, order numbers                      | Todo   | PROD-2, CUS-1 |     | Q7                                                                            |
| ORD-2 | Delivery zones, areas and charges                                            | Todo   | ACC-3         |     |                                                                               |
| ORD-3 | Create order from chat and from staff                                        | Todo   | ORD-1, ORD-2  |     | D26/D27: buyer and recipient snapshot; self phone save; conflicts allow order |
| ORD-4 | Order confirmation with channel-supported response handling                  | Todo   | ORD-3, CHAT-2 |     |                                                                               |
| ORD-5 | Web: orders pipeline and order detail                                        | Todo   | ORD-3, WEB-2  |     |                                                                               |
| ORD-6 | Public order link page and endpoint (Turnstile, limits)                      | Todo   | ORD-3         |     | Design needed                                                                 |
| ORD-9 | Manual dispatch, courier/tracking entry, delivery, returns and COD recording | Todo   | ORD-3         |     | D21; item quantities and money checks required                                |

## M7. AI layer

| ID   | Task                                                                    | Status | Depends      | PR  | Notes |
| ---- | ----------------------------------------------------------------------- | ------ | ------------ | --- | ----- |
| AI-1 | `LlmDriver` and OpenAI driver (Responses API, structured output, tools) | Todo   |              |     | Q8    |
| AI-2 | `AiService`, tiers config, `ai_runs`, circuit breaker, per-store limit  | Todo   | AI-1, PAY-1  |     | Q15   |
| AI-3 | Knowledge items, chunking, embeddings, hybrid search                    | Todo   | AI-2         |     |       |
| AI-4 | Reply pipeline: debounce, gates, classify, hand-over rules              | Todo   | AI-2, CHAT-3 |     |       |
| AI-5 | Sales agent tools and the fact check before sending                     | Todo   | AI-4, ORD-3  |     |       |
| AI-6 | Practice mode, test questions, Go live                                  | Todo   | AI-5         |     | Q10   |
| AI-7 | Golden-set eval runner and nightly job                                  | Todo   | AI-5         |     |       |
| AI-8 | Web: AI agent settings, knowledge, test tab                             | Todo   | AI-6         |     |       |

## Later release: couriers and COD

| ID    | Task                                                                 | Status  | Depends     | PR  | Notes                  |
| ----- | -------------------------------------------------------------------- | ------- | ----------- | --- | ---------------------- |
| ORD-7 | Courier driver interface; Steadfast and Pathao drivers; booking job  | Blocked | ORD-3, DB-4 |     | Not in release 1 (D21) |
| ORD-8 | Parcel status by webhook and polling; COD settlements and CSV import | Blocked | ORD-7       |     | Not in release 1 (D21) |

## M9. Payments and billing

| ID    | Task                                                                      | Status | Depends      | PR  | Notes                  |
| ----- | ------------------------------------------------------------------------- | ------ | ------------ | --- | ---------------------- |
| PAY-2 | Payment intents, events, verify job, reconciliation jobs                  | Todo   | DB-2         |     |                        |
| PAY-3 | bKash driver (tokenized checkout)                                         | Todo   | PAY-2, DB-4  |     | Needs merchant sandbox |
| PAY-4 | Nagad driver                                                              | Todo   | PAY-2, DB-4  |     | Needs merchant sandbox |
| PAY-5 | City Bank card driver (hosted page)                                       | Todo   | PAY-2, DB-4  |     | Needs merchant sandbox |
| PAY-6 | Shop advances: payment links from chats and orders, refunds               | Todo   | PAY-3, ORD-3 |     |                        |
| PAY-7 | Subscriptions, renewal job, dunning, read-only guard                      | Todo   | PAY-3        |     | Q1 prices              |
| PAY-8 | Invoices (PDF, numbering per financial year), SMS packs, WhatsApp balance | Todo   | PAY-7        |     |                        |
| PAY-9 | Web: plan and usage, payments and invoices, payment methods settings      | Todo   | PAY-7        |     |                        |

## M10. Content and social

| ID    | Task                                              | Status | Depends     | PR  | Notes |
| ----- | ------------------------------------------------- | ------ | ----------- | --- | ----- |
| SOC-1 | Posts, targets, posting slots, approval           | Todo   | CHN-2       |     |       |
| SOC-2 | Publish jobs for Facebook and Instagram, retries  | Todo   | SOC-1       |     |       |
| SOC-3 | Post insights job                                 | Todo   | SOC-2       |     |       |
| SOC-4 | Content Studio: brand profile, caption generation | Todo   | AI-2, SOC-1 |     |       |
| SOC-5 | Web: Social hub, My posts, Content Studio         | Todo   | SOC-4       |     |       |

## M11. Campaigns, automations, insights

| ID     | Task                                                             | Status  | Depends       | PR  | Notes                      |
| ------ | ---------------------------------------------------------------- | ------- | ------------- | --- | -------------------------- |
| CUS-6  | Segments: condition tree, compiler, counts                       | Todo    | CUS-3         |     |                            |
| CUS-7  | Web: Segments list and builder                                   | Todo    | CUS-6         |     |                            |
| CAMP-1 | WhatsApp templates sync and submit                               | Blocked | CHN-3         |     | Q2                         |
| CAMP-2 | Campaigns: draft, approval, frozen recipients, cost estimate     | Todo    | CUS-6, PAY-8  |     |                            |
| CAMP-3 | Sender job, quiet hours, frequency cap, tracked links, callbacks | Todo    | CAMP-2        |     |                            |
| CAMP-4 | Web: campaign list, builder, results                             | Todo    | CAMP-3        |     | Results page design needed |
| CAMP-5 | Workflow engine, versions, runs and template library             | Todo    | CAMP-3        |     | D23                        |
| CAMP-6 | Web: automations list, template library and builder canvas       | Todo    | CAMP-5        |     |                            |
| CAMP-7 | Messenger campaigns to people with an open window                | Todo    | CAMP-3        |     | D24                        |
| ANA-1  | Glossary report functions and daily summary tables               | Todo    | ORD-3         |     |                            |
| ANA-2  | Attribution of orders to messages and posts                      | Todo    | ANA-1, CAMP-3 |     |                            |
| ANA-3  | Web: Analytics tabs                                              | Todo    | ANA-2         |     |                            |
| HOME-3 | Web: Dashboard cards                                             | Todo    | ANA-1         |     |                            |
| HOME-4 | Ask Dakly AI with read-only report tools                         | Todo    | ANA-1, AI-2   |     |                            |

## M12. Admin panel

| ID    | Task                                                                          | Status    | Depends      | PR  | Notes |
| ----- | ----------------------------------------------------------------------------- | --------- | ------------ | --- | ----- |
| ADM-1 | `apps/admin`, staff users, passkey or TOTP, staff sessions, Cloudflare Access | In review | WEB-1        | #30 |       |
| ADM-2 | Staff audit log; support grants with owner approval                           | In review | ADM-1        | #31 |       |
| ADM-3 | Shops list and detail through report functions                                | Todo      | ADM-2        |     |       |
| ADM-4 | Plans catalogue, refunds, credits, reconciliation queue                       | Todo      | ADM-2, PAY-7 |     |       |
| ADM-5 | Kill switches, feature flags, provider health, AI cost per shop               | Todo      | ADM-2, AI-2  |     |       |

## Readiness review follow-up

Evidence and acceptance criteria: [development readiness review](reviews/development-readiness.md). These rows identify work missing from the original tracker or changes required before copying its examples. Existing feature tasks still own their implementation; resolve the linked specification findings before starting the affected slice. Proposed resolutions in the review are not approved product decisions.

| ID     | Task                                                                                              | Status      | Depends              | PR       | Notes                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------- | ----------- | -------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| REV-1  | Review all feature specifications, source patterns and checks; publish coverage and findings      | Done        | FND-5                | #5       | Review documents linked above; D27 own-phone capture clarified; no business implementation changed  |
| REV-2  | Reconcile account, identity, consent, stock, payment and AI safety contradictions                 | Todo        | REV-1                |          | Feature reviews include decisions and failure cases; F01 closed by D26                              |
| REV-3  | Correct foundation origins, phone formats, validation fields, Redis URLs and RLS test fixtures    | In review   | REV-1                | #8       | CF-2, CF-4, CF-5, CF-8, CF-9; [plan](plans/core.md)                                                 |
| REV-4  | Establish atomic feature actions and shared queue name dispatch                                   | In progress | REV-1                | #11      | Tenant transaction portion ready for ACC-16 ([plan](plans/core.md)); queue dispatch pending for M2  |
| REV-5  | Align lint promises with enforced rules and verify CI/local check parity                          | Todo        | REV-1                |          | Include negative lint fixtures and independent RLS fixtures                                         |
| REV-6  | Correct prototype findings and captures; complete mobile, error, empty and limit designs          | Todo        | REV-1                |          | Correct theme contrast before WEB-1; preserve legitimate AI product labels                          |
| REV-7  | Define event names, final send gates, real-time recovery and AI latency measurements              | Todo        | REV-1                |          | Required before messaging, workflows and analytics integration                                      |
| REV-8  | Correct final core integration review findings                                                    | In review   | ACC-8                | #41      | Support context, recovery concurrency, enrollment locks, membership pages and logging; blockers #42 |
| REV-9  | Core review merge blockers, cleanup and repository checks                                         | In progress | REV-8                | #42, #43 | Items from docs review of core PRs 8-41                                                             |
| CUS-8  | Customer CSV/XLSX import with mapping, consent evidence, row errors and undo                      | Todo        | CUS-1, CUS-2         |          | Review duplicate-phone policy before implementation                                                 |
| CUS-9  | POS sales CSV import and reconciliation                                                           | Todo        | CUS-8, ORD-1         |          | D6; separate from release 2 POS connectors                                                          |
| CUS-10 | Voice customer entry with review, confidence and usage accounting                                 | Todo        | CUS-1, PAY-1         |          | Define speech provider contract and confirmation before save                                        |
| CUS-11 | Customer export, erasure and derived-data cleanup                                                 | Todo        | CUS-1, ACC-4         |          | Permissions, formula escaping, retention and audit acceptance                                       |
| CUS-12 | Follow-up tasks, assignment, snooze and reminders                                                 | Todo        | CUS-1, HOME-1        |          | Task lifecycle and list/bulk actions need designs                                                   |
| CUS-13 | Customer insights, address book and AI segment suggestions                                        | Todo        | CUS-3, CUS-6, AI-2   |          | Split into vertical slices; explicit permissions and definitions                                    |
| CUS-14 | Reversible merge with existing matching rules and consent chronology                              | Todo        | CUS-4                |          | Q10 storage decision; seven-day undo; D26/D27 self phone save and staff match conflicts             |
| PROD-5 | Product import with row validation and stock reconciliation                                       | Todo        | PROD-2               |          | Preserve variants, stock ledger and order snapshots                                                 |
| PROD-6 | Restock waiting list and approved notifications                                                   | Todo        | PROD-2, CHAT-2       |          | `restock_requests` is in the release 1 schema (DB-5)                                                |
| ACC-12 | Store export, closure, recovery and purge lifecycle                                               | Todo        | ACC-6, DB-3          |          | Retention exceptions and pending jobs/payments must be defined                                      |
| ACC-13 | Setup checklist, extensions and owner audit screen                                                | Todo        | ACC-6, DB-3, WEB-3   |          | Scope-aware steps; stop queued work when disabled                                                   |
| CHN-6  | SMS sender identity request, approval, test and status screens                                    | Todo        | ACC-1, CHN-5         |          | Provider capability and document retention review                                                   |
| ORD-10 | Order printing, bulk labels and exports                                                           | Todo        | ORD-3, ACC-4         |          | Export locks, snapshot totals and permissions                                                       |
| OPS-1  | Reproducible local and staging services, deployments and rollback                                 | Todo        | REV-1                |          | Mailpit, object storage, images and migrations                                                      |
| OPS-2  | Dependency/container scanning and release gates                                                   | Todo        | OPS-1                |          | CI must reject a known failing scan fixture                                                         |
| OPS-3  | Backup restore, incident plan and retention jobs                                                  | Todo        | OPS-1, ACC-12        |          | Record restore evidence; decide recovery and deletion periods                                       |
| OPS-4  | Upload scanning, image re-encoding and export safety                                              | Todo        | PROD-3               |          | Shared file pipeline for chat, knowledge and imports too                                            |
| OPS-5  | Load, browser, accessibility and provider sandbox release checks                                  | Todo        | WEB-5, OPS-1         |          | Separate launch targets from later scale targets                                                    |
| SOC-6  | Weekly content plans, festival suggestions, photo tools and shared ideas                          | Todo        | SOC-4                |          | Settle private/shared drafts, usage and approval revisions                                          |
| CAMP-8 | Release 1 workflow catalogue and typed action contracts                                           | Todo        | REV-2, REV-7         |          | Assign each template a trigger, prerequisites, actions and exit; split CAMP-5 before build          |
| HOME-5 | Notification preferences, push, digests and recipient lifecycle                                   | Todo        | HOME-1, ACC-9        |          | Per-user dedupe, escalation policy and retry charging                                               |
| HOME-6 | Ask Dakly private conversation history and action review                                          | Todo        | HOME-4               |          | User/store scope, retention, revoked permissions and charging                                       |
| ANA-4  | Profit, AI agent reports and company metric definitions                                           | Todo        | ANA-1                |          | Cost basis, delayed attribution and denominator acceptance                                          |
| ADM-6  | Risky admin actions: reason, confirmation and audit row before the change (D28)                   | In review   | ADM-2                | #32      | Read-only break-glass and durable staff alerts implemented; review pending                          |
| ADM-7  | Abuse review, shop suspension and appeals                                                         | Todo        | ADM-2, ADM-5         |          | Current permissions and queued-work revocation                                                      |
| ADM-8  | Announcements, company reports and staff account lifecycle                                        | Todo        | ADM-1, ANA-4         |          | Split into vertical slices; last-admin protection and audit                                         |
| ADM-9  | Staff handling of owner data export and deletion requests                                         | Todo        | ADM-2, ADM-6, ACC-12 |          | Identity evidence, approval, retention exceptions and completion proof                              |
| ADM-10 | Staff account recovery: TOTP reset and phone or email replacement, with identity checks and audit | In review   | ADM-6, ACC-7         | #33      | [plan](plans/core.md)                                                                               |
