# 0002: Drizzle ORM

- Status: accepted
- Date: 2026-11-12

## Context

We need SQL control for row level security, partitioned message tables and pgvector, plus typed queries. Prisma hides SQL and makes per-transaction settings (`set_config`) awkward.

## Decision

Use Drizzle with `node-postgres`. Schema lives in `packages/db/src/schema/<feature>.ts`. Migrations are generated with `drizzle-kit generate`; RLS policies and other hand-written SQL go in custom migrations.

## Consequences

Queries read like SQL and are fully typed. We write RLS SQL ourselves. Applied migrations are never edited.
