# Core build plan: foundation, account, stores and team

The order to build milestone M0 (only the parts the core needs) and M1 ([feature 01](../features/01-account-and-team.md)), split into tasks of one PR each. Status lives in [tasks.md](../tasks.md); this file holds what each task must do. Delete a task's section once it is Done and the feature doc describes it.

Read with: [CLAUDE.md](../../CLAUDE.md), [workflow.md](../development/workflow.md), [auth-and-permissions.md](../rules/auth-and-permissions.md), [multi-tenancy.md](../rules/multi-tenancy.md), [isolation-and-access.md](../data/isolation-and-access.md), [code-foundation review](../reviews/code-foundation.md).

## Decisions for the core

The feature doc contradicted itself in a few places ([review](../reviews/features-01-07.md) F08 to F11). Asif confirmed these on 13 November 2026: C5 as [D34](../product/decisions.md), the rest as [D35](../product/decisions.md).

| #   | Question                              | Decision                                                                                                                                                                             |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | Lockout (F08)                         | ACC-R2: 5 wrong codes or passwords in a row for one phone or email locks sign-in for that account for 15 minutes, and tells the person by SMS or email. Per IP: 30 failures an hour. |
| C2  | Session lifetime (F09)                | ACC-R3: "Keep me signed in" lasts 30 days, sliding. Otherwise the session ends after 12 hours without a request.                                                                     |
| C3  | Owner count (F11)                     | Exactly one Owner per store (the schema already allows at most one). Ownership moves only by transfer.                                                                               |
| C4  | Sign-up identity                      | Every new account verifies a mobile number (step 1 screen, ACC-R4). Email code, email password and Google are ways to sign in to an account that has them.                           |
| C5  | Free or trial (review, line 144)      | Decided by D34: the trial length is `plans.trial_days`, set in the admin panel. A plan with 0 days (Free at launch) starts with no trial. Nothing in code says 14.                   |
| C6  | Web and API origin (code review CF-2) | Same origin: the web app forwards `/api/*` to the API (Next.js rewrites locally, the load balancer in production). No CORS. The `Origin` check still runs on every write.            |
| C7  | MFA (F10)                             | TOTP is optional in release 1. Requiring it for Owners before a payment gateway connects is built with PAY-2, not here.                                                              |

Q3 (one store per account) and Q11 (no organisation) keep their working answers: a user creates one store at sign-up; the data model allows more.

## External accounts and dev stubs

SMS sender, SendGrid domain and Google OAuth client are not ready. Every vendor sits behind a driver in `packages/providers`, chosen by config:

| Driver                 | Development and tests                                                               | Production                                   |
| ---------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------- |
| `SmsDriver`            | `MailpitSmsDriver`: sends the SMS text as an email to `<phone>@sms.test` in Mailpit | Provider driver, ACC-14 (blocked)            |
| `EmailDriver`          | `SmtpEmailDriver` to Mailpit (`docker compose` adds it)                             | `SendGridEmailDriver`                        |
| `GoogleIdentityDriver` | `FakeGoogleIdentityDriver`: accepts `fake:<subject>:<email>` tokens                 | `GoogleIdentityDriver` (google-auth-library) |

Config refuses to start in production with a Mailpit, SMTP or fake driver selected. Tests use in-memory fakes that record what was sent.

## Shape of the code

| Folder in `packages/core/src` | Owns                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `platform/`                   | Database scope, Valkey client, rate limiter, cookie and origin checks, `@RequirePermission` and the guards that read `request`            |
| `auth/`                       | `users` table, sign-in codes, passwords, Google, sign-up                                                                                  |
| `sessions/`                   | `sessions` table, cookie token, the global guard that loads a session, store switching                                                    |
| `stores/`                     | `stores`, `store_counters`, store settings, extensions                                                                                    |
| `team/`                       | `memberships`, `roles`, `permissions.ts`, built-in roles, invites                                                                         |
| `billing/`                    | Only `BillingService.startPlan` in M1, reading `plans`; the rest is PAY-7. No price, trial length or discount is a constant in code (D34) |
| `audit/`                      | `AuditService.record`                                                                                                                     |

Platform cannot import features ([.dependency-cruiser.cjs](../../.dependency-cruiser.cjs)). So `platform` holds only the decorator and guards that read `request.storeId`, `request.userId` and `request.access`; `sessions/` fills them in by calling `TeamService`.

## Tasks

Each task is one PR under about 500 lines, in this order. "Done when" is the acceptance; "Tests" lists what the reviewer looks for. Every PR also sets its row in [tasks.md](../tasks.md) and updates the feature doc when behaviour changes.

### REV-3 · Foundation fixes before auth

- Scope: code review CF-4 (phone: Bangla digits and 10-digit national form normalise to `01XXXXXXXXX`), CF-5 (validation errors carry `fields: [{ path, message }]`, no submitted values), CF-2 by C6 (rewrite in `apps/web/next.config.ts`, `api-client.ts` calls `/api`), CF-8 (Redis URL keeps the database number, rejects schemes other than `redis:` and `rediss:`), CF-9 (RLS read test seeds its own rows).
- Files: `packages/contracts/src/phone.ts`, `errors.ts`, `platform/validation/`, `platform/errors/`, `platform/queue/redis-connection.ts`, `platform/config/env.ts`, `apps/web`.
- Tests: table-driven phone cases from the review; a request with two bad fields returns both paths; Redis URL cases; the RLS read test passes alone and fails with the policy dropped.

### API-1 · Request logging without personal data

- Scope: `nestjs-pino` with a request id per request (returned as `X-Request-Id`), redaction of `phone`, `email`, `password`, `code`, `token`, cookies and authorization headers. CF-1: the error filter logs an error class, code and sanitised stack, never the message of a database error or its cause. Sentry only when `SENTRY_DSN` is set.
- Rules: [logging.md](../rules/logging.md), [security.md](../rules/security.md).
- Tests: a failed query with a synthetic phone, name and secret goes through the filter; the captured log has none of them, the response is `500 INTERNAL_ERROR`.

### API-2 · Valkey client and rate limiter

- Scope: one `ValkeyClient` provider in `platform/cache/` (ioredis, from `REDIS_URL`), and `RateLimiter.consume(key, limit, windowSeconds)` returning allowed or retry-after. Add a Redis service to `.github/workflows/ci.yml` for integration tests. No `@nestjs/throttler` yet: auth needs per-phone keys, not per-route.
- Tests (integration): the 6th call in a window of 5 is refused with the right retry-after; keys for two phones do not share a count; the window resets.

### REV-4 · One transaction across features for one store

- Scope: CF-6, the atomic part only (queue dispatch stays in REV-4 for M2). `TenantDatabase.forStore` keeps an AsyncLocalStorage scope: a nested call for the same store joins the open transaction; a nested call for another store throws. Add `StoreTransaction.run(storeId, work)` and `StoreTransaction.runForNewStore(work)` (generates a UUID v7 and passes it in) that services may call without seeing Drizzle. Repositories for global tables (`users`, `sessions`) use the plain database and are never called inside a store transaction for a write that must roll back with it.
- Rules: services never import Drizzle; never call a vendor inside the scope ([CLAUDE.md](../../CLAUDE.md)).
- Tests (integration): two repositories write in one scope and both roll back when the second throws; nested same-store call joins; different-store call throws and leaves nothing written; the scope is gone after commit and after rollback.

### DB-3 · Audit log service

- Scope: `audit/audit.service.ts` with `record(storeId, entry)`, writing `audit_log` inside the caller's store transaction when there is one. Entry: actor (user or system), action, entity type and id, before and after (ids and changed fields only, no phone or email), IP.
- Tests (integration): the row commits with the caller and rolls back with it; store B cannot read store A's rows.

### ACC-4 · Permissions function and built-in roles

- Scope: in contracts, `permissionAreas` (the list in the feature doc, `shopSales` and `dueBook` included for release 2), `accessLevels` (`none`, `view`, `edit`) and the `StoreAccess` type (`role`, `areas`, flags `seeFullPhone`, `exportLists`, `refund`). In `team/`: `built-in-roles.ts` (Owner, Admin, Marketer, Support agent from the feature doc table; every role gets `dashboard: view`; `segments` follows `customers`; only Owner and Admin get the three flags) and `permissions.ts` with `canAccess(access, area, level)`. In `platform/`: `@RequirePermission('orders.edit')` and `PermissionGuard`, which reads `request.access` and throws `403 PERMISSION_DENIED`.
- Rules: rule 4 of [auth-and-permissions.md](../rules/auth-and-permissions.md): no `role === 'owner'` anywhere else.
- Tests: table-driven from the feature doc table, one row per role and area; `edit` implies `view`; unknown role has no access.

### ACC-3 · Sessions

- Scope:
  - `sessions/`: create (32 random bytes, SHA-256 stored, lifetime by C2), resolve (Valkey cache keyed by hash, 60 s, then Postgres), revoke one, revoke all of a user's sessions for a store, `lastSeenAt` written at most every 5 minutes.
  - Global `SessionGuard` (registered with `APP_GUARD`): reads the `dakly_session` cookie (`@fastify/cookie`; `HttpOnly`, `Secure` outside development, `SameSite=Lax`, `Path=/`), sets `request.userId`, `request.sessionId`, and, when the session has an active store and `TeamService.accessFor(storeId, userId)` returns an active membership, `request.storeId` and `request.access`. A missing or bad cookie is not an error here; `StoreGuard` and `PermissionGuard` reject later.
  - `OriginGuard`: for POST, PUT, PATCH and DELETE, `Origin` must be in `WEB_ORIGINS`, else `403 ORIGIN_REJECTED`.
  - `@CurrentUser()` decorator. Routes: `POST /auth/sign-out`, `GET /me`, `GET /me/stores` (`stores_for_user`), `POST /me/active-store` (refuses a store without an active membership with the same 404 as a missing store).
- Rules: auth rules 1, 2, 7, 8, 10. Never a JWT.
- Tests: integration for the repository and for `accessFor` after removal returning nothing; `app.inject()`: no cookie on a store route gives `401 STORE_REQUIRED`; an expired, revoked or unknown token gives the same; a write from another origin gives 403; switching to a store you are not in gives 404; a removed member's next request gives 401 (rule 3 of the feature doc).

### API-3 · Every store route has a permission

- Scope: a test that lists every route on the Nest app and fails when a route under `StoreGuard` has no `@RequirePermission` and is not on a short, named allowlist (`GET /store/setup-checklist` and other "any member" routes from [api-routes.md](../data/api-routes.md)).
- Tests: the test itself, plus a fixture controller without a permission that makes it fail.

### ACC-1 · SMS driver and Mailpit

- Scope: `SmsDriver` type in `packages/providers/src/sms/` (`send({ to, text })`, returns a provider message id), `MailpitSmsDriver`, an in-memory fake for tests. Add Mailpit to `docker-compose.yml` (SMTP 1025, UI 8025). Text is never logged.
- Tests: the fake records the message; config with `SMS_DRIVER=mailpit` in production fails at start.

### ACC-2 · Sign-up and sign-in by SMS code

- Scope:
  - `auth/sign-in-codes`: 6 digits from `crypto.randomInt`, stored hashed in Valkey with a 10-minute TTL, 5 tries, single use, resend after 30 s; sends limited to 5 per phone and 20 per IP an hour (API-2). Lockout by C1.
  - `POST /auth/code` with `purpose: 'sign_up'` takes name, phone, optional email and the terms version; refuses a registered phone with `409 AUTH_ACCOUNT_EXISTS`. With `purpose: 'sign_in'` an unknown phone gives `404 AUTH_ACCOUNT_NOT_FOUND` and sends nothing (SMS costs money).
  - `POST /auth/code/verify`: sign-up creates the user (`phone_verified_at` set, terms recorded) and a session with no store; sign-in creates a session. Sign-in creates nothing else.
- Rules: phone through `bdMobileSchema`; codes and phones never logged; the SMS is sent after the code is saved, outside any transaction.
- Tests: unit for every rule above (expiry, 5 tries, reuse, resend timer, lockout, send limits); `app.inject()` for sign-up then sign-in with the fake driver; a used code fails the second time.

### PAY-10 · Plan catalogue and coupons as admin data

- Scope (D34): one migration (`--name plan_trials_and_coupon_duration`), contracts and docs. Nothing else reads these columns until ACC-16 and PAY-7.
  - `plans.trial_days smallint not null default 0`, check 0 to 90. 0 means no trial.
  - `coupons.duration` (`once`, `months`, `forever`) and `coupons.duration_months` (set only for `months`, 1 to 36), the admin panel doc's "once, N months, forever".
  - `subscriptions.coupon_id` (references `coupons`) and `subscriptions.coupon_months_left` (null unless the coupon's duration is `months`), so renewals know which discount still applies.
  - A data migration (`--name plans_catalogue`) inserts the four plans from `seed.ts` with `trial_days` 0 for Free and 14 for the paid plans, only where the code does not exist yet. These are starting values; staff change them in the admin panel (ADM-4), and prices stay placeholders until Q1.
- Rules: [database.md](../rules/database.md); never edit an applied migration; regenerate the ER diagram (`pnpm db:diagram`).
- Tests: integration that the checks refuse `trial_days` 91, a `months` coupon without months, and a `once` coupon with months; `pnpm lint:docs` passes with the new diagram.

### ACC-16 · Create the store and start the plan

- Scope: `POST /stores` (session with no store, and the user owns no store yet) takes business name, business type, district, how you sell, customer list size and plan code. In one `StoreTransaction.runForNewStore`: store with a generated slug, `store_counters`, Owner membership, `BillingService.startPlan` (reads the chosen plan row: a public plan only; `trial_days` > 0 starts `trialing` with `trial_ends_at` = now + `trial_days`, price from the plan row; 0 starts the plan with no trial), extensions from ACC-R5, audit row `store.created`. Then the session's active store becomes the new store. Response includes the recommended plan rule for the web form (size → plan).
- Tests: unit for ACC-R5 and the size → plan mapping; integration that a failure in `startPlan` leaves no store, membership or counter; acceptance from the feature doc: Growth with "Facebook or social media" gives a Growth trial ending after the plan's `trial_days` with Sales, Chats and Social Auto Post on; after staff change Growth's `trial_days` to 30, the next sign-up gets 30 days and existing trials keep their end date; a plan with 0 days gives no trial; a non-public plan code is refused; a second `POST /stores` gives `409 STORE_LIMIT_REACHED` (Q3).

### ACC-9 · Email driver and sign-in by email code

- Scope: `EmailDriver` (`send({ to, subject, text, html })`), `SmtpEmailDriver` (nodemailer to Mailpit), `SendGridEmailDriver` (HTTPS API, key from env, untested against a live account until the domain is verified). Email code sign-in reuses ACC-2's code service with the email as target. `POST /me/email` and `POST /me/email/verify` add and verify an email on the signed-in user; a verified email taken by another user gives `409 AUTH_EMAIL_TAKEN`. Per D20, codes go by email when the user has a verified email, else by SMS.
- Tests: Mailpit integration for the SMTP driver (send, then read it back through the Mailpit API); unit for SendGrid request shape with a fake fetch; sign-in by email code; an unverified email cannot receive a sign-in code.

### ACC-10 · Passwords

- Scope: Argon2id (`argon2` package, library defaults or stronger). Set or change a password in `/me` (change needs the current password or a fresh code). `POST /auth/password` by phone or email; an unverified email is refused with `403 AUTH_EMAIL_UNVERIFIED`. `POST /auth/password-reset` and `/confirm` by code; a reset revokes all the user's other sessions. Policy: 8 or more characters with a number. Lockout by C1, shared with codes.
- Tests: unit for policy, lockout and reset; one identical error for wrong password and unknown account (`401 AUTH_INVALID_CREDENTIALS`); a reset ends other sessions.

### ACC-11 · Google sign-in

- Scope: `POST /auth/google` with an ID token, verified by `GoogleIdentityDriver` (audience is our client id; the email must be verified by Google). Match by `google_subject` first; else link to a user with the same verified email and save the subject (ACC-R4); else return a short-lived sign-up ticket (Valkey, 15 minutes) that the phone sign-up in ACC-2 accepts and uses to save the subject and verified email.
- Tests: the three paths; an unverified Google email never links; a subject already linked to another user is refused; ticket reuse fails.

### ACC-5 · Invite, accept and remove members

- Scope: `POST /members/invites` (phone or email, built-in or custom role; token 32 bytes, hash stored, 7 days; link sent by SMS or email after commit), resend, cancel (sets `removed`, clears token, per the feature doc). Seats: active members plus open invites must stay within the plan's `seats` limit, checked inside the transaction with a lock on the store row so two invites cannot both take the last seat (`409 TEAM_SEATS_FULL`). `POST /invites/accept` through `membership_for_invite`; the signed-in user's verified phone or email must match the invite (`403 INVITE_WRONG_ACCOUNT`); an existing user gets a membership, not a new user. `PATCH /members/:membershipId` (role), `DELETE` (remove): revoke that member's sessions for the store and clear their cache (auth rule 10). Owner rules C3: nobody removes or changes the Owner; an Admin cannot invite an Owner. Every change writes the audit log.
- Tests: integration for the seat race and for cross-store reads; unit for owner rules, expiry, revoked and used tokens, wrong recipient; `app.inject()`: a removed member's next request gives 401; accepting with a number already in another store adds a second membership.

### ACC-17 · Custom roles

- Scope: `GET/POST/PATCH/DELETE /roles` with `team.edit`. A role maps each area to a level plus the three flags, validated by a contracts schema. Deleting a role in use gives `409 ROLE_IN_USE`. A role change clears the cached access of every member with that role.
- Tests: integration cross-store test; unit for validation; a member's access changes on their next request after the role is edited.

### ACC-6 · Store settings and extensions

- Scope: `GET /store`, `PATCH /store` (`storeSettings.edit`; name, legal name, business type, phone, email, address, district, BIN, trade licence), `PATCH /store/extensions` (Owner or Admin, via an access check in the service, never `role ===`). Turning an extension off keeps data; stopping its jobs belongs to the features that own them. Audit rows for both.
- Tests: BIN format, store B cannot read store A, Marketer gets 403 on extensions.

### DB-4 · Envelope encryption

- Scope: as in the tracker; needed by ACC-7 for the TOTP secret. One master key from env with `key_version`.
- Tests: round trip; a ciphertext from one version decrypts after a new version is added; a wrong key fails loudly.

### ACC-7 · Devices, remote sign-out and TOTP

- Scope: `GET /me/sessions` (device from user agent, IP, last seen, current flag), `DELETE /me/sessions/:sessionId`, sign out all others. TOTP setup with a QR URI, confirm with a code, 10 backup codes (hashed), disable with a code. With TOTP on, sign-in by password or code asks for a TOTP or backup code before the session is made. New-device alert by SMS or email after sign-in from an unknown user agent and IP pair.
- Tests: unit for TOTP window and backup code single use; `app.inject()` for the second step; deleting a session ends it at once.

### ACC-15 · Cross-store API test

- Scope: one integration suite that signs in as a member of store A, creates a row through every store route that creates one, then signs in as a member of store B and calls every route with A's ids. Any 2xx fails. The route list comes from the app, so new routes join the suite.
- Done when: it runs in CI and covers customers, members, roles and store routes. M1 is done when this passes.

### ACC-8 · Web screens

Split into three PRs after WEB-1, WEB-3 and WEB-4: sign-in and sign-up (all four steps, forgot password, Google button), Team (members and roles tabs), Store settings and Extensions. Each screen has loading, empty, error and data states, works at 360 px, uses React Hook Form with the contracts schema, and maps API field errors to inputs. A Playwright test covers sign-up with the Mailpit SMS code to the Dashboard.

## Out of this plan

Outbox and events (DB-2) wait for their first consumer in M2. Setup checklist and the audit log page (ACC-13), store closing and export (ACC-12), billing screens (PAY-7) and the breached-password check are separate tasks. Real SMS provider: ACC-14, blocked until the account exists.

## How each task is reviewed

The reviewer checks, in this order: the task row and scope match this plan; imports (no Express, no Drizzle in services, no other feature's repository); store id only from the session; every rule above has a test that fails without the code; error codes come from the feature's `*.errors.ts`; nothing logs a phone, email, code or token; nothing extra (options, helpers, abstractions) the task does not need; `pnpm check` and `pnpm test:int` pass in CI.
