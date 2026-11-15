import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@dakly/db/client';
import { DATABASE } from './database.tokens';
import type { Transaction } from './tenant-database';
import { transactionKind } from './transaction-kind';

type AccountScope = { userId: string; tx: Transaction; isActive: boolean };

@Injectable()
export class AccountDatabase {
  private readonly scope = new AsyncLocalStorage<AccountScope>();
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async forUser<TResult>(
    userId: string,
    work: (tx: Transaction) => Promise<TResult>,
  ): Promise<TResult> {
    if (transactionKind.getStore() && transactionKind.getStore() !== 'account')
      throw new Error('Cannot mix staff, account and store transactions');
    const current = this.scope.getStore();
    if (current) {
      if (!current.isActive) throw new Error('Account transaction has already finished');
      if (current.userId !== userId) throw new Error('Cannot change users inside a transaction');
      return work(current.tx);
    }
    return this.db.transaction((tx) => {
      const scope: AccountScope = { userId, tx, isActive: true };
      return transactionKind.run('account', () =>
        this.scope.run(scope, async () => {
          try {
            return await work(tx);
          } finally {
            scope.isActive = false;
          }
        }),
      );
    });
  }

  async inTransaction<TResult>(
    userId: string,
    work: (tx: Transaction) => Promise<TResult>,
  ): Promise<TResult> {
    if (!this.scope.getStore())
      throw new Error('Account audit requires an active account transaction');
    return this.forUser(userId, work);
  }
}
