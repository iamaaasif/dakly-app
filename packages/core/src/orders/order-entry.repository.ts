import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import { orderItems, orders } from '@dakly/db/schema/orders';
import { productVariants } from '@dakly/db/schema/products';

import { TenantDatabase } from '../platform/database/tenant-database';

const openStages = ['to_confirm', 'on_hold', 'to_pack', 'with_courier'] as const;

@Injectable()
export class OrderEntryRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // Only orders the customer received themselves: a gift order carries someone else's address.
  async findLastOwnAddress(storeId: string, contactId: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ address: orders.recipientAddress, areaId: orders.recipientBdAreaId })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            eq(orders.buyerContactId, contactId),
            eq(orders.isRecipientBuyer, true),
            isNotNull(orders.recipientAddress),
          ),
        )
        .orderBy(desc(orders.createdAt))
        .limit(1),
    );
    return row;
  }

  async countOpenOrders(storeId: string, phone: string): Promise<number> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ total: sql<number>`count(*)::int` })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            eq(orders.recipientPhone, phone),
            inArray(orders.stage, openStages),
          ),
        ),
    );
    return row?.total ?? 0;
  }

  // Newest sale first, one row per product.
  async findRecentProductIds(storeId: string, limit: number): Promise<string[]> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          productId: productVariants.productId,
          lastSoldAt: sql<Date>`max(${orders.createdAt})`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
        .where(and(eq(orderItems.storeId, storeId), sql`${orders.stage} <> 'cancelled'`))
        .groupBy(productVariants.productId)
        .orderBy(desc(sql`max(${orders.createdAt})`))
        .limit(limit),
    );
    return rows.map(({ productId }) => productId);
  }
}
