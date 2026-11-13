import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Database } from '@dakly/db/client';
import { DATABASE } from './database.tokens';

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

type StoreScope = { storeId: string; tx: Transaction; isActive: boolean };

// Every query on shop data runs through forStore. It sets app.store_id for the
// transaction, so the Postgres RLS policies hide every other store's rows even if
// a WHERE clause is forgotten. See docs/rules/multi-tenancy.md.
@Injectable()
export class TenantDatabase {
  private readonly scope = new AsyncLocalStorage<StoreScope>();

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async forStore<TResult>(
    storeId: string,
    work: (tx: Transaction) => Promise<TResult>,
  ): Promise<TResult> {
    const current = this.scope.getStore();
    if (current) {
      if (!current.isActive) throw new Error('Store transaction has already finished');
      if (current.storeId !== storeId) throw new Error('Cannot change stores inside a transaction');
      return work(current.tx);
    }

    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.store_id', ${storeId}, true)`);
      const scope: StoreScope = { storeId, tx, isActive: true };
      return this.scope.run(scope, async () => {
        try {
          return await work(tx);
        } finally {
          // Async descendants retain their context; they must not use a released connection.
          scope.isActive = false;
        }
      });
    });
  }
}
