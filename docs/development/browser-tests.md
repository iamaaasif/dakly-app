# Browser and component tests

Use Node 22 from `.nvmrc` (22.12 or newer), pnpm 10.28.0 and the frozen lockfile. Playwright 1.58.2 installs its own Chromium; no system Chrome or globally installed test runner is used. CI uses Ubuntu 24.04, which the pinned Playwright release supports. Keep the runner image pinned when changing browser dependencies; `ubuntu-latest` can move to an unsupported OS. On Linux, install the browser and its system dependencies:

```bash
pnpm install --frozen-lockfile
pnpm --filter @dakly/web exec playwright install --with-deps chromium
```

Start the normal PostgreSQL 16, Valkey 8 and Mailpit services. Use a dedicated local test database, with the `dakly_app` RLS role for `DATABASE_URL` and the migration owner for `DATABASE_ADMIN_URL`. Both database URLs and `REDIS_URL` must point to loopback hosts and contain no URL query options. Export them from your private test environment without printing their values. `MAILPIT_SMTP_HOST` must also be loopback; `MAILPIT_SMTP_PORT` and `MAILPIT_API_URL` follow the normal local service configuration. Prepare a fresh database using the same commands as CI:

```bash
psql "$DATABASE_ADMIN_URL" -f packages/db/local-init.sql
pnpm exec turbo run build --filter=@dakly/db
pnpm --filter @dakly/db db:migrate
pnpm test:e2e
```

`pnpm test:e2e` builds the API, web app and their workspace dependencies itself. It starts the compiled production API entrypoint and production Next server, waits up to 30 seconds for each health endpoint, runs the Chromium tests, then stops its processes and removes its fixture. Both test servers bind only `127.0.0.1`. API port 4015 and web port 3015 must be free; the runner refuses to reuse another server. Build and runtime both use `WEB_API_URL=http://127.0.0.1:4015`; browser requests use `http://localhost:3015` through Next rewrites. Run one browser command per checkout. Playwright arguments are forwarded, so a focused run such as `pnpm test:e2e e2e/team-layout.spec.ts` still uses the same owned servers and fixture cleanup. CI runs the full suite without arguments.

The API child receives `API_HOST=127.0.0.1`, `NODE_ENV=test`, private ephemeral encryption/signing keys and local Access verification keys. This boots the full application without Cloudflare or provider calls. The worker child gets the same environment, so security notices from sign-in and recovery are delivered as in production. Both use a BullMQ prefix unique to the run (`QUEUE_PREFIX`), so a local worker never takes their jobs; cleanup removes that prefix's keys. Next runs in production mode. `API_HOST` accepts a literal IPv4/IPv6 address and defaults to `0.0.0.0`, preserving production binding. This process-local configuration changes no production defaults or integration-test origins. No admin app is needed for the shell flow.

## Fixture and coverage

The runner creates two unique accounts with verified synthetic BD mobile numbers, two shops with owners, and a marketer membership for the browser account in the second shop. A random opaque session token is kept only in memory and the browser child's environment; only its hash is stored in PostgreSQL. The browser gets a Secure, HttpOnly, SameSite=Lax localhost cookie. Every browser request passes the real primary-database session and membership guards. This fixture is not sign-in or sign-up coverage.

The test proves an anonymous customer page redirects to sign-in, an unchanged focus verification preserves the mounted customer draft and collapsed navigation, the native phone drawer handles keyboard focus and closes during verification, and an explicit shop change discards the draft. Both shops permit customer creation. A real form submission persists in the selected shop; a request with the old context receives 409 and leaves both shops unchanged. The flow checks 1280 px and 360 px layouts and has no retries or fixed sleeps.

Each command runs inside an owned POSIX process group whose separate owner remains alive after the command exits. Cleanup signals the anchored group, waits for bounded graceful shutdown, then kills the group before releasing its owner. Losing the controller IPC connection also kills that owned group. Node Vitest regressions cover cancellation, exited commands with surviving descendants, completion, launch failure and IPC loss.

Fixture creation is transactional. Cleanup deletes only the generated users, shops and their rows, after owned processes stop, including test failures and SIGINT/SIGTERM cancellation. It never flushes Redis or deletes unrelated messages/data; it removes only the run's queue keys. A hard kill or machine loss cannot run cleanup; use a disposable database in CI and discard that database after such an interruption.

## Results and component tests

- `apps/web/playwright-report/`: HTML report, opened with `pnpm --filter @dakly/web exec playwright show-report`.
- `apps/web/test-results/`: failure screenshots and assertion context.
- `apps/web/e2e-artifacts/`: build, API, Next and test logs capped at 1 MiB each, plus cleanup confirmation. API request logs use the production redaction policy.

These generated directories are ignored by Git. Each run clears its old artifacts. Traces and video are disabled because authenticated network traces can retain session credentials. CI uploads the directories even after failure and retains them for seven days.

`pnpm --filter @dakly/web test` includes the existing Node formatter, transport, hook and Next config tests. Only DOM component files opt into jsdom using the Vitest environment annotation. Testing Library exercises labelled controls and user actions; the real drawer's browser focus behavior belongs in Chromium. `pnpm check` includes component tests and browser-test typechecking; `pnpm test:e2e` additionally needs the services and browser installation. Core and provider Vitest configs use `.mts` for native ESM loading without changing package runtime types.

## ACC-8 extension

Add actual Mailpit sign-up-to-Dashboard coverage and public `/security/recovery` link coverage in `apps/web/e2e/` when those screens exist. Use the same production servers and real guards; obtain codes from the configured local Mailpit API. Track newly created account/store IDs for scoped cleanup rather than granting a seeded session to a sign-up test. Keep the public recovery route outside the authenticated shell. Extend the fixture lifecycle for owned messages and account security rows when those flows create them; do not flush shared services or claim the seeded shell flow proves onboarding.

The signup browser case uses an owned synthetic phone and plan, reads the actual
SMS code from Mailpit, and reaches the real Dashboard without a seeded session.
It verifies store, Owner and subscription rows, then uses the normal TOTP setup
API to exercise password plus backup-code sign-in. Public recovery uses the
actual durable Mailpit notice link, proves link loading does not cancel, and
finishes a separate request after changing only its owned, delivered recovery
deadline. Completion must leave the browser signed out.

The runner supplies fixture-only HTTPS Terms and Privacy URLs; the test intercepts
those document responses. Production registration still requires published legal
configuration. Auth screenshots and traces are disabled. Private input and notice
navigation avoid credential-bearing Playwright step titles; cleanup scrubs private
DOM content before any failure snapshot. Deliberate Dashboard screenshots contain
only synthetic account/shop data. Teardown removes only the generated account,
owned store/plan rows and exact recipient-matched Mailpit message IDs. Shared
Redis rate-limit keys are never flushed; the test respects the real resend window.

The Team browser case sends actual mobile and email invitations, signs up the
mobile recipient without creating an owned shop, and requires explicit
acceptance. It changes custom permissions, verifies stale-context and forbidden
writes, then transfers ownership to the named member without Team View. The
verified-email recipient signs in using its real mailbox code. Native dialogs
retain drafts across unchanged session verification, release the top layer for
failed-verification Refresh, and discard drafts after a verified context change.
A separate layout case checks the Roles list and complete permission form at
360 px and 1280 px without sending codes or saving a role. Team cleanup removes
only its generated identities, shop, subscription, plan, and recipient-owned
Mailpit messages, regardless of which member ends as Owner.

The final core review cases use two approved support grants with a current signed
staff session and the real handoff/exchange guards. Replacing the shared support
cookie rejects a stale draft before writes; the refreshed delegation accepts a
new draft and late old customer responses stay hidden. A separate fixture has
55 memberships and a selected shop beyond page one. It checks explicit page
loading, removal, switching and readable shop identity with a long account name
at 360 px and 1280 px. Only the synthetic header is captured.

The runner also executes `scripts/native-form-tests.mjs` unconditionally. It renders
actual public and staff source without hydration and submits fake passwords,
proofs and recovery tokens in a JavaScript-disabled Chromium context. Every
request is intercepted locally; Enter and submit buttons must produce POST
without query fields. It retains no browser artifacts.
