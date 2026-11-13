# Development readiness review

Reviewed 13 November 2026. The modular monolith, feature boundaries, shared contracts and database isolation are a sound starting point. The repository is not ready for unrestricted feature implementation: contradictory business rules and unsafe examples need correction before they are copied. Foundation work can continue; the findings below gate the affected slices, not every task.

This review covers all 13 feature specifications, the product decisions and questions, architecture, development workflow, coding rules, application and package source, migrations, tests and check configuration. Feature coverage and proposed acceptance criteria are in the linked reviews. These are review findings and proposed resolutions, not new product decisions. Existing decisions remain authoritative.

## Read the detailed findings

| Review                                 | Coverage                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [Features 01 to 07](features-01-07.md) | Accounts, channels, customers, segments, chats and AI, products, stock, orders, delivery, payments and billing                 |
| [Features 08 to 13](features-08-13.md) | Content, social, campaigns, automations, dashboard, notifications, analytics, staff administration and release 2 physical shop |
| [Code foundation](code-foundation.md)  | All existing application/package code, database isolation, contracts, errors, frontend exemplar and job patterns               |

Release 1 business features are largely specifications. Only the customer example and platform skeleton exist. Authentication deliberately fails closed; the absence of planned features is not a regression. This review does not certify production readiness, vendor approval or legal compliance.

All 117 saved screenshots were inventoried and visually examined across the initial and supplemental visual passes. The visual review records their coverage and evidence. A screenshot can verify visible copy and layout, but cannot prove that a button, permission or state transition works. The live prototype URL could not be retrieved during this review; its interactions remain unverified. No claim of complete live prototype verification is made.

## Verified checks

Dependencies were installed with the existing frozen lockfile. No dependency versions were changed. The disposable PostgreSQL container was removed after verification; existing databases were not used.

| Check                       | Result                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                | Passed: formatting, ESLint, dependency boundaries, type checks, unit tests, unused code, duplication and documentation checks |
| `pnpm build`                | Passed for all seven packages/apps in the build graph                                                                         |
| Unit tests                  | 12 passed across three files                                                                                                  |
| Fresh PostgreSQL migrations | Passed using PostgreSQL 16 and the documented nonowner application role                                                       |
| `pnpm test:int`             | Four customer repository tests passed against a disposable database                                                           |
| Authorship markers          | No unwanted banners found in application source; policy examples intentionally mention prohibited phrases                     |
| Type escape scan            | Existing double assertion appears in a test, where CLAUDE.md permits it                                                       |

These checks cover the skeleton. There are no completed feature flows or browser acceptance tests yet. The database tests are useful but need stronger independent fixtures and negative cases before they become the isolation template; see the code review.

The production dependency audit (`pnpm audit --prod --json`) reported zero known advisories across 259 dependencies at review time. This is a registry advisory check, not a security certification or a container scan.

## Resolve before copying the foundation

1. Stop logging raw unknown database errors. The locked Drizzle serializer includes query parameters in error messages, which can disclose customer names and full phones.
2. Establish an atomic action pattern for order, stock and outbox changes across feature services. Each current repository call opens its own transaction; sequential service calls do not make a single atomic action.
3. Correct the shared-queue job example. One queue processor must dispatch by job name to the feature handlers. Separate workers registered for different names on one queue do not automatically receive only that name; see the [BullMQ named processor documentation](https://docs.bullmq.io/patterns/named-processor).
4. Define the web/API origin arrangement, preserve field validation errors, normalize all promised phone formats and correct the provider credential contracts before using the customer example as the full implementation pattern.
5. Correct theme contrast guidance before WEB-1. White text on the current orange does not meet AA for the documented small buttons. See the measured ratios and standards evidence in the feature review.

Each finding in the detailed reviews includes a concrete fix or acceptance criterion. No business implementation was changed by this review.

## Cross-cutting gaps

### CHECK-1 Local checks are narrower than CI

[package.json](../../package.json) omits build and database tests from `check`, while [CI](../../.github/workflows/ci.yml) runs both. CLAUDE.md's description of `check` as everything CI runs is therefore inaccurate. Retain a fast check if useful, but document a distinct full verification command including a fresh database migration and integration tests. It must propagate nonzero exits.

The architecture also describes dependency/container scans and automatic staging deployment that the only workflow does not implement. There are no deployment manifests or container build definitions in the tracked repository. These are launch work, not existing safeguards. Add explicit tasks and require a staging deployment, scan results and rollback/restore evidence before launch.

### CHECK-2 Lint does not enforce all claimed conventions

ESLint accepts a production `as unknown as` assertion: verified with stdin using a contracts source filename. It also accepts a JSX authorship banner. The documentation checker scans Markdown and source comments, not rendered strings; it cannot enforce the UI-copy promise. Preserve legitimate product AI badges, which are explicitly required, while rejecting tool-authorship banners.

Other gaps visible in configuration: no type-aware unsafe/floating promise rules; no ban on interface declarations; no restriction on services importing HTTP exceptions or reading the environment; no boundary preventing web code from importing core/database; and no external-package allowlist enforcing contracts as zod-only. React Hooks lint is already tracked as WEB-6. Knip treats every package source file as an entry, so unused exports inside packages are less visible than its successful result implies.

Acceptance: add small valid/invalid lint fixtures for the rules claimed to be automated, run them in CI, and label remaining conventions as review checks. Do not add blanket exceptions to make those fixtures pass. UI wording checks must distinguish visible strings, comments, examples and legitimate feature labels.

### ARCH-1 Latency targets exclude no time for debounce

[Architecture](../architecture.md#1-inbound-message-and-ai-reply) schedules a reply eight seconds after the customer message. [Scale rules](../rules/scale.md#performance-budgets) require a reply in under eight seconds at p95 and under four at p50. The debounce alone violates those targets. Define separate measurements from first message, final message and debounce completion, choose a supported default, and include queue/vendor time in a load test. Do not claim the current targets can all hold simultaneously.

### ARCH-2 Real-time transport and recovery are not settled

[Architecture](../architecture.md#real-time) specifies Socket.IO or WebSocket, while [frontend state rules](../rules/frontend-data-and-state.md#api-calls) and HOME-1 specify SSE. Choose the transport per event family and document reconnect cursors, missed-event recovery, membership revocation, store switching and cache clearing. Test switching stores while a stream is live: no old-store data may remain or arrive in the new store's cache.

### ARCH-3 Sensitive AI traces and retention conflict

[Scale and security](../scale-and-security.md#ai-runtime) asks the gateway to log masked prompts and outputs. [Logging rules](../rules/logging.md) explicitly forbid logging prompts and replies. Define the difference between operational logs and any access-controlled product trace, with field minimization, retention and deletion tests. Masking a phone field cannot make arbitrary chat text safe. Apply the strict no-content logging rule until the trace contract is settled.

Encryption also has competing text: per-store data keys in [security rules](../rules/security.md#secrets-and-keys), versus the pending master-key simplification in scale and security. Retention has pending 7/14-day raw-webhook alternatives. Resolve Q10 before DB-4 and affected schema work; do not silently select one interpretation.

### ARCH-4 Launch operations have no complete work breakdown

The tracker lacks explicit ownership for data export/erasure, retention jobs, upload malware checks/image re-encoding, dependency/container scans, deployment/rollback, backup restoration, performance tests and incident readiness. Local Compose has PostgreSQL and Redis only; Mailpit and S3-compatible local storage described elsewhere are not present.

Add launch gates with demonstrable results: a fresh environment from documented steps; restricted application credentials; an upload rejected by validation; an export that cannot execute spreadsheet formulas; a deletion that also removes derived search/vector/object data; a verified restore; and a failing dependency or container scan that blocks release. The capacity document mixes launch-sized tests with its 300,000-shop acceptance target. Assign each target to its intended stage before estimating release 1 work.

### PLAN-1 The tracker does not cover every documented feature

The detailed coverage matrices identify backend work hidden behind broad screen tasks or absent entirely. ORD-9 is referenced in the orders feature and build order but has no row. Customer import, merge undo, follow-ups, product import/restock requests and store closure need explicit ownership. A UI task does not imply an implemented export, reconciliation job or deletion lifecycle.

The new rows in [tasks.md](../tasks.md) make these gaps visible. Split them into vertical slices before implementation. The review rows remain Todo until their evidence is supplied; passing the current skeleton tests does not close them.

## Development gates

- Before ACC tasks: settle session lifetimes, password rules, owner-count/transfer rules; establish cookie origins, CSRF and cache revocation tests.
- Before stock/orders: settle reserve/release/ship/return invariants, expiry and partial transitions; test concurrent last-item orders and atomic rollback with outbox writes.
- Before channels/marketing: validate actual provider capabilities and approvals; specify consent, eligibility, expiry and retries at send time, including ambiguous provider outcomes.
- Before billing: settle late-success/refund/reconciliation states, allowance reservations and per-store credentials. Confirm prices, taxes and vendor eligibility through the appropriate product/provider review; sample numbers are not approval.
- Before live AI: settle trace retention, model availability/evaluation, handover races, usage charging and latency measurements; require the golden-set results and operational kill switch.
- Before launch: finish the operational tasks, complete mobile/keyboard/error/empty-state designs, and execute real browser and provider-sandbox money/message paths.

Q1, Q2, Q3, Q7, Q8, Q9, Q10, Q11, Q13 and Q15 remain product questions, with Q4/Q5 retained for business/release 2 planning. Existing working assumptions may support reversible work; they do not resolve contradictory acceptance criteria or approve vendor capabilities. F01 is closed by D26, which supersedes D25 for matching: no OTP is required; the buyer owns the order and its purchase history, while recipient details stay on that order. Staff confirmation and delivery do not merge contacts. D27 clarifies that self-delivery also saves the supplied own phone on the buyer profile before order creation; duplicate phones remain on the draft or order for staff review without blocking it. Saving does not verify ownership, merge contacts or grant marketing consent. This review does not reopen settled decisions D1–D27.
