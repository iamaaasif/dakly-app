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

| Driver                 | Development, CI and tests                                                           | Production                                   |
| ---------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------- |
| `SmsDriver`            | `MailpitSmsDriver`: sends the SMS text as an email to `<phone>@sms.test` in Mailpit | Provider driver, ACC-14 (blocked)            |
| `EmailDriver`          | `SmtpEmailDriver` to Mailpit                                                        | `SendGridEmailDriver`                        |
| `GoogleIdentityDriver` | `FakeGoogleIdentityDriver`: accepts `fake:<subject>:<email>` tokens                 | `GoogleIdentityDriver` (google-auth-library) |

Config refuses to start in production with a Mailpit, SMTP or fake driver selected. Tests use in-memory fakes that record what was sent. Passing CI with these drivers proves nothing about the live vendors: a real SMS send, a SendGrid send from the verified domain and a real Google sign-in are each checked by hand on staging before launch.

## Shape of the code

| Folder in `packages/core/src` | Owns                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform/`                   | Database scope, Valkey client, rate limiter, cookie and origin checks, route access decorators and the guards that read `request`            |
| `auth/`                       | `users` table, sign-in codes, passwords, Google, TOTP, sign-up, the one place that finishes a sign-in                                        |
| `sessions/`                   | `sessions` table, cookie token, the global guard that loads a session, store switching                                                       |
| `stores/`                     | `stores`, `store_counters`, store settings, extensions                                                                                       |
| `team/`                       | `memberships`, `roles`, `permissions.ts`, built-in roles, invites, ownership transfer, the cached access of each member                      |
| `billing/`                    | Only `BillingService.startPlan` and the plan catalogue read in M1; the rest is PAY-7. No price, trial length or discount is a constant (D34) |
| `audit/`                      | `AuditService.record`                                                                                                                        |

Platform cannot import features ([.dependency-cruiser.cjs](../../.dependency-cruiser.cjs)). So `platform` holds only the decorators and guards that read `request.userId`, `request.storeId` and `request.access` (the feature doc's `request.permissions`); `sessions/` fills them in by calling `TeamService.accessFor`. Dependencies run one way: `auth` and `sessions` call `team`; `team` never calls `sessions`. Team changes take effect because `TeamService` owns the access cache and clears it; the next request then finds no access.

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

### API-2 · Valkey client and rate limiter

Branch: `feat/api-2-valkey-rate-limiter`

- Scope: one `ValkeyClient` provider in `platform/cache/` (ioredis, from `REDIS_URL`), and `RateLimiter.consume(key, limit, windowSeconds)` returning allowed or retry-after, atomic in Valkey (one script or `INCR` with `EXPIRE NX`). Add a Redis service to `.github/workflows/ci.yml`. No `@nestjs/throttler` yet: auth needs per-account keys, not per-route.
- Tests (integration): the 6th call in a window of 5 is refused with the right retry-after; 20 calls in parallel against a limit of 5 let exactly 5 through; two keys do not share a count; the window resets.

### REV-4 · One transaction across features for one store

Branch: `feat/rev-4-store-transaction`

- Scope: CF-6, the atomic part only; job dispatch by name stays open in REV-4 for M2, so the row stays `In progress` after this PR. `TenantDatabase.forStore` keeps an AsyncLocalStorage scope: a nested call for the same store joins the open transaction; a nested call for another store throws. Add `StoreTransaction.run(storeId, work)` and `StoreTransaction.runForNewStore(work)` (generates a UUID v7 and passes it in) that services may call without seeing Drizzle. Global tables (`users`, `sessions`) are written outside any store transaction and never roll back with one; a flow that writes both says which commit comes first and how a retry resumes (ACC-16 is the first).
- Rules: services never import Drizzle; never call a vendor inside the scope ([CLAUDE.md](../../CLAUDE.md)).
- Tests (integration): two repositories write in one scope and both roll back when the second throws; nested same-store call joins; different-store call throws and leaves nothing written; the scope is gone after commit and after rollback.

### DB-3 · Audit log service

Branch: `feat/db-3-audit-service`

- Scope: two records, each written in the same transaction as the change it describes.
  - Store changes: `audit/audit.service.ts` with `record(storeId, entry)`, writing `audit_log` inside the caller's store transaction. Entry: actor (user or system), action, entity type and id, before and after (ids and changed fields only, no phone or email), IP.
  - Account changes (password, TOTP on or off, recovery, email or phone change, other devices signed out, Google linked): a new global table `account_security_events` (`id`, `user_id`, `event`, `ip`, `user_agent`, `details` jsonb with ids only, `created_at`), insert and select only for `dakly_app`, kept 2 years and purged by the maintenance job like `audit_log`. `AccountSecurityEventsService.record(userId, event)` writes it in the same transaction as the `users` or `sessions` change, so a change without its event cannot commit. One row per change, stored under the user, whether or not they have a store. The user sees their own list on the Security screen. Migration `--name account_security_events`.
- Tests (integration): each record commits with its change and rolls back with it; store B cannot read store A's `audit_log` rows; a user with no store gets an account event; the app role cannot update or delete `account_security_events`.

### ACC-4 · Permissions function and built-in roles

Branch: `feat/acc-4-permissions`

- Scope:
  - Contracts: `permissionAreas` (the feature doc list; `shopSales` and `dueBook` included for release 2), `accessLevels` (`none`, `view`, `edit`), the `StoreAccess` type (`role`, `areas`, flags `seeFullPhone`, `exportLists`, `refund`).
  - `team/built-in-roles.ts`: the four release 1 roles from the feature doc table (Shop counter staff arrives with release 2); every role gets `dashboard: view`; `segments` follows `customers`; only Owner and Admin get the three flags.
  - `team/permissions.ts`: `canAccess(access, area, level)` and `canDo(access, ownerAction)` for the actions only the Owner may take, whatever a role says: `billing.edit`, closing the store, transferring ownership. A custom role can store at most `view` for `billing`. A member may create, edit or give a role only if it grants nothing they lack themselves (no area level or flag above their own).
  - Platform: `@RequirePermission('orders.edit')`, `@AnyMember()`, `@RequireUser()`, `@Public()` and `PermissionGuard`, which reads `request.access` and throws `403 PERMISSION_DENIED`.
- Rules: rule 4 of [auth-and-permissions.md](../rules/auth-and-permissions.md): no `role === 'owner'` anywhere else.
- Tests: table-driven from the feature doc table, one row per role and area; `edit` implies `view`; an Admin cannot do any Owner action; a custom role with `billing: edit` in its JSON still cannot; an Admin cannot build a role with a flag they lack; unknown role has no access.

### ACC-3 · Sessions

Branch: `feat/acc-3-sessions`

- Scope:
  - `sessions/`: create (32 random bytes, SHA-256 stored, lifetime by C2), resolve (Valkey cache keyed by hash, 60 s, then Postgres), revoke one, revoke all of a user's other sessions, `lastSeenAt` written at most every 5 minutes.
  - Global `SessionGuard` (registered with `APP_GUARD`): reads the `dakly_session` cookie (`@fastify/cookie`; `HttpOnly`, `Secure` outside development, `SameSite=Lax`, `Path=/`), sets `request.userId` and `request.sessionId`, and, when the session has an active store and `TeamService.accessFor(storeId, userId)` returns an active membership, `request.storeId` and `request.access`. `accessFor` caches in Valkey by store and user, guarded by a version so a slow request cannot put old access back: each member has a version counter in Valkey (`access-version:<storeId>:<userId>`), which `TeamService` increments for every affected member after a membership or role change commits. A reader notes the version before it reads Postgres and stores the result only through one Valkey script that writes it if the version is still the same; a cached entry is used only when its version equals the current one. If Valkey loses the counter, the reader falls back to Postgres. A missing or bad cookie is not an error here; the route kind decides (see Shape of the code).
  - `UserGuard` for `@RequireUser()` routes: no valid session gives `401 AUTH_REQUIRED`. `@CurrentUser()` throws the same if it ever runs without a user.
  - `OriginGuard`: for POST, PUT, PATCH and DELETE, `Origin` must be in `WEB_ORIGINS`, else `403 ORIGIN_REJECTED`. Only routes marked `@ProviderCallback()` (signed webhooks, added with their first route) skip it; a missing `Origin` is never accepted otherwise.
  - Routes: `POST /auth/sign-out`, `GET /me`, `GET /me/stores` (`stores_for_user`), `POST /me/active-store` (the feature doc's `/session/store`; refuses a store without an active membership with the same 404 as a missing store).
  - The existing customers routes become reachable here, so they get `@RequirePermission('customers.view' | 'customers.edit')`, and `CustomersService` masks the phone (`017XXXXX678`) in every response for a member without `seeFullPhone`.
- Rules: auth rules 1, 2, 6, 7, 8, 10. Never a JWT.
- Tests: integration for the repository and for `accessFor` after removal returning nothing; `app.inject()`: no cookie on a store route gives `401 STORE_REQUIRED` and on `/me` gives `401 AUTH_REQUIRED`; an expired, revoked or unknown token gives the same; a write from another origin or with no origin gives 403; switching to a store you are not in gives 404; a removed member's next request to that store gives 401 while their other store still works; a Support agent reads a customer with the phone masked; concurrent revocation: an `accessFor` call paused after its Postgres read while the member is removed and the version increments must not leave the old access in the cache, and the member's next request gets 401.

### API-3 · Every route has an access rule

Branch: `test/api-3-route-access`

- Scope: a test that lists every route on the Nest app and fails when a route has none of `@Public()`, `@RequireUser()` or a store rule, or when a store route has neither `@RequirePermission` nor `@AnyMember()`.
- Tests: the test itself, plus fixture controllers (one with no marker at all, one store route without a permission) that make it fail.

### ACC-1 · SMS driver and Mailpit

Branch: `feat/acc-1-sms-driver`

- Scope: `SmsDriver` type in `packages/providers/src/sms/` (`send({ to, text })`, returns a provider message id), `MailpitSmsDriver`, an in-memory fake for tests. Add Mailpit to `docker-compose.yml` (SMTP 1025, UI 8025) and as a service in CI. Text is never logged.
- Tests: the fake records the message; a Mailpit integration test sends one and reads it back through the Mailpit API; config with `SMS_DRIVER=mailpit` in production fails at start.

### ACC-2 · Sign-up and sign-in by SMS code

Branch: `feat/acc-2-sms-code-sign-in`

- Scope:
  - `auth/sign-in-codes`: 6 digits from `crypto.randomInt`, stored hashed in Valkey with a 10-minute TTL, bound to the target and purpose (`sign_up`, `sign_in`, later `reset_password`, `add_email`); 5 tries; consumed atomically (one Valkey script checks and deletes, so two parallel verifies give one success); resend after 30 s; sends limited to 5 per target and 20 per IP an hour (API-2).
  - Lockout (C1): one failure counter per user id, shared by phone, email, code and password attempts; targets with no account count per target and per IP only.
  - `POST /auth/code` with `purpose: 'sign_up'` takes name, phone, optional email and the terms version; refuses a registered phone with `409 AUTH_ACCOUNT_EXISTS`. With `purpose: 'sign_in'` an unknown phone gives `404 AUTH_ACCOUNT_NOT_FOUND` and sends nothing (SMS costs money).
  - `POST /auth/code/verify`: sign-up creates the user (`phone_verified_at` set, terms recorded); sign-in finds the user. Both then call `AuthService.completeSignIn(user, request)`, the only function that issues a session. ACC-7 adds the TOTP step inside it, so every way of signing in gets it.
- Rules: phone through `bdMobileSchema`; codes and phones never logged; the SMS is sent after the code is saved, outside any transaction.
- Tests: unit for expiry, 5 tries, purpose mismatch, resend timer, lockout across phone and email, send limits; parallel verify of one code gives one session; `app.inject()` for sign-up then sign-in with the fake driver.

### PAY-10 · Plan catalogue and coupons as admin data

Branch: `feat/pay-10-plan-catalogue`

- Scope (D34): one schema migration (`--name plan_trials_and_coupon_duration`), one data migration, contracts and docs. Nothing else reads these columns until ACC-16 and PAY-7.
  - `plans.trial_days smallint not null default 0`, check 0 to 90. 0 means no trial.
  - `coupons.duration` (`once`, `months`, `forever`) and `coupons.duration_months` (set only for `months`, 1 to 36), the admin panel doc's "once, N months, forever".
  - `subscriptions.coupon_id` (references `coupons`) and `subscriptions.coupon_ends_at` (null for `forever`). Meaning, the same as Stripe's: `once` discounts the first paid invoice and is then detached; `months` discounts every paid invoice whose period starts before `coupon_ends_at` (redemption time plus N months), so a yearly plan with a 3-month coupon gets one discounted year; a failed and retried invoice is still one invoice. A coupon's discount and duration cannot change after its first redemption; staff create a new coupon instead.
  - Data migration (`--name plans_catalogue`): inserts the four plans from `seed.ts` with `trial_days` 0 for Free and 14 for the paid plans; on a database that already has those codes (seeded dev databases), sets only `trial_days`, and only where it is still 0. It runs once, so later admin edits stay. Update `seed.ts` to match. Prices stay placeholders until Q1.
- Rules: [database.md](../rules/database.md); never edit an applied migration; regenerate the ER diagram (`pnpm db:diagram`).
- Tests: integration that the checks refuse `trial_days` 91, a `months` coupon without months and a `once` coupon with months; the data migration on an empty catalogue and on one seeded before it gives the same trial days.

### ACC-16 · Create the store and start the plan

Branch: `feat/acc-16-create-store`

- Scope:
  - `GET /plans` (`@Public()`): public base plans (`kind = plan`, `is_public`) with monthly and yearly price, trial days and limits, read from the table, plus the size to plan recommendation. The web picker shows only this; no prices or trial lengths in the frontend.
  - `POST /stores` (`@RequireUser()`) takes business name, business type, district, how you sell, customer list size, plan code and billing cycle (`monthly` or `yearly`).
  - One store per account (Q3), safe under parallel requests: inside `StoreTransaction.runForNewStore`, first take `pg_advisory_xact_lock` on the user id, then check `stores_for_user` for a store the user owns. If one exists, nothing is created and the request returns that store (200), so a retry after a lost response or a failed session update resumes instead of failing. Otherwise create, in the same transaction: store with a generated slug, `store_counters`, Owner membership, `BillingService.startPlan`, extensions from ACC-R5, audit row `store.created` (201).
  - `startPlan` takes a public `kind = plan` row and the cycle's price: price 0 starts the plan with no trial; price above 0 with `trial_days` above 0 starts `trialing`, `trial_ends_at` = now + `trial_days`; price above 0 with 0 trial days is refused with `409 PLAN_NEEDS_PAYMENT` until PAY-7 adds checkout. Free is free because its price is 0, never because its trial is 0.
  - After the store commits, the session's active store is set (a separate write to the global table). If that write fails, the client calls `POST /stores` again or `POST /me/active-store`; both recover.
- Tests: unit for ACC-R5, the recommendation and the four plan cases (free, paid with trial, paid with no trial, add-on refused); integration that two parallel `POST /stores` from two sessions of one user give one store, one Owner and one subscription; a failure in `startPlan` leaves no store, membership or counter; a repeat call returns the same store; acceptance: Growth yearly with "Facebook or social media" stores the yearly cycle and price and a Growth trial ending after the plan's `trial_days`, with Sales, Chats and Social Auto Post on; after staff change Growth's `trial_days` to 30, `GET /plans` shows 30, the next sign-up gets 30 days and existing trials keep their end date.

### ACC-9 · Email driver and sign-in by email code

Branch: `feat/acc-9-email-sign-in`

- Scope: `EmailDriver` (`send({ to, subject, text, html })`), `SmtpEmailDriver` (nodemailer to Mailpit), `SendGridEmailDriver` (HTTPS API, key from env, untested against a live account until the domain is verified). Email code sign-in reuses ACC-2's code service and `completeSignIn`. Adding or changing an email: `POST /me/email` needs proof from a method the account already has (a code to the verified phone or the password, within the last 10 minutes), then a code to the new address with purpose `add_email` bound to the user and that address; the old verified email stays until the new one is verified. A verified email taken by another user gives `409 AUTH_EMAIL_TAKEN`. Per D20, codes go by email when the user has a verified email, else by SMS.
- Tests: Mailpit integration for the SMTP driver; unit for the SendGrid request shape with a fake fetch; sign-in by email code; an unverified email cannot receive a sign-in code; adding an email without fresh proof is refused; a code for one address cannot verify another.

### ACC-10 · Passwords

Branch: `feat/acc-10-passwords`

- Scope: Argon2id (`argon2` package, library defaults or stronger). Setting a first password or changing one needs the current password or a fresh code. `POST /auth/password` by phone or email ends in `completeSignIn`; an unverified email is refused with `403 AUTH_EMAIL_UNVERIFIED`. `POST /auth/password-reset` and `/confirm` by a code with purpose `reset_password`; a reset revokes all the user's sessions and signs in through `completeSignIn`. Policy: 8 to 128 characters with a number. Lockout by C1, shared with codes.
- Tests: unit for policy, lockout and reset; one identical error for wrong password and unknown account (`401 AUTH_INVALID_CREDENTIALS`); a reset ends other sessions; a sign-in code cannot confirm a reset.

### ACC-11 · Google sign-in

Branch: `feat/acc-11-google-sign-in`

- Scope: `POST /auth/google` with an ID token, verified by `GoogleIdentityDriver` (audience is our client id; the email must be verified by Google). Match by `google_subject` first; else link to a user with the same verified email and save the subject (ACC-R4); else return a short-lived sign-up ticket (Valkey, 15 minutes, single use) that the phone sign-up in ACC-2 accepts and uses to save the subject and verified email. Matches end in `completeSignIn`, so TOTP applies once ACC-7 lands.
- Tests: the three paths; an unverified Google email never links; a subject already linked to another user is refused; ticket reuse fails.

### ACC-5 · Invite, accept and remove members

Branch: `feat/acc-5-team-invites`

- Scope: `POST /members/invites` (phone or email, built-in or custom role within ACC-4's grant rule; token 32 bytes, hash stored, 7 days; link sent by SMS or email after commit), resend, cancel (sets `removed`, clears token, per the feature doc). Seats: active members plus open invites must stay within the plan's `seats` limit, checked inside the transaction with a lock on the store row so two invites cannot both take the last seat (`409 TEAM_SEATS_FULL`). `POST /invites/accept` (`@RequireUser()`) through `membership_for_invite`; the signed-in user's verified phone or email must match the invite (`403 INVITE_WRONG_ACCOUNT`); an existing user gets a membership, not a new user. `PATCH /members/:membershipId` (role, within the grant rule), `DELETE` (remove): clear the member's cached access, so their next request to this store gets 401 (auth rule 10). C3: nobody removes or changes the Owner, and nobody invites an Owner. Every change writes the audit log.
- Tests: integration for the seat race and for cross-store reads; unit for owner rules, grant rule, expiry, revoked and used tokens, wrong recipient; `app.inject()`: a removed member's next request gives 401; accepting with a number already in another store adds a second membership.

### ACC-17 · Custom roles

Branch: `feat/acc-17-custom-roles`

- Scope: `GET /roles` (`team.view`), `POST/PATCH/DELETE /roles` (`team.edit`). A role maps each area to a level plus the three flags, validated by a contracts schema, and limited by ACC-4's grant rule and Owner actions. Deleting a role in use gives `409 ROLE_IN_USE`. A role change clears the cached access of every member with that role.
- Tests: integration cross-store test; an Admin cannot create a role with `billing: edit`, cannot give it to themselves, and cannot add a flag they lack; a member's access changes on their next request after the role is edited.

### ACC-18 · Transfer ownership

Branch: `feat/acc-18-ownership-transfer`

- Scope: the Owner starts a transfer to an active member (`POST /store/ownership-transfer`, Owner action, fresh code to the Owner's phone or email), valid 48 hours, one open transfer per store, cancellable. The named member accepts (`POST /store/ownership-transfer/accept`). In one store transaction with the store row locked: old Owner becomes Admin first, then the new one becomes Owner, so the one-Owner index never sees two, and the commit never leaves zero. Audit both role changes; clear both members' cached access.
- Tests: integration that two parallel accepts, or an accept racing the new Owner's removal, end with exactly one Owner; the wrong member, an expired or cancelled transfer and a reused code fail; both members' permissions change on their next request.

### ACC-6 · Store settings and extensions

Branch: `feat/acc-6-store-settings`

- Scope: `GET /store` (`storeSettings.view`), `PATCH /store` (`storeSettings.edit`; name, legal name, business type, phone, email, address, district, BIN, trade licence), `PATCH /store/extensions` (Owner or Admin through a `permissions.ts` check, never `role ===`). Turning an extension off keeps data; stopping its jobs belongs to the features that own them. Audit rows for both.
- Tests: BIN format, store B cannot read store A, Marketer gets 403 on extensions.

### DB-4 · Envelope encryption

Branch: `feat/db-4-envelope-encryption`

- Scope: one master key from env with `key_version`, AES-256-GCM. Every ciphertext is bound to what it belongs to through the associated data: `user:<id>:totp` for a TOTP secret (users have no store), `store:<id>:<purpose>` for shop credentials.
- Tests: round trip; a ciphertext decrypts after a new key version is added; decrypting with another user's or store's context fails; a changed byte fails; a wrong key fails loudly.

### ACC-7 · Devices, remote sign-out and TOTP

Branch: `feat/acc-7-devices-and-totp`

- Scope:
  - `GET /me/sessions` (device from user agent, IP, last seen, current flag), `DELETE /me/sessions/:sessionId`, sign out all others. All `@RequireUser()`.
  - TOTP setup needs a fresh code or password, then a QR URI and a confirming TOTP code; 10 backup codes, hashed, each used once (removed in the same update that checks it, so two parallel uses give one success). Disable needs a TOTP or backup code.
  - In `completeSignIn`: with TOTP on, no session is issued. It returns a challenge id (Valkey, 5 minutes, single use, bound to the user and the first factor, 5 tries counted in C1's lockout); `POST /auth/totp` with the challenge and a TOTP or backup code issues the session. This covers code, password and Google sign-in.
  - Lost authenticator and backup codes. A phone code alone is what signs in, so it cannot also remove the second factor ([OWASP: resetting MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html#resetting-mfa)). Recovery (`POST /auth/totp/recovery`) needs every sign-in method the account has besides TOTP: a code to the phone, plus a code to the verified email if there is one, plus the password if one is set. It then waits 7 days before TOTP is removed. At the start, Dakly tells the person by SMS and email and tells the Owner of each of their stores; any sign-in that completes TOTP during the wait cancels the recovery, and so does a cancel link in those messages. No session is issued until TOTP is removed. Support cannot skip the wait: staff can only start the same recovery after checking identity documents, with a reason in `staff_audit_log` (ADM task). Each step writes `account_security_events`.
  - New-device alert by SMS or email after sign-in from an unknown user agent and IP pair.
- Tests: unit for TOTP window and backup code single use under parallel requests; `app.inject()` for each of the four sign-in ways with TOTP on giving no session cookie before the second step; expired, wrong-user and reused challenges fail; recovery with only a phone code is refused when the account has an email or password; recovery cannot finish before 7 days and a TOTP sign-in during the wait cancels it; deleting a session ends it at once.

### ACC-15 · Cross-store API test

Branch: `test/acc-15-cross-store-api`

- Scope: one integration suite with a fixture per store route: how to call it as store A's Owner and what A's data looks like. For each route it checks, in order: A's Owner succeeds (positive control); B's Owner using A's ids gets the same 404 as a missing id; B's list routes return 200 with none of A's rows; after B's failed writes, A's row is unchanged. A 400, 401, 403 or 5xx never counts as proof of isolation. A route in the app with no fixture fails the suite, so new routes must add one.
- Done when: it runs in CI and covers customers, members, roles, ownership transfer and store routes; dropping the store filter in one repository makes it fail. M1 is done when this passes.

### ACC-8 · Web screens

Branches: `feat/acc-8-web-sign-in`, `feat/acc-8-web-team`, `feat/acc-8-web-store-settings`

Three PRs after WEB-1, WEB-3, WEB-4 and WEB-5 (Playwright in CI): sign-in and sign-up (all four steps with the picker from `GET /plans`, resume at business details, forgot password, Google button, TOTP step), Team (members, roles and ownership transfer) and Store settings, Extensions and Security (devices and TOTP). Each screen has loading, empty, error and data states, works at 360 px, uses React Hook Form with the contracts schema, and maps API field errors to inputs. A Playwright test covers sign-up with the Mailpit SMS code to the Dashboard.

## Out of this plan

Outbox and events (DB-2) wait for their first consumer in M2. Setup checklist and the audit log page (ACC-13), store closing and export (ACC-12), billing screens and checkout (PAY-7) and the breached-password check are separate tasks. Real SMS provider: ACC-14, blocked until the account exists.

## How each task is reviewed

The reviewer checks, in this order: the branch is named as below its task; the task row and scope match this plan; imports (no Express, no Drizzle in services, no other feature's repository, no `team` to `sessions` import); every route has its access marker; store id only from the session; every rule above has a test that fails without the code; error codes come from the feature's `*.errors.ts`; nothing logs a phone, email, code or token; nothing extra (options, helpers, abstractions) the task does not need; `pnpm check` and `pnpm test:int` pass in CI.
