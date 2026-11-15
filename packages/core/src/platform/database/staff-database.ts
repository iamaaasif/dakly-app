import { Inject, Injectable } from '@nestjs/common';

import type { Database } from '@dakly/db/client';

import { DATABASE } from './database.tokens';
import { ScopedTransactions, type Transaction } from './scoped-transactions';

@Injectable()
export class StaffDatabase {
  private readonly transactions: ScopedTransactions;

  constructor(@Inject(DATABASE) db: Database) {
    this.transactions = new ScopedTransactions(db, 'staff');
  }

  forStaff<TResult>(
    staffUserId: string,
    work: (tx: Transaction) => Promise<TResult>,
  ): Promise<TResult> {
    return this.transactions.run(staffUserId, work);
  }

  inTransaction<TResult>(
    staffUserId: string,
    work: (tx: Transaction) => Promise<TResult>,
  ): Promise<TResult> {
    return this.transactions.join(staffUserId, work);
  }
}
