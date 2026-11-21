import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { orders } from '@dakly/db/schema/orders';

import { TenantDatabase } from '../platform/database/tenant-database';

export type NewKhataSale = {
  id: string;
  number: number;
  contactId: string | null;
  name: string;
  amountPoisha: number;
  soldAt: Date;
  userId: string;
};

@Injectable()
export class KhataSalesRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // The order is already delivered and paid, and is stamped with the date on the page. Its
  // updated_at equals its created_at until someone changes it, which is how undo tells.
  async insert(storeId: string, sale: NewKhataSale): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx.insert(orders).values({
        id: sale.id,
        storeId,
        number: sale.number,
        buyerContactId: sale.contactId,
        buyerName: sale.name,
        recipientName: sale.name,
        source: 'khata_import',
        createdByType: 'user',
        createdByUserId: sale.userId,
        stage: 'delivered',
        paymentStatus: 'paid',
        itemsSubtotalPoisha: sale.amountPoisha,
        deliveredItemsSubtotalPoisha: sale.amountPoisha,
        deliveredOrderDiscountPoisha: 0,
        codAmountPoisha: 0,
        deliveredAt: sale.soldAt,
        createdAt: sale.soldAt,
        updatedAt: sale.soldAt,
      }),
    );
  }

  // Sales nobody has touched since the import. Returns the ids it removed.
  async deleteUnchanged(storeId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .delete(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            inArray(orders.id, ids),
            eq(orders.source, 'khata_import'),
            sql`${orders.updatedAt} = ${orders.createdAt}`,
          ),
        )
        .returning({ id: orders.id }),
    );
    return rows.map((row) => row.id);
  }
}
