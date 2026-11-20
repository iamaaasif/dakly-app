import { Inject, Injectable } from '@nestjs/common';

import { orderConfirmations } from '@dakly/db/schema/orders';

import { newId } from '../platform/database/new-id';
import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class OrderConfirmationRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // A token left by a send that rolled back is harmless: nobody holds it.
  async insertToken(storeId: string, orderId: string, tokenHash: Buffer): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx.insert(orderConfirmations).values({ id: newId(), storeId, orderId, tokenHash }),
    );
  }
}
