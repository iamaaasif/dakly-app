# Database and Drizzle

PostgreSQL 16 with Drizzle ORM ([ADR 0002](../adr/0002-drizzle-orm.md)) and row level security ([ADR 0003](../adr/0003-store-isolation-rls.md)). Sources: the PostgreSQL wiki [Don't Do This](https://wiki.postgresql.org/wiki/Don't_Do_This), GitLab's [migration style guide](https://docs.gitlab.com/ee/development/migration_style_guide.html) (safe migrations on a live database), and [Immich's repositories](https://github.com/immich-app/immich/tree/main/server/src/repositories).

## Tables and columns

| Rule                                                                                                                                                           | Why                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Table names plural snake_case (`order_items`); columns snake_case. A log or ledger keeps its collective noun (`audit_log`, `staff_audit_log`, `wallet_ledger`) | One style in SQL; Drizzle maps to camelCase in TypeScript                                                                               |
| `id uuid primary key` with UUID v7 generated in the app                                                                                                        | Time-ordered ids keep indexes compact; ids are safe to show. The first tables still use `defaultRandom()` (v4); task DB-1 switches them |
| `store_id uuid not null references stores(id)` on every shop table, plus an RLS policy in the same migration                                                   | [multi-tenancy.md](multi-tenancy.md)                                                                                                    |
| `created_at timestamptz not null default now()`, `updated_at` where rows change                                                                                | Always `timestamptz`, stored UTC                                                                                                        |
| Money: `bigint` ending `_poisha`; a column holding money or a count by kind says so (`quantity_delta`)                                                         | No floats, no `numeric` for money, no `money` type                                                                                      |
| Status and kind: `text` with a `CHECK (status in (...))`                                                                                                       | Adding a value is a simple migration; Postgres enums are not                                                                            |
| Strings: `text`, with a `CHECK (char_length(...) <= n)` where a limit matters                                                                                  | `varchar(n)` gives nothing extra                                                                                                        |
| Phones: `text` in `01XXXXXXXXX` form                                                                                                                           | One format everywhere; normalised by the contracts schema                                                                               |
| Booleans named `is_...` or `has_...`, `not null default false`; a role permission may use `can_...` (`can_refund`)                                             | No three-state booleans                                                                                                                 |
| JSON only for data the database never filters on (`settings` validated by zod)                                                                                 | Filtered data gets real columns                                                                                                         |
| Every foreign key has an index, and every query in the repository is backed by an index                                                                        | Checked in review with `EXPLAIN` for new list queries                                                                                   |
| Soft delete only where the product needs undo or retention (`deleted_at`)                                                                                      | Hard delete otherwise                                                                                                                   |

## Migrations

1. Change the schema in `packages/db/src/schema/<feature>.ts`, then run `pnpm --filter @dakly/db db:generate`. Review the SQL it wrote.
2. RLS policies, grants, functions and triggers go in the same migration as their table, written by hand below the generated SQL.
3. Never edit a migration that has been merged. Write a new one. One migration has one purpose, usually one feature's tables; name it with `--name` (`pnpm --filter @dakly/db db:generate --name orders_returns`), never the random name drizzle-kit picks.
4. Migrations must be safe on a live database:
   - Add a column as nullable or with a constant default; backfill in a job; add `NOT NULL` later.
   - Create indexes on big tables with `CREATE INDEX CONCURRENTLY` in their own migration.
   - Rename in steps: add new, write both, move reads, drop old in a later release.
   - No long `ALTER TABLE` on `messages`, `orders` or `contacts` during the day.
5. Migrations run as the table owner. The app runs as `dakly_app`, which does not own tables, so RLS applies.

## Repositories

- Only `*.repository.ts` files and `platform/database/` import `drizzle-orm` or `@dakly/db` (`pnpm lint:boundaries`).
- Every method takes `storeId` first and runs inside `TenantDatabase.forStore(storeId, ...)`. It also filters by `store_id` in the `WHERE`.
- Select explicit columns (`orderColumns`), never `select()` of everything. Return plain objects typed by the repository.
- No business rules: no "if stage is X". A repository may translate a unique-violation into `null` or a typed result for the service to decide.
- Use the query builder. Raw `sql` only for what Drizzle cannot express, always with bound parameters (`sql\`... ${value}\``), never string concatenation.
- No queries in a loop. Load a list with one `inArray` query.
- Lists are paginated with a cursor and a limit.

## Transactions and locks

- A transaction covers one business action and nothing slow. Never hold a transaction or a row lock while calling the AI model, a payment gateway, a courier or Meta. Read, release, call the vendor, then write in a new short transaction with a guard (pending review must-fix):

```ts
// Wrong: the row lock is held for the 5 to 20 seconds the model takes.
await this.database.forStore(storeId, async (tx) => {
  const conversation = await lockConversation(tx, conversationId);
  const reply = await this.aiService.writeReply(conversation);
  await insertMessage(tx, reply);
});

// Right: call the model outside, then write only if a person has not taken over.
const reply = await this.aiService.writeReply(conversation);
const isSaved = await this.chatsRepository.insertAiReplyIfAiResponder(
  storeId,
  conversationId,
  reply,
);
```

- Prefer guarded updates over locks: `UPDATE ... WHERE id = $1 AND status = $2` and check the row count.
- Counters (order numbers) use `UPDATE ... RETURNING`, not `SELECT max() + 1`.
- Writes that other features must hear about insert an outbox row in the same transaction.

## Work across stores

Jobs that scan many stores (renewals, token checks, nightly stats) never switch RLS off. They call a `SECURITY DEFINER` function that returns only store ids with work due, then run each store's work inside `forStore` (pending review must-fix). Every `SECURITY DEFINER` function sets `search_path`, revokes `EXECUTE` from `public`, and grants it only to `dakly_app`.

## Tests

Every repository has an integration test against real Postgres, including one that proves store B cannot read or change store A's rows ([testing.md](testing.md)).
