import { Inject, Injectable } from '@nestjs/common';

import type { Database } from '@dakly/db/client';

import { DATABASE } from './database.tokens';
import { ScopedTransactions, type Transaction } from './scoped-transactions';

@Injectable()
export class AccountDatabase {
  private readonly transactions: ScopedTransactions;

  constructor(@Inject(DATABASE) db: Database) {
    this.transactions = new ScopedTransactions(db, 'account');
  }

  forUser<TResult>(userId: string, work: (tx: Transaction) => Promise<TResult>): Promise<TResult> {
    return this.transactions.run(userId, work);
  }

  inTransaction<TResult>(
    userId: string,
    work: (tx: Transaction) => Promise<TResult>,
  ): Promise<TResult> {
    return this.transactions.join(userId, work);
  }
}
