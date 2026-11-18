import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { stores } from '@dakly/db/schema/stores';
import { uuidv7 } from '@dakly/db/uuid-v7';

import { TenantDatabase } from './tenant-database';

@Injectable()
export class StoreTransaction {
  constructor(private readonly database: TenantDatabase) {}

  run<TResult>(storeId: string, work: () => Promise<TResult>): Promise<TResult> {
    return this.database.forStore(storeId, () => work());
  }

  isOpen(): boolean {
    return this.database.isOpen();
  }

  // The caller takes any required locks before reading this time.
  async databaseTime(storeId: string): Promise<Date> {
    return this.database.inTransaction(storeId, async (tx) => {
      const { rows } = await tx.execute<{ milliseconds: string }>(
        sql`select floor(extract(epoch from clock_timestamp()) * 1000)::bigint as milliseconds`,
      );
      const [time] = rows;
      if (!time) throw new Error('Postgres did not return the current time');
      return new Date(Number(time.milliseconds));
    });
  }

  runLocked<TResult>(storeId: string, work: () => Promise<TResult>): Promise<TResult> {
    return this.database.forStore(storeId, async (tx) => {
      // Serialize store decisions without blocking foreign-key checks from account actions.
      await tx
        .select({ id: stores.id })
        .from(stores)
        .where(eq(stores.id, storeId))
        .for('no key update');
      return work();
    });
  }

  runForNewStore<TResult>(work: (storeId: string) => Promise<TResult>): Promise<TResult> {
    const storeId = uuidv7();
    return this.run(storeId, () => work(storeId));
  }
}
