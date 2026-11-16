import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';

import { DATABASE } from './database.tokens';
import { ScopedTransactions, type Transaction } from './scoped-transactions';

// Every query on shop data runs through forStore. It sets app.store_id for the
// transaction, so the Postgres RLS policies hide every other store's rows even if
// a WHERE clause is forgotten. See docs/rules/multi-tenancy.md.
@Injectable()
export class TenantDatabase {
  private readonly transactions: ScopedTransactions;

  constructor(@Inject(DATABASE) db: Database) {
    this.transactions = new ScopedTransactions(db, 'store', async (tx, storeId) => {
      await tx.execute(sql`select set_config('app.store_id', ${storeId}, true)`);
    });
  }

  forStore<TResult>(
    storeId: string,
    work: (tx: Transaction) => Promise<TResult>,
  ): Promise<TResult> {
    return this.transactions.run(storeId, work);
  }

  isOpen(): boolean {
    return this.transactions.isOpen();
  }

  inTransaction<TResult>(
    storeId: string,
    work: (tx: Transaction) => Promise<TResult>,
  ): Promise<TResult> {
    return this.transactions.join(storeId, work);
  }
}
