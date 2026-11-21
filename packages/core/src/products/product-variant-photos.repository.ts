import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';

import { productVariants } from '@dakly/db/schema/products';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class ProductVariantPhotosRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async update(
    storeId: string,
    ids: { productId: string; variantId: string },
    imageFileIds: string[],
    now: Date,
  ): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(productVariants)
        .set({ imageFileIds, updatedAt: now })
        .where(
          and(
            eq(productVariants.storeId, storeId),
            eq(productVariants.productId, ids.productId),
            eq(productVariants.id, ids.variantId),
            ne(productVariants.status, 'archived'),
          ),
        )
        .returning({ id: productVariants.id }),
    );
    return rows.length > 0;
  }
}
