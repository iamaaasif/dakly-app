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

| ID    | Task                                                                                 | Status    | Depends | PR  | Notes                                                      |
| ----- | ------------------------------------------------------------------------------------ | --------- | ------- | --- | ---------------------------------------------------------- |
| FND-1 | Monorepo, lint, boundaries, CI, customers example feature                            | Done      |         | -   |                                                            |
| FND-2 | Fastify adapter and Express ban                                                      | Done      | FND-1   | #1  |                                                            |
| FND-3 | Docs: product context, feature docs, rules, workflow, tracker, docs lint             | In review | FND-1   | #2  | This PR                                                    |
| DB-1  | UUID v7 ids generated in the app; switch existing tables                             | Todo      |         |     |                                                            |
| DB-2  | Outbox table, outbox relay job, event publishing helper                              | Todo      | DB-1    |     |                                                            |
| DB-3  | Audit log table and `AuditService.record`                                            | Todo      | DB-1    |     |                                                            |
| DB-4  | Envelope encryption for shop credentials (`platform/crypto`)                         | Todo      |         |     |                                                            |
| API-1 | Logging (nestjs-pino), request ids, Sentry                                           | Todo      |         |     |                                                            |
| API-2 | Rate limiting with Valkey storage                                                    | Todo      |         |     |                                                            |
| API-3 | Route test that fails when a store route has no permission decorator                 | Todo      | ACC-3   |     |                                                            |
| WEB-1 | Tailwind v4, theme tokens, `packages/ui` with Button, Input, Card, Badge, Skeleton   | Todo      |         |     | [design/theme.md](design/theme.md)                         |
| WEB-2 | `packages/ui`: Dialog, Sheet, DropdownMenu, Tabs, Table, Toast, Tooltip, form fields | Todo      | WEB-1   |     |                                                            |
| WEB-3 | App shell: sidebar, header, store switcher, phone layout                             | Todo      | WEB-1   |     |                                                            |
| WEB-4 | `lib/format-money.ts`, `lib/format-date.ts`, `lib/format-phone.ts` with tests        | Todo      |         |     |                                                            |
| WEB-5 | Testing Library and Playwright set up with one end-to-end test                       | Todo      | WEB-3   |     |                                                            |
| WEB-6 | Add `eslint-plugin-react-hooks` to lint                                              | Todo      |         |     | Lockfile age rule blocked it on 13 Nov; retry after 15 Nov |

## M1. Account, stores and team

| ID     | Task                                                                 | Status | Depends      | PR  | Notes             |
| ------ | -------------------------------------------------------------------- | ------ | ------------ | --- | ----------------- |
| ACC-1  | SMS driver interface and one provider driver                         | Todo   |              |     |                   |
| ACC-2  | Sign-up and sign-in by SMS code (users, stores, memberships)         | Todo   | ACC-1, DB-1  |     |                   |
| ACC-9  | Email driver (Amazon SES) and sign-in by email code                  | Todo   | ACC-2        |     | D20               |
| ACC-10 | Password sign-in for phone and email; forgot password                | Todo   | ACC-2        |     | D20               |
| ACC-11 | Google sign-in (OpenID Connect)                                      | Todo   | ACC-2        |     | D20               |
| ACC-3  | Sessions: cookie, Valkey cache, `@CurrentUser`, `@RequirePermission` | Todo   | ACC-2        |     |                   |
| ACC-4  | Roles and permissions function with built-in roles                   | Todo   | ACC-3        |     | Q10 roles in code |
| ACC-5  | Invite, accept and remove members                                    | Todo   | ACC-4        |     |                   |
| ACC-6  | Store switcher and store settings                                    | Todo   | ACC-3        |     | Q3 extra stores   |
| ACC-7  | Devices list and remote sign-out; TOTP 2-step                        | Todo   | ACC-3        |     |                   |
| ACC-8  | Web: sign-up, sign-in, team, store settings screens                  | Todo   | ACC-5, WEB-3 |     |                   |

## M2. Shared plumbing

| ID     | Task                                                    | Status | Depends     | PR  | Notes |
| ------ | ------------------------------------------------------- | ------ | ----------- | --- | ----- |
| HOME-1 | Notifications: table, dedupe, Server-Sent Events stream | Todo   | DB-2, ACC-3 |     | Q10   |
| HOME-2 | Web: notification bell and list                         | Todo   | HOME-1      |     |       |
| PAY-1  | Usage service: units, allowances, usage events          | Todo   | ACC-3       |     |       |

## M3. Channels and customers

| ID    | Task                                                                   | Status  | Depends      | PR  | Notes        |
| ----- | ---------------------------------------------------------------------- | ------- | ------------ | --- | ------------ |
| CUS-1 | Rename customers to contacts; add channel identities and contact kinds | Todo    | ACC-3        |     | Q10          |
| CUS-2 | Consent: append-only rows, current-consent view, STOP keywords         | Todo    | CUS-1        |     |              |
| CUS-3 | Contact stats table and refresh jobs                                   | Todo    | CUS-1        |     |              |
| CUS-4 | Phone matching and merge (verified phones only)                        | Todo    | CUS-1        |     | Q10 must-fix |
| CHN-1 | Meta webhook intake: signature, `webhook_events`, enqueue              | Todo    | DB-1         |     |              |
| CHN-2 | Messenger and Instagram connect (Facebook Login for Business)          | Todo    | DB-4, ACC-4  |     |              |
| CHN-3 | WhatsApp connect (Embedded Signup)                                     | Blocked | CHN-2        |     | Q2 BSP       |
| CHN-4 | Store lookup function for webhooks; token health job                   | Todo    | CHN-1        |     |              |
| CHN-5 | Web: Integrations page                                                 | Todo    | CHN-2, WEB-3 |     |              |
| CUS-5 | Web: All customers list and profile                                    | Todo    | CUS-3, WEB-2 |     |              |

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

| ID    | Task                                                    | Status | Depends       | PR  | Notes         |
| ----- | ------------------------------------------------------- | ------ | ------------- | --- | ------------- |
| ORD-1 | Orders, items, stage table, stage events, order numbers | Todo   | PROD-2, CUS-1 |     | Q7            |
| ORD-2 | Delivery zones, areas and charges                       | Todo   | ACC-3         |     |               |
| ORD-3 | Create order from chat and from staff                   | Todo   | ORD-1, ORD-2  |     |               |
| ORD-4 | Order confirmation by WhatsApp or SMS reply             | Todo   | ORD-3, CHAT-2 |     |               |
| ORD-5 | Web: orders pipeline and order detail                   | Todo   | ORD-3, WEB-2  |     |               |
| ORD-6 | Public order link page and endpoint (Turnstile, limits) | Todo   | ORD-3         |     | Design needed |

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
| CAMP-5 | Automation recipes and runs                                      | Todo    | CAMP-3        |     | Q6                         |
| CAMP-6 | Web: automations list and recipe editor                          | Todo    | CAMP-5        |     |                            |
| CAMP-7 | Messenger campaigns to opted-in people                           | Blocked | CAMP-3        |     | Q14                        |
| ANA-1  | Glossary report functions and daily summary tables               | Todo    | ORD-3         |     |                            |
| ANA-2  | Attribution of orders to messages and posts                      | Todo    | ANA-1, CAMP-3 |     |                            |
| ANA-3  | Web: Analytics tabs                                              | Todo    | ANA-2         |     |                            |
| HOME-3 | Web: Dashboard cards                                             | Todo    | ANA-1         |     |                            |
| HOME-4 | Ask Dakly AI with read-only report tools                         | Todo    | ANA-1, AI-2   |     |                            |

## M12. Admin panel

| ID    | Task                                                                          | Status | Depends      | PR  | Notes |
| ----- | ----------------------------------------------------------------------------- | ------ | ------------ | --- | ----- |
| ADM-1 | `apps/admin`, staff users, passkey or TOTP, staff sessions, Cloudflare Access | Todo   | WEB-1        |     |       |
| ADM-2 | Staff audit log; support grants with owner approval                           | Todo   | ADM-1        |     |       |
| ADM-3 | Shops list and detail through report functions                                | Todo   | ADM-2        |     |       |
| ADM-4 | Plans catalogue, refunds, credits, reconciliation queue                       | Todo   | ADM-2, PAY-7 |     |       |
| ADM-5 | Kill switches, feature flags, provider health, AI cost per shop               | Todo   | ADM-2, AI-2  |     |       |
