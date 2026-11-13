import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@dakly/db/uuid-v7';
import { TenantDatabase } from './tenant-database';

@Injectable()
export class StoreTransaction {
  constructor(private readonly database: TenantDatabase) {}

  run<TResult>(storeId: string, work: () => Promise<TResult>): Promise<TResult> {
    return this.database.forStore(storeId, () => work());
  }

  runForNewStore<TResult>(work: (storeId: string) => Promise<TResult>): Promise<TResult> {
    const storeId = uuidv7();
    return this.run(storeId, () => work(storeId));
  }
}
