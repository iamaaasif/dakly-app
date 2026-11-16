# Multi-tenancy: one store never sees another

Every shop's data is isolated twice: in code by `storeId`, and in Postgres by row level security.

1. Every table with shop data has `store_id uuid not null references stores(id)`.
2. The same PR adds an RLS policy for it (copy `packages/db/migrations/0001_store_isolation_rls.sql`).
3. Every repository method takes `storeId` as its first argument, filters by it, and runs inside `TenantDatabase.forStore(storeId, ...)`, which sets `app.store_id` for the transaction.
4. The app connects as `dakly_app`, which does not own the tables, so RLS applies. Migrations run as the owner.
5. `storeId` comes only from the verified session (`@CurrentStore()`). Never from the body, query string or a header.
6. Every job payload carries `storeId`.
7. Every new repository gets an integration test proving store B cannot read store A's rows (see `contacts.repository.int.spec.ts`).

**Why both:** the WHERE clause is the normal path; RLS catches the one query someone forgets to filter. A leak between shops would end the business.

Wrong:

```ts
findById(id: string) {
  return this.db.select().from(orders).where(eq(orders.id, id));
}
```

Right:

```ts
findById(storeId: string, id: string) {
  return this.database.forStore(storeId, (tx) =>
    tx.select(orderColumns).from(orders).where(and(eq(orders.storeId, storeId), eq(orders.id, id))),
  );
}
```

Jobs that work across many stores (renewals, token checks, nightly stats) get the list of stores with work due from a `SECURITY DEFINER` function, then do each store's work inside `forStore`. They never turn RLS off (see [database.md](database.md#work-across-stores)).

Staff support access goes through an approved, time-limited support grant (see the architecture doc), never by switching off RLS.
