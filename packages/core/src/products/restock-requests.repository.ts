import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, lt, sql } from 'drizzle-orm';

import type { RestockRequestListQuery } from '@dakly/contracts/restock-requests';
import { products, productVariants, restockRequests } from '@dakly/db/schema/products';

import { TenantDatabase } from '../platform/database/tenant-database';

export type RestockRequest = typeof restockRequests.$inferSelect;
type NewRestockRequest = { variantId: string; contactId: string; conversationId: string | null };

@Injectable()
export class RestockRequestsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  findVariant(storeId: string, variantId: string) {
    return this.database.forStore(storeId, async (tx) => {
      const rows = await tx
        .select({
          title: productVariants.title,
          productId: productVariants.productId,
          productName: products.name,
          available: sql<number>`${productVariants.onHand} - ${productVariants.reserved}`,
        })
        .from(productVariants)
        .innerJoin(
          products,
          and(
            eq(products.storeId, productVariants.storeId),
            eq(products.id, productVariants.productId),
          ),
        )
        .where(
          and(
            eq(productVariants.storeId, storeId),
            eq(productVariants.id, variantId),
            sql`${productVariants.status} <> 'archived'`,
          ),
        );
      return rows[0];
    });
  }

  // The partial unique index keeps one waiting row per person and size, so a repeat returns it.
  insertWaiting(storeId: string, input: NewRestockRequest): Promise<RestockRequest | undefined> {
    return this.database.forStore(storeId, async (tx) => {
      const [created] = await tx
        .insert(restockRequests)
        .values({ storeId, ...input })
        .onConflictDoNothing()
        .returning();
      if (created) return created;
      const [existing] = await tx
        .select()
        .from(restockRequests)
        .where(
          and(
            eq(restockRequests.storeId, storeId),
            eq(restockRequests.variantId, input.variantId),
            eq(restockRequests.contactId, input.contactId),
            eq(restockRequests.status, 'waiting'),
          ),
        );
      return existing;
    });
  }

  list(storeId: string, query: RestockRequestListQuery): Promise<RestockRequest[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select()
        .from(restockRequests)
        .where(
          and(
            eq(restockRequests.storeId, storeId),
            eq(restockRequests.status, query.status),
            query.variantId ? eq(restockRequests.variantId, query.variantId) : undefined,
            query.cursor ? lt(restockRequests.id, query.cursor) : undefined,
          ),
        )
        .orderBy(desc(restockRequests.id))
        .limit(query.limit + 1),
    );
  }

  // Oldest first, so people who asked first are told first when more are waiting than one batch.
  listWaiting(storeId: string, variantId: string, limit: number): Promise<RestockRequest[]> {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select()
        .from(restockRequests)
        .where(
          and(
            eq(restockRequests.storeId, storeId),
            eq(restockRequests.variantId, variantId),
            eq(restockRequests.status, 'waiting'),
          ),
        )
        .orderBy(restockRequests.id)
        .limit(limit),
    );
  }

  countWaiting(storeId: string, variantId: string): Promise<number> {
    return this.database.forStore(storeId, async (tx) => {
      const [row] = await tx
        .select({ total: count() })
        .from(restockRequests)
        .where(
          and(
            eq(restockRequests.storeId, storeId),
            eq(restockRequests.variantId, variantId),
            eq(restockRequests.status, 'waiting'),
          ),
        );
      return row?.total ?? 0;
    });
  }

  countWaitingByVariant(storeId: string, productId: string) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({ variantId: restockRequests.variantId, waiting: count() })
        .from(restockRequests)
        .innerJoin(
          productVariants,
          and(
            eq(productVariants.storeId, restockRequests.storeId),
            eq(productVariants.id, restockRequests.variantId),
          ),
        )
        .where(
          and(
            eq(restockRequests.storeId, storeId),
            eq(productVariants.productId, productId),
            eq(restockRequests.status, 'waiting'),
          ),
        )
        .groupBy(restockRequests.variantId),
    );
  }

  // Only a waiting row changes, so approving twice or cancelling a notified row does nothing.
  async markNotified(storeId: string, ids: string[], at: Date): Promise<number> {
    if (ids.length === 0) return 0;
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(restockRequests)
        .set({ status: 'notified', notifiedAt: at })
        .where(
          and(
            eq(restockRequests.storeId, storeId),
            inArray(restockRequests.id, ids),
            eq(restockRequests.status, 'waiting'),
          ),
        )
        .returning({ id: restockRequests.id }),
    );
    return rows.length;
  }

  async cancel(storeId: string, id: string): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(restockRequests)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(restockRequests.storeId, storeId),
            eq(restockRequests.id, id),
            eq(restockRequests.status, 'waiting'),
          ),
        )
        .returning({ id: restockRequests.id }),
    );
    return rows.length > 0;
  }
}
