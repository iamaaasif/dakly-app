# Core build plan: foundation, account, stores and team

The order to build milestone M0 (only the parts the core needs) and M1 ([feature 01](../features/01-account-and-team.md)), split into tasks of one PR each. Status lives in [tasks.md](../tasks.md); this file holds what each task must do. Delete a task's section once it is Done and the feature doc describes it.

Read with: [CLAUDE.md](../../CLAUDE.md), [workflow.md](../development/workflow.md), [auth-and-permissions.md](../rules/auth-and-permissions.md), [multi-tenancy.md](../rules/multi-tenancy.md), [isolation-and-access.md](../data/isolation-and-access.md), [code-foundation review](../reviews/code-foundation.md).

## Decisions for the core

The feature doc contradicted itself in a few places ([review](../reviews/features-01-07.md) F08 to F11). Asif confirmed these on 13 November 2026: C5 as [D34](../product/decisions.md), the rest as [D35](../product/decisions.md).

| #   | Question                              | Decision                                                                                                                                                                                               |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | Lockout (F08)                         | ACC-R2: 5 wrong codes or passwords in a row for one account (its phone and email share one counter) lock its sign-in for 15 minutes, and tell the person by SMS or email. Per IP: 30 failures an hour. |
| C2  | Session lifetime (F09)                | ACC-R3: "Keep me signed in" lasts 30 days, sliding. Otherwise the session ends after 12 hours without a request.                                                                                       |
| C3  | Owner count (F11)                     | Exactly one Owner per store (the schema already allows at most one). Ownership moves only by transfer (ACC-18).                                                                                        |
| C4  | Sign-up identity                      | Every new account verifies a mobile number (step 1 screen, ACC-R4). Email code, email password and Google are ways to sign in to an account that has them.                                             |
| C5  | Free or trial (review, line 144)      | D34: the trial length is `plans.trial_days`, set in the admin panel. Nothing in code says 14. A paid plan with 0 days needs payment, which waits for PAY-7 (see ACC-16).                               |
| C6  | Web and API origin (code review CF-2) | Same origin: the web app forwards `/api/*` to the API (Next.js rewrites locally, the load balancer in production). No CORS. The `Origin` check runs on every browser write.                            |
| C7  | MFA (F10)                             | Turning TOTP on is optional in release 1. Once a user turns it on, every way of signing in asks for it. Requiring it for Owners before a payment gateway connects is built with PAY-2.                 |

Q3 (one store per account) and Q11 (no organisation) keep their working answers: a user creates one store at sign-up; the data model allows more.

Sign-up has two commits, not one: verifying the code creates the user and a session with no store (ACC-2); the business details step creates the store, Owner membership and plan (ACC-16). A user who stops in between signs in later and lands on the business details step. Invited users skip it.

## External accounts and dev stubs

SMS sender, SendGrid domain and Google OAuth client are not ready. Every vendor sits behind a driver in `packages/providers`, chosen by config:

| Driver                 | Development, CI and tests                                                           | Production                                |
| ---------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------- |
| `SmsDriver`            | `MailpitSmsDriver`: sends the SMS text as an email to `<phone>@sms.test` in Mailpit | Provider driver, ACC-14 (blocked)         |
| `EmailDriver`          | `SmtpEmailDriver` to Mailpit                                                        | `SendGridEmailDriver`                     |
| `GoogleIdentityDriver` | `FakeGoogleIdentityDriver`: accepts `fake-google:` followed by JSON claims          | `GoogleTokenDriver` (google-auth-library) |

Config refuses to start in production with a Mailpit, SMTP or fake driver selected. Tests use in-memory fakes that record what was sent. Passing CI with these drivers proves nothing about the live vendors: a real SMS send, a SendGrid send from the verified domain and a real Google sign-in are each checked by hand on staging before launch.

## Shape of the code

| Folder in `packages/core/src` | Owns                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform/`                   | Database scope, Valkey client, rate limiter, cookie and origin checks, route access decorators and the guards that read `request`            |
| `auth/`                       | `users` table, sign-in codes, passwords, Google, TOTP, sign-up, the one place that finishes a sign-in                                        |
| `sessions/`                   | `sessions` table, cookie token, the global guard that loads a session, store switching                                                       |
| `stores/`                     | `stores`, `store_counters`, store settings, extensions                                                                                       |
| `team/`                       | `memberships`, `roles`, `permissions.ts`, built-in roles, invites, ownership transfer, the current access of each member                     |
| `billing/`                    | Only `BillingService.startPlan` and the plan catalogue read in M1; the rest is PAY-7. No price, trial length or discount is a constant (D34) |
| `audit/`                      | `AuditService.record`                                                                                                                        |

Platform cannot import features ([.dependency-cruiser.cjs](../../.dependency-cruiser.cjs)). So `platform` holds only the decorators and guards that read `request.userId`, `request.storeId` and `request.access` (the feature doc's `request.permissions`); `sessions/` fills them in by calling `TeamService.accessFor`. Dependencies run one way: `auth` and `sessions` call `team`; `team` never calls `sessions`. Each request reads its session and current store access from the primary PostgreSQL database. No session or permission result is reused across requests, so revocation does not depend on a cache update after commit.

Every route is one of three kinds, marked on the controller or handler: `@Public()` (sign-in, invite preview, webhooks), `@RequireUser()` (signed in, store not needed: `/me`, `POST /stores`, invite accept) or a store route (`StoreGuard` plus `@RequirePermission` or `@AnyMember()`). API-3 fails the build on a route with none of them.

## Tasks

Each task is one PR under about 500 lines, in this order, on the branch named under its heading ([branch names](../rules/pull-requests.md)). "Tests" lists what the reviewer looks for. Every PR also sets its row in [tasks.md](../tasks.md) and updates the feature doc when behaviour changes.

### REV-3 · Foundation fixes before auth

Branch: `fix/rev-3-foundation-review-fixes`

- Scope: code review CF-4 (phone: Bangla digits and 10-digit national form normalise to `01XXXXXXXXX`), CF-5 (validation errors carry `fields: [{ path, message }]`, no submitted values), CF-2 by C6 (rewrite in `apps/web/next.config.ts`, `api-client.ts` calls `/api`), CF-8 (Redis URL keeps the database number, rejects schemes other than `redis:` and `rediss:`), CF-9 (RLS read test seeds its own rows).
- Files: `packages/contracts/src/phone.ts`, `errors.ts`, `platform/validation/`, `platform/errors/`, `platform/queue/redis-connection.ts`, `platform/config/env.ts`, `apps/web`.
- Tests: table-driven phone cases from the review; a request with two bad fields returns both paths; Redis URL cases; the RLS read test passes alone and fails with the policy dropped.

### API-1 · Request logging without personal data

Branch: `feat/api-1-request-logging`

- Scope: `nestjs-pino` with a request id per request (returned as `X-Request-Id`), redaction of `phone`, `email`, `password`, `code`, `token`, cookies and authorization headers. CF-1: the error filter logs an error class, code and sanitised stack, never the message of a database error or its cause; the Sentry hook (only when `SENTRY_DSN` is set) uses the same serialiser.
- Rules: [logging.md](../rules/logging.md), [security.md](../rules/security.md).
- Tests: a failed query with a synthetic phone, name and secret goes through the filter; the captured log and the Sentry event have none of them; the response is `500 INTERNAL_ERROR`.

Implemented in `platform/logging/` and the global error filter; the API selects the pino-backed Nest logger at startup. [Architecture](../architecture.md#api-request-logging) describes the allowlisted logs and optional Sentry transport. Job logging and session-derived store context belong to their later tasks.

### API-2 · Valkey client and rate limiter

Branch: `feat/api-2-valkey-rate-limiter`

- Scope: one `ValkeyClient` provider in `platform/cache/` (ioredis, from `REDIS_URL`), and `RateLimiter.consume(key, limit, windowSeconds)` returning allowed or retry-after, atomic in Valkey (one script or `INCR` with `EXPIRE NX`). Add a Redis service to `.github/workflows/ci.yml`. No `@nestjs/throttler` yet: auth needs per-account keys, not per-route.
- Tests (integration): the 6th call in a window of 5 is refused with the right retry-after; 20 calls in parallel against a limit of 5 let exactly 5 through; two keys do not share a count; the window resets.

Implemented in `platform/cache/`: `CacheModule` exports one `ValkeyClient` from `REDIS_URL` and `RateLimiter`. A Lua script starts a fixed window on the first call, counts each attempt and refuses calls beyond the limit without extending the window. `consume` returns `{ allowed, retryAfter }`; retry-after is zero when allowed and the remaining time rounded up to seconds when refused. Callers supply namespaced keys and positive integer limits and window lengths. Auth-specific keys and accounting belong to ACC-2. CI runs the integration tests against Redis.

### REV-4 · One transaction across features for one store

Branch: `feat/rev-4-store-transaction`

- Scope: CF-6, the atomic part. Job dispatch by name, the other part of REV-4, was done in #55. `TenantDatabase.forStore` keeps an AsyncLocalStorage scope: a nested call for the same store joins the open transaction; a nested call for another store throws. Add `StoreTransaction.run(storeId, work)` and `StoreTransaction.runForNewStore(work)` (generates a UUID v7 and passes it in) that services may call without seeing Drizzle. Global tables (`users`, `sessions`) are written outside any store transaction and never roll back with one; a flow that writes both says which commit comes first and how a retry resumes (ACC-16 is the first).
- Rules: services never import Drizzle; never call a vendor inside the scope ([CLAUDE.md](../../CLAUDE.md)).
- Tests (integration): two repositories write in one scope and both roll back when the second throws; nested same-store call joins; different-store call throws and leaves nothing written; the scope is gone after commit and after rollback.

### ADM-10 · Staff account recovery

Branch: `feat/adm-10-staff-account-recovery`

Built with the admin app (after ADM-1, ADM-2, ADM-6), planned here because it changes sign-in.

- Scope: a staff member with the support role can, for a person who lost their phone, authenticator or email: remove TOTP and backup codes, replace the phone or email with a newly verified one, and sign out all their sessions. A new phone or email is verified with a code sent to it; removing 2-step with no new contact is verified with a code sent to a current verified phone or email. One admin service method does it, following D28: reason (required, free text plus a reason type), the identity checks done (NID last 4 digits matched, store details matched, call-back to the old number attempted; recorded as which checks passed, never the NID itself), a confirmation step, and a `staff_audit_log` row written before the change; the change fails if that write fails. The same transaction writes `account_security_events` (actor `staff`, staff id, reason type) and revokes every session of the user. ACC-3 reads session revocation from the primary database on each request, including account routes that need no store. No post-commit cache operation is needed to end access.
- Takes effect at once (D36), so it is guarded: staff cannot recover their own shop accounts or a staff account; the user and the Owner of each of their stores get an SMS and email at the old and new addresses naming what changed and when.
- The shop sees it: the Owner's audit log page and the user's Security screen show "Recovered by Dakly support" with the date and reason type.
- Tests: integration that the staff audit row exists before the change and that a failed audit write leaves the account untouched; use each old session before recovery, then verify that all return 401 on both account and store routes after recovery commits; a session lookup paused before recovery cannot restore access for later requests; a staff member cannot recover their own linked shop account; notifications go to old and new addresses; the person can then sign in with the new phone and set up TOTP again.

## Out of this plan

Outbox and events (DB-2) wait for their first consumer in M2. Setup checklist and the audit log page (ACC-13), store closing and export (ACC-12), billing screens and checkout (PAY-7) and the breached-password check are separate tasks. Real SMS provider: ACC-14, blocked until the account exists.

## How each task is reviewed

The reviewer checks, in this order: the branch is named as below its task; the task row and scope match this plan; imports (no Express, no Drizzle in services, no other feature's repository, no `team` to `sessions` import); every route has its access marker; store id only from the session; every rule above has a test that fails without the code; error codes come from the feature's `*.errors.ts`; nothing logs a phone, email, code or token; nothing extra (options, helpers, abstractions) the task does not need; `pnpm check` and `pnpm test:int` pass in CI.
