# 0003: Store isolation with Postgres RLS

- Status: accepted
- Date: 2026-11-12

## Context

Every shop's customers, chats and orders must be invisible to every other shop. A single forgotten `WHERE store_id = ...` would leak data.

## Decision

Shared tables with a `store_id` column. Every query runs in a transaction that sets `app.store_id` (`TenantDatabase.forStore`). RLS policies on every shop table compare `store_id` to that setting. The app connects as a role that does not own the tables, so RLS always applies; migrations run as the owner.

## Consequences

Two layers of protection. Every new table needs a policy and a cross-store test. Each request uses a short transaction, which is fine at our scale. Cross-store admin queries run in the separate admin app through approved support access.
