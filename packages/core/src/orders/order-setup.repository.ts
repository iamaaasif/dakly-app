import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { orders } from '@dakly/db/schema/orders';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class OrderSetupRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async hasChatOrder(storeId: string): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            inArray(orders.source, ['messenger', 'instagram', 'whatsapp']),
          ),
        )
        .limit(1),
    );
    return rows.length > 0;
  }
}
