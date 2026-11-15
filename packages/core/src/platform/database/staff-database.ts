import { AsyncLocalStorage } from 'node:async_hooks';

import { Inject, Injectable } from '@nestjs/common';

import type { Database } from '@dakly/db/client';

import { DATABASE } from './database.tokens';
import type { Transaction } from './tenant-database';
import { transactionKind } from './transaction-kind';

type StaffScope = { staffUserId: string; tx: Transaction; isActive: boolean };

@Injectable()
export class StaffDatabase {
  private readonly scope = new AsyncLocalStorage<StaffScope>();
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async forStaff<TResult>(
    staffUserId: string,
    work: (tx: Transaction) => Promise<TResult>,
  ): Promise<TResult> {
    if (transactionKind.getStore() && transactionKind.getStore() !== 'staff')
      throw new Error('Cannot mix staff and store transactions');
    const current = this.scope.getStore();
    if (current) {
      if (!current.isActive) throw new Error('Staff transaction has already finished');
      if (current.staffUserId !== staffUserId)
        throw new Error('Cannot change staff inside a transaction');
      return work(current.tx);
    }
    return this.db.transaction((tx) => {
      const scope: StaffScope = { staffUserId, tx, isActive: true };
      return transactionKind.run('staff', () =>
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
    staffUserId: string,
    work: (tx: Transaction) => Promise<TResult>,
  ): Promise<TResult> {
    if (!this.scope.getStore()) throw new Error('Staff audit requires an active staff transaction');
    return this.forStaff(staffUserId, work);
  }
}
