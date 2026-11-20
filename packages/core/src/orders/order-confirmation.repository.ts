import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { orderConfirmations } from '@dakly/db/schema/orders';

import { newId } from '../platform/database/new-id';
import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class OrderConfirmationRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // One row per order. A new message about the order replaces the token, and the unique index
  // keeps two sends at the same moment to one row.
  async replaceToken(storeId: string, orderId: string, tokenHash: Buffer): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .insert(orderConfirmations)
        .values({ id: newId(), storeId, orderId, tokenHash })
        .onConflictDoUpdate({
          target: [orderConfirmations.storeId, orderConfirmations.orderId],
          set: { tokenHash, createdAt: sql`now()` },
        }),
    );
  }
}
