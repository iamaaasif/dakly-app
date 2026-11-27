import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gt, inArray } from 'drizzle-orm';

import { files } from '@dakly/db/schema/platform';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class ProductMediaRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  countPendingPhotos(storeId: string, now: Date): Promise<number> {
    return this.database.forStore(storeId, async (tx) => {
      const [row] = await tx
        .select({ total: count() })
        .from(files)
        .where(
          and(
            eq(files.storeId, storeId),
            eq(files.purpose, 'product_image'),
            gt(files.expiresAt, now),
          ),
        );
      return row?.total ?? 0;
    });
  }

  // Only a photo that was uploaded for a product and is still waiting can be attached; one that
  // is already on a product has no expiry, so this cannot take a photo from another product.
  async attachPendingPhotos(storeId: string, fileIds: string[], now: Date): Promise<number> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .update(files)
        .set({ expiresAt: null })
        .where(
          and(
            eq(files.storeId, storeId),
            eq(files.purpose, 'product_image'),
            inArray(files.id, fileIds),
            gt(files.expiresAt, now),
          ),
        )
        .returning({ id: files.id }),
    );
    return rows.length;
  }
}
