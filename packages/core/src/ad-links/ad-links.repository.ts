import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import type { AdLinkSource } from '@dakly/contracts/ad-links';
import { adProductLinks } from '@dakly/db/schema/ad-links';

import { newId } from '../platform/database/new-id';
import { TenantDatabase } from '../platform/database/tenant-database';

type Key = { source: AdLinkSource; externalId: string };

@Injectable()
export class AdLinksRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async listProductIds(storeId: string, { source, externalId }: Key): Promise<string[]> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ productId: adProductLinks.productId })
        .from(adProductLinks)
        .where(
          and(
            eq(adProductLinks.storeId, storeId),
            eq(adProductLinks.source, source),
            eq(adProductLinks.externalId, externalId),
          ),
        )
        .orderBy(asc(adProductLinks.position)),
    );
    return rows.map(({ productId }) => productId);
  }

  // One transaction swaps the whole set, so a reader never sees half of the old list and half of the new.
  replace(storeId: string, { source, externalId }: Key, productIds: string[]) {
    return this.database.forStore(storeId, async (tx) => {
      await tx
        .delete(adProductLinks)
        .where(
          and(
            eq(adProductLinks.storeId, storeId),
            eq(adProductLinks.source, source),
            eq(adProductLinks.externalId, externalId),
          ),
        );
      await tx.insert(adProductLinks).values(
        productIds.map((productId, position) => ({
          id: newId(),
          storeId,
          source,
          externalId,
          productId,
          position,
        })),
      );
    });
  }

  async remove(storeId: string, { source, externalId }: Key): Promise<boolean> {
    const removed = await this.database.forStore(storeId, (tx) =>
      tx
        .delete(adProductLinks)
        .where(
          and(
            eq(adProductLinks.storeId, storeId),
            eq(adProductLinks.source, source),
            eq(adProductLinks.externalId, externalId),
          ),
        )
        .returning({ id: adProductLinks.id }),
    );
    return removed.length > 0;
  }
}
