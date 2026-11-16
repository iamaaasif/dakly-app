# Code foundation review

Reviewed on 13 November 2026. Scope: all application and package source, existing tests, database migrations and snapshots, and the rules that contributors are told to copy. This review changes no application code.

The current customer slice has sensible feature boundaries and fails closed without a session. Several shared helpers and examples need correction before more features copy them. Missing release features are distinguished below from defects in the existing foundation.

Priority meanings: P1 should be resolved before enabling the affected path for real shop data; P2 should be resolved before copying the affected pattern into new features; P3 is a smaller contract or example gap. A priority on a future pattern does not mean an incident has already occurred.

## Verification

Source inspection covered `apps/api`, `apps/web`, `apps/worker`, `packages/contracts`, `packages/core`, `packages/db` and `packages/providers`, including every existing test and migration.

After dependencies and compiled output became available, isolated runtime probes verified these results:

| Probe                                                                                      | Result                                                          |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Nest/Fastify `app.inject()` preflight from `http://localhost:3000` to `OPTIONS /customers` | 404 `HTTP_404`; no `Access-Control-Allow-Origin` header         |
| `POST /customers` without a session                                                        | 401 `STORE_REQUIRED`                                            |
| Existing error filter given a synthetic Drizzle query error                                | Logger argument contains both the synthetic name and full phone |
| Phone schema with `1712345678` and `০১৭১২৩৪৫৬৭৮`                                           | Both rejected                                                   |
| Phone schema with `+8801712345678`                                                         | Accepted                                                        |
| Redis connection helper with `redis://localhost:6379/1`                                    | Returns host and port, omitting the requested database          |
| Redis connection helper with `https://localhost:6379`                                      | Accepted as a plain connection                                  |

The API injection probe used dummy database credentials; these routes did not query a database. No real shop data, external provider or live queue was used. This review did not independently run the PostgreSQL integration suite. Build and repository-wide checks are reported separately by the main review.

## Findings

### CF-1 · P1 · Database errors put personal data into logs

Evidence: [app-error.filter.ts](../../packages/core/src/platform/errors/app-error.filter.ts), line 33, logs an arbitrary exception directly. [contacts.repository.ts](../../packages/core/src/contacts/contacts.repository.ts) binds the customer's name and full phone to the INSERT.

The locked Drizzle version, 0.45.4, embeds SQL parameters into the error message itself in [DrizzleQueryError](https://raw.githubusercontent.com/drizzle-team/drizzle-orm/0.45.4/drizzle-orm/src/errors.ts). A synthetic error passed through the real filter confirmed that its logger receives the name and full phone. A failed database operation can therefore expose submitted personal data even though the HTTP response is safely generic. Redacting structured fields named `phone` will not remove values embedded in an error message or stack.

This violates [security.md](../rules/security.md), line 22, and [logging.md](../rules/logging.md), line 13. Logging infrastructure is still tracked under API-1, but the existing filter is already the recommended shared error path. The missing session implementation currently blocks public customer writes; resolve this before that gate opens.

Fix: add safe error serialization at the logging boundary. Keep an error classification, safe diagnostic identifiers and sanitized stack locations. Do not log raw query parameters, arbitrary messages or nested causes. Apply the same policy to any later error reporting integration.

Tests: pass a realistic failed query with synthetic phone, name and secret markers through the filter and capture the serialized log output. Assert that none of the markers appear, including inside a stack or cause, while the response remains `500 INTERNAL_ERROR` and useful safe diagnostics remain available.

### CF-2 · P2 · Browser requests fail preflight in the documented setup

Evidence: [api-client.ts](../../apps/web/src/lib/api-client.ts), lines 3 and 16–20, sends credentialed JSON requests to `http://localhost:4000`. The [README](../../README.md), line 33, runs the web app on port 3000. [main.ts](../../apps/api/src/main.ts), lines 11–15, does not enable CORS, and [next.config.ts](../../apps/web/next.config.ts) has no same-origin proxy.

The runtime preflight returned 404 with no allowed-origin header. A browser therefore blocks the request before the customer form can receive even the intended `STORE_REQUIRED` response. This is independent of the deliberate absence of authentication.

Fix: choose and document either a same-origin API proxy or an explicit origin allowlist with credential support. If retaining separate origins, use the configured web origins rather than a wildcard. Keep the later Origin checks for state-changing requests required by the authentication rules.

Tests: inject a browser-equivalent OPTIONS request containing Origin, requested method and requested content type. Assert the chosen origin policy and credential headers, and test a disallowed origin. Verify a browser can display the unauthenticated API error.

### CF-3 · P2 · The shared-queue job example dispatches the wrong work

Evidence: [jobs.md](../rules/jobs.md), lines 13–21, registers a job-specific class as a processor for the shared transactional queue. Its `process()` always parses one payload and calls one service. The same document requires one file per job and a fixed set of shared queues. The job-name constant in the example is never used for dispatch.

BullMQ workers consume jobs from their queue; job names do not automatically select one job-specific worker. Copying the example for another transactional job creates competing workers that can receive each other's jobs. Incompatible payloads fail validation; compatible payloads can trigger the wrong action. BullMQ's [named processor guide](https://docs.bullmq.io/patterns/named-processor) shows explicit dispatch on `job.name`.

No processors exist in the current worker, so this is an unsafe template rather than an observed queue failure.

Fix: teach one processor per shared queue that dispatches by job name to feature handlers. Keep one handler file per job and preserve the service boundary. Unknown job names must fail visibly instead of silently succeeding. A dedicated queue per job would conflict with the current queue policy and should not be introduced accidentally.

Tests: enqueue two distinct names on one queue and prove each reaches only the correct handler. Cover unknown names and malformed payloads. Test business results rather than only mock call ordering.

### CF-4 · P2 · Shared phone validation rejects required input formats

Evidence: [phone.ts](../../packages/contracts/src/phone.ts), lines 4–10, removes spaces, hyphens and an optional `88` prefix but neither maps Bangla digits nor adds the leading zero to a national ten-digit number. [frontend-forms.md](../rules/frontend-forms.md), line 14, explicitly requires both forms.

Runtime checks confirmed that `1712345678` and `০১৭১২৩৪৫৬৭৮` fail while `+8801712345678` passes. The existing [phone tests](../../packages/contracts/src/phone.spec.ts) omit the rejected required forms. Because the schema is shared, the defect affects both browser and API validation.

Fix: normalize Bangla digits and the required national ten-digit representation before applying the canonical ASCII mobile-number check. Keep the stored `01XXXXXXXXX` representation.

Tests: table-driven cases for all documented representations, including Bangla digits, must produce the same canonical number. Retain invalid operator prefix and length cases, and test normalization is stable when applied again by the API.

### CF-5 · P2 · Validation errors discard their field locations

Evidence: [zod-validation.pipe.ts](../../packages/core/src/platform/validation/zod-validation.pipe.ts), lines 12–16, keeps only the first issue's message. [errors.ts](../../packages/contracts/src/errors.ts), [app-error.ts](../../packages/core/src/platform/errors/app-error.ts) and [app-error.filter.ts](../../packages/core/src/platform/errors/app-error.filter.ts) have no representation for validation fields. [api-design.md](../rules/api-design.md), line 39, and [architecture.md](../architecture.md), line 46, require `fields: [{ path, message }]`.

Future forms cannot reliably map a server validation failure to an input from a message alone. Browser validation does not remove this requirement: API callers and temporarily differing browser/server versions still reach the server validation boundary.

Fix: define optional validation field details in the shared error contract and preserve them through the pipe, error type, filter and client. Keep stable error codes and avoid including submitted values in validation responses.

Tests: invalid input with more than one invalid field returns `VALIDATION_FAILED`, useful paths and messages, and no submitted values. Expected business errors retain their existing shape.

### CF-6 · P2 · Cross-feature atomic writes have no supported transaction pattern

Evidence: [tenant-database.ts](../../packages/core/src/platform/database/tenant-database.ts), lines 15–22, always opens a new transaction on the root database. Each [contact repository method](../../packages/core/src/contacts/contacts.repository.ts) independently calls that method. There is no ambient transaction context, transaction-bound repository factory, or mechanism for a nested service call to join the caller's transaction.

At the same time, [services.md](../rules/services.md), rules 6–7, requires cross-feature calls through services and keeps Drizzle out of services. [module-boundaries.md](../rules/module-boundaries.md) prohibits reaching into another feature's repository. The [order flow](../features/06-orders-and-delivery.md), line 251, requires one transaction across contact resolution, numbering, stock reservation, order creation and event publication. [ProductsService.moveStock](../features/05-products-and-stock.md), line 124, owns stock changes. [architecture.md](../architecture.md), lines 59 and 118, requires atomic outbox writes and order/stock reservation.

Copying today's repository pattern literally cannot satisfy those requirements: a call to another service commits its repository transaction independently. Wrapping the calling service in an outer `forStore` would not make inner repository calls join it. A later failure could leave reserved stock without its order, or a committed order without its outbox event.

No order, stock or outbox implementation exists yet, so this is a verified missing foundation contract rather than a present partial-write defect. It should be resolved with the first genuinely atomic multi-feature slice, before that slice copies the current pattern.

Fix: define a tenant-scoped unit-of-work contract that allows participating repositories to use the same connection and transaction while keeping business services free of Drizzle and respecting feature ownership. Choose one explicit mechanism, such as a scoped transaction context with same-store checks; document nesting, rollback and store-mismatch behavior. Do not hold that transaction across provider calls. Single-feature methods can retain the simple standalone behavior.

Tests: use real PostgreSQL to create an order, reserve stock and insert an outbox row, then force a failure at each stage and assert all writes roll back. Include success, concurrent reservations, nested same-store calls, different-store rejection and context cleanup after both commit and rollback. An analogous signup test should cover user/store/membership creation when that slice is implemented.

### CF-7 · P2 · Payment driver methods omit per-shop credentials

Evidence: [payment-driver.ts](../../packages/providers/src/payment/payment-driver.ts), lines 19–22, defines `createPayment(input)` and `getStatus(gatewayPaymentId)` with no credentials argument, despite the file's per-shop account comment. [providers.md](../rules/providers.md), line 18, requires credentials per call. The existing channel send contract follows that rule.

The payment interface cannot express the prescribed stateless, per-shop call. An implementation might work around this with global or mutable instance credentials, or invent a different lifetime model. Neither is established in the foundation. There is no driver implementation yet and no evidence of an existing cross-shop payment leak.

Fix: add a concrete per-call payment credentials contract when implementing the first gateway, and make payment creation and status lookup both use it. Keep credentials out of jobs and decrypt them only when required by the worker.

Tests: interleave operations for two shops through the same driver instance and assert the provider receives the correct credentials for every operation. Failure logs must not contain credentials.

### CF-8 · P3 · Redis URLs silently lose connection semantics

Evidence: [redis-connection.ts](../../packages/core/src/platform/queue/redis-connection.ts), lines 10–18, reads host, port, credentials and the TLS scheme but ignores the pathname. [env.ts](../../packages/core/src/platform/config/env.ts), line 6, accepts any URL scheme.

Runtime probes confirmed that a `/1` database URL produces the same connection options as the default database, and an HTTPS URL is accepted as a plain Redis connection. This can connect a future deployment to the wrong logical database instead of rejecting unsupported configuration. The checked-in example uses DB 0 and is unaffected.

Fix: honor a valid Redis database path or explicitly reject nondefault paths if they are unsupported. Restrict schemes to `redis:` and `rediss:` at the configuration boundary and reject invalid database selections.

Tests: cover DB 0, a nonzero database, invalid database paths, unsupported schemes, encoded credentials and TLS. Assert the final connection options, not only successful parsing.

### CF-9 · P3 · The key RLS test depends on another test's data

Evidence: [contacts.repository.int.spec.ts](../../packages/core/src/contacts/contacts.repository.int.spec.ts) asserts an unfiltered query from store B returns no rows, but the foreign-store customer is inserted by the preceding test at line 34. If the unfiltered test runs alone, both enabled and disabled RLS can return an empty result.

The full suite does exercise a meaningful RLS read check in its current order, and its cross-store INSERT test is useful. The issue is that the most direct read-isolation test does not establish its own precondition.

Fix: seed a known store A row in the test or shared setup, and assert that store A can see it before testing store B. Make the test independently meaningful.

Tests: run the RLS read test alone against a database with the policies applied. A negative-control run with the relevant policy disabled should fail. Extend coverage to missing tenant context, context cleanup after commit/rollback, the stores policy, cross-store UPDATE/DELETE and the same phone in two different stores.

## Additional contract and example gaps

These are follow-up decisions for the first implementing slice; they are not evidence of current production incidents.

- [InboundMessage](../../packages/providers/src/channel/channel-driver.ts), lines 7–15, retains sender, conversation and message IDs but no receiving Page or WhatsApp account ID. CHN-4 needs that identity for tenant lookup. Define a normalized webhook envelope that preserves it instead of forcing core to inspect vendor JSON. Test a batch containing messages addressed to two connected accounts and prove each resolves to the correct store. The complete routing design does not exist yet, so this remains a contract review question rather than a proven routing defect.
- [NewCustomerForm](../../apps/web/src/features/customers/components/new-customer-form.tsx), lines 23–31, has visible labels and alert text but does not associate errors with inputs using ARIA or map `CUSTOMER_PHONE_TAKEN` back to the phone field. Success only resets the form. Finish the example alongside the planned UI field components, including pending and success feedback. Test field association, duplicate-phone correction and successful submission through the rendered form.
- [jobs.md](../rules/jobs.md), line 30, describes checking whether a message was already sent as an idempotency example. That check alone cannot handle concurrent attempts or a crash after a provider accepts a send but before the database records it. Before implementing sends or payments, define a durable operation identifier, provider-supported idempotency where available, and reconciliation for ambiguous outcomes. Test parallel attempts and a crash at the provider-success/database-write boundary; running a job twice sequentially is insufficient by itself.

## Verified good patterns

- Customer repository operations take the store first, use bound parameters, select explicit response columns and keep Drizzle out of the service.
- `TenantDatabase.forStore` sets tenant context transaction-locally with `set_config(..., true)`. Both existing shop tables have RLS policies. The SQL expresses default denial when no tenant is set. This is source verification; the database integration suite was not independently executed for this review.
- [local-init.sql](../../packages/db/local-init.sql) creates a nonowner application role. Table-owner bypass for migrations is deliberate, not an RLS defect. Deployments must preserve the documented role separation.
- The customer uniqueness constraint includes store ID. `onConflictDoNothing` targets that constraint, avoiding a separate check-then-insert race. The service translates the no-row result to the feature's stable conflict code.
- Customer response mapping formats timestamps as ISO UTC strings and does not return the store ID or a complete database row.
- Customer routes require `StoreGuard` and obtain the store through `CurrentStore`. Runtime injection confirmed an unauthenticated write is rejected with 401; user-supplied JSON does not populate the request's trusted store property.
- Unknown errors become generic HTTP responses. CF-1 concerns logs, not the existing response body.
- The shared phone schema is used by both API and form; fixing CF-4 centrally fixes both boundaries.
- The API uses Fastify and the worker creates a Nest application context without an HTTP listener. The Redis helper correctly preserves percent-decoded credentials and enables TLS for `rediss:` in the existing tests.

## Deliberate unfinished work

The [task tracker](../tasks.md) explicitly schedules authentication, sessions, permissions, rate limiting, request logging, UI components, outbox, audit logs and UUID v7 IDs. Their absence is not counted as a regression in this review. The current customer route is inaccessible until trusted session handling populates the store; do not bypass that guard to make the demo form work.

Raw webhook bytes are also deliberately deferred: [http-fastify.md](../rules/http-fastify.md), line 37, says to enable `rawBody` with the first webhook route. No webhook exists yet. Payment and channel drivers, job processors and AI integrations are interfaces or future tasks; there are no implementations whose retries, signatures or money movement can currently be validated.

The migration snapshots do not describe the handwritten RLS policies, which the database rules explicitly place in SQL migrations. This review found no evidence that the existing generation path removes those policies. Any future schema-push workflow would need its own review.
