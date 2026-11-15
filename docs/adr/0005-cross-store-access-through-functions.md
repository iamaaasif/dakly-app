# 0005: Cross-store access through small definer functions

- Status: proposed
- Date: 2026-11-13

## Context

ADR 0003 hides every shop row unless `app.store_id` is set. Some work starts before the store is known (a webhook names a page id, a payment callback names a reference, a sign-in names a user), and some work looks across stores (renewals, token checks, the outbox relay, the admin stores list). Under RLS these queries return zero rows and no error, so a job would look like it ran and do nothing (schema review must-fix 4). Turning RLS off, a bypass role, or `FORCE` with `row_security = off` are all unsafe or do not work (must-fix 3).

## Decision

No table uses `FORCE ROW LEVEL SECURITY`. The app keeps connecting as `dakly_app`, which does not own the tables.

Each way in without a store is one `SECURITY DEFINER` function that returns only ids, usually `(store_id, id)`. The caller then does the real work inside `forStore` for that store. Every such function sets `search_path = pg_catalog, public, pg_temp`, revokes EXECUTE from PUBLIC and grants it to `dakly_app` only; an integration test checks all three for every definer function.

`outbox_events` is a global table: the app may only insert, and the relay reads it through `claim_outbox_events`. The admin stores list reads `admin_store_overview`, which returns store metadata and counts, never customer or order content.

The functions are listed in [docs/data/isolation-and-access.md](../data/isolation-and-access.md).

## Consequences

Every shop query still runs under RLS, including jobs and admin. Each new entry point or sweep needs a function in a migration and a row in the list, which is a small, reviewable cost. A function that returned whole rows would leak, so review checks that each returns ids only. If a sweep's function becomes slow, the fix is a partial index on its due column, not a wider function.
