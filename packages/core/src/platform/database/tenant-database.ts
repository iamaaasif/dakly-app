import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Database } from '@dakly/db/client';
import { DATABASE } from './database.tokens';

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

// Every query on shop data runs through forStore. It sets app.store_id for the
// transaction, so the Postgres RLS policies hide every other store's rows even if
// a WHERE clause is forgotten. See docs/rules/multi-tenancy.md.
@Injectable()
export class TenantDatabase {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  forStore<TResult>(
    storeId: string,
    work: (tx: Transaction) => Promise<TResult>,
  ): Promise<TResult> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.store_id', ${storeId}, true)`);
      return work(tx);
    });
  }
}
