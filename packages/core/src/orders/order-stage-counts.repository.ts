import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, inArray } from 'drizzle-orm';

import { editableOrderStages } from '@dakly/contracts/orders';
import { orders } from '@dakly/db/schema/orders';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class OrderStageCountsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async countAwaitingAdvance(storeId: string): Promise<number> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ total: count() })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            eq(orders.paymentStatus, 'advance_requested'),
            inArray(orders.stage, editableOrderStages),
          ),
        ),
    );
    return row?.total ?? 0;
  }
}
