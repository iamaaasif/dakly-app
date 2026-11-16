import { AsyncLocalStorage } from 'node:async_hooks';

import type { Database } from '@dakly/db/client';

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

type ScopeName = 'store' | 'account' | 'staff';

type Scope = { ownerId: string; tx: Transaction; isActive: boolean };

const scopeLabels = {
  store: { title: 'Store', owners: 'stores' },
  account: { title: 'Account', owners: 'users' },
  staff: { title: 'Staff', owners: 'staff' },
} as const satisfies Record<ScopeName, { title: string; owners: string }>;

// Separate account, staff and tenant connections cannot form one atomic action.
const activeScopeName = new AsyncLocalStorage<ScopeName>();

export class ScopedTransactions {
  private readonly scope = new AsyncLocalStorage<Scope>();

  constructor(
    private readonly db: Database,
    private readonly name: ScopeName,
    private readonly begin: (tx: Transaction, ownerId: string) => Promise<void> = async () => {},
  ) {}

  async run<TResult>(
    ownerId: string,
    work: (tx: Transaction) => Promise<TResult>,
  ): Promise<TResult> {
    const activeName = activeScopeName.getStore();
    if (activeName && activeName !== this.name)
      throw new Error(
        `Cannot mix staff, account and store transactions: a ${this.name} transaction inside a ${activeName} transaction`,
      );
    const labels = scopeLabels[this.name];
    const current = this.scope.getStore();
    if (current) {
      if (!current.isActive) throw new Error(`${labels.title} transaction has already finished`);
      if (current.ownerId !== ownerId)
        throw new Error(`Cannot change ${labels.owners} inside a transaction`);
      return work(current.tx);
    }
    return this.db.transaction(async (tx) => {
      await this.begin(tx, ownerId);
      const scope: Scope = { ownerId, tx, isActive: true };
      return activeScopeName.run(this.name, () =>
        this.scope.run(scope, async () => {
          try {
            return await work(tx);
          } finally {
            // Async descendants retain their context; they must not use a released connection.
            scope.isActive = false;
          }
        }),
      );
    });
  }

  isOpen(): boolean {
    return this.scope.getStore()?.isActive === true;
  }

  async join<TResult>(
    ownerId: string,
    work: (tx: Transaction) => Promise<TResult>,
  ): Promise<TResult> {
    if (!this.scope.getStore())
      throw new Error(`This write requires an active ${this.name} transaction`);
    return this.run(ownerId, work);
  }
}
