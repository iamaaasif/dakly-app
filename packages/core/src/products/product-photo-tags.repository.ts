import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';

import type { ProductPhotoTags } from '@dakly/contracts/products';
import { files } from '@dakly/db/schema/platform';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class ProductPhotoTagsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async find(storeId: string, fileId: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          objectKey: files.objectKey,
          contentType: files.contentType,
          isTagged: files.photoTags,
        })
        .from(files)
        .where(
          and(
            eq(files.storeId, storeId),
            eq(files.id, fileId),
            eq(files.purpose, 'product_image'),
            eq(files.status, 'ready'),
          ),
        ),
    );
    return row && { ...row, isTagged: row.isTagged !== null };
  }

  async save(storeId: string, fileId: string, { description, tags }: ProductPhotoTags) {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(files)
        .set({ photoDescription: description, photoTags: tags })
        .where(and(eq(files.storeId, storeId), eq(files.id, fileId))),
    );
  }

  // Walks by file id so a photo the model cannot read is passed once instead of forever.
  async untaggedPhotoIds(storeId: string, after: string | null, limit: number) {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: files.id })
        .from(files)
        .where(
          and(
            eq(files.storeId, storeId),
            eq(files.purpose, 'product_image'),
            eq(files.status, 'ready'),
            isNull(files.photoTags),
            after ? gt(files.id, after) : undefined,
          ),
        )
        .orderBy(asc(files.id))
        .limit(limit),
    );
    return rows.map((row) => row.id);
  }
}
