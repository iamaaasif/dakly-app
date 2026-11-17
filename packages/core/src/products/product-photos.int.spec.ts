import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createProductSchema } from '@dakly/contracts/products';
import { createDatabase } from '@dakly/db/client';
import type {
  FileObjectMetadata,
  FileStorageDriver,
} from '@dakly/providers/file-storage/file-storage-driver';
import { S3FileStorageDriver } from '@dakly/providers/file-storage/s3/s3-file-storage-driver';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { StoreTransaction } from '../platform/database/store-transaction';
import { TenantDatabase } from '../platform/database/tenant-database';
import { OutboxRepository } from '../platform/outbox/outbox.repository';
import { OutboxService } from '../platform/outbox/outbox.service';
import { StoresService } from '../stores/stores.service';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

const instant = new Date();
const clock = { now: () => instant };
const upload = { contentType: 'image/png', sizeBytes: 4 } as const;

describe('product photos with Postgres', () => {
  const f = new OwnerIsolationFixture();
  const app = createDatabase(process.env.DATABASE_URL!);
  const tenant = new TenantDatabase(app.db);
  const transaction = new StoreTransaction(tenant);
  const objects = new Map<string, FileObjectMetadata>();
  const signed = new S3FileStorageDriver(
    {
      endpoint: 'https://files.example.test',
      bucket: 'photos',
      region: 'auto',
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
    clock,
  );
  const storage: FileStorageDriver = {
    createUploadUrl: signed.createUploadUrl.bind(signed),
    deleteObject: signed.deleteObject.bind(signed),
    readBytes: signed.readBytes.bind(signed),
    writeText: signed.writeText.bind(signed),
    createDownloadUrl: signed.createDownloadUrl.bind(signed),
    getObjectMetadata: async (key) => {
      expect(tenant.isOpen()).toBe(false);
      return objects.get(key) ?? null;
    },
  };
  const service = new ProductsService(
    new ProductsRepository(tenant),
    transaction,
    new OutboxService(new OutboxRepository(app.db, tenant), transaction),
    clock,
    {
      settings: async (storeId: string) => ({
        id: storeId,
        name: 'Fixture store',
        slug: null,
        extensions: [],
        legalName: null,
        businessType: null,
        phone: null,
        email: null,
        address: null,
        district: null,
        vatBin: null,
        tradeLicenceNumber: null,
        sending: {
          quietHours: { startHour: 21, endHour: 9 },
          frequencyCap: { perChannelPerDay: 1, perSevenDays: 3 },
          onlyOwnersAndAdminsApprove: true,
        },
        stock: { lowStockThreshold: 3 },
      }),
    } as StoresService,
    storage,
  );
  const actor = { kind: 'user', userId: f.userA } as const;
  beforeAll(() => f.setup());
  afterAll(async () => {
    for (const table of ['outbox_events', 'product_variants', 'products', 'files'])
      await f.connection.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [f.a, f.b],
      ]);
    await app.pool.end();
    await f.close();
  });

  async function product() {
    return service.create(f.a, createProductSchema.parse({ name: 'Photo fixture' }), actor);
  }
  async function uploaded(productId: string) {
    const issued = await service.requestPhotoUpload(f.a, productId, upload);
    objects.set(`stores/${f.a}/products/${issued.fileId}`, upload);
    return { ...upload, fileId: issued.fileId };
  }

  it('records only confirmed uploads and returns fifteen-minute signed downloads in photo order', async () => {
    const item = await product();
    expect(item.photos).toEqual([]);
    const issued = await service.requestPhotoUpload(f.a, item.id, upload);
    const url = new URL(issued.uploadUrl);
    expect(url.pathname).toBe(`/photos/stores/${f.a}/products/${issued.fileId}`);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');
    expect(await f.row('files', issued.fileId)).toBeUndefined();
    objects.set(`stores/${f.a}/products/${issued.fileId}`, upload);
    const confirmed = await service.confirmPhoto(
      f.a,
      item.id,
      { ...upload, fileId: issued.fileId },
      actor,
    );
    await expect(
      service.confirmPhoto(f.a, item.id, { ...upload, fileId: issued.fileId }, actor),
    ).rejects.toMatchObject({ code: 'PRODUCT_PHOTO_ALREADY_ADDED' });
    expect(confirmed.imageFileIds).toEqual([issued.fileId]);
    expect(confirmed.photos.map((photo) => photo.id)).toEqual([issued.fileId]);
    expect(new URL(confirmed.photos[0]!.url).searchParams.get('X-Amz-Expires')).toBe('900');
    expect(await f.row('files', issued.fileId)).toMatchObject({
      store_id: f.a,
      purpose: 'product_image',
      content_type: 'image/png',
      size_bytes: 4,
      status: 'ready',
      uploaded_by_user_id: f.userA,
    });
    expect(
      (await service.list(f.a, { limit: 50 })).items.find((row) => row.id === item.id)!.photos,
    ).toEqual(confirmed.photos);
    const events = await f.connection.pool.query(
      "select payload from outbox_events where store_id=$1 and type='product.updated' and payload->>'productId'=$2",
      [f.a, item.id],
    );
    expect(events.rows).toHaveLength(2);
  });

  it('rejects absent objects and metadata mismatches without recording a file', async () => {
    const item = await product();
    const { fileId } = await service.requestPhotoUpload(f.a, item.id, upload);
    for (const metadata of [
      null,
      { ...upload, sizeBytes: 5 },
      { ...upload, contentType: 'image/jpeg' },
    ]) {
      if (metadata) objects.set(`stores/${f.a}/products/${fileId}`, metadata);
      else objects.delete(`stores/${f.a}/products/${fileId}`);
      await expect(
        service.confirmPhoto(f.a, item.id, { ...upload, fileId }, actor),
      ).rejects.toMatchObject({ code: 'PRODUCT_PHOTO_UPLOAD_INVALID' });
      expect(await f.row('files', fileId)).toBeUndefined();
    }
    expect((await service.getById(f.a, item.id)).imageFileIds).toEqual([]);
  });

  it('requires a complete reorder and detaches removed photos with their purge time', async () => {
    const item = await product();
    const first = await uploaded(item.id),
      second = await uploaded(item.id);
    await service.confirmPhoto(f.a, item.id, first, actor);
    await service.confirmPhoto(f.a, item.id, second, actor);
    await expect(
      service.reorderPhotos(f.a, item.id, { fileIds: [first.fileId] }, actor),
    ).rejects.toMatchObject({ code: 'PRODUCT_PHOTO_ORDER_INVALID' });
    await expect(
      service.reorderPhotos(f.a, item.id, { fileIds: [first.fileId, randomUUID()] }, actor),
    ).rejects.toMatchObject({ code: 'PRODUCT_PHOTO_ORDER_INVALID' });
    const changed = await service.reorderPhotos(
      f.a,
      item.id,
      { fileIds: [second.fileId, first.fileId] },
      actor,
    );
    expect(changed.photos.map((photo) => photo.id)).toEqual([second.fileId, first.fileId]);
    await service.removePhoto(f.a, item.id, first.fileId, actor);
    expect((await service.getById(f.a, item.id)).photos.map((photo) => photo.id)).toEqual([
      second.fileId,
    ]);
    expect(new Date((await f.row('files', first.fileId)).expires_at).getTime()).toBe(
      instant.getTime(),
    );
    await expect(service.removePhoto(f.a, item.id, first.fileId, actor)).rejects.toMatchObject({
      code: 'PRODUCT_PHOTO_NOT_FOUND',
    });
  });

  it('accepts one concurrent confirmation for the last of ten photo slots', async () => {
    const item = await product();
    for (let position = 0; position < 9; position++)
      await service.confirmPhoto(f.a, item.id, await uploaded(item.id), actor);
    const first = await uploaded(item.id),
      second = await uploaded(item.id);
    const results = await Promise.allSettled([
      service.confirmPhoto(f.a, item.id, first, actor),
      service.confirmPhoto(f.a, item.id, second, actor),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'PRODUCT_PHOTO_LIMIT' },
    });
    expect((await service.getById(f.a, item.id)).photos).toHaveLength(10);
    await expect(service.requestPhotoUpload(f.a, item.id, upload)).rejects.toMatchObject({
      code: 'PRODUCT_PHOTO_LIMIT',
    });
    const recorded = await f.connection.pool.query(
      'select id from files where id=any($1::uuid[])',
      [[first.fileId, second.fileId]],
    );
    expect(recorded.rows).toHaveLength(1);
  });

  it('hides foreign products and file references even on an owner connection', async () => {
    const item = await product();
    const photo = await uploaded(item.id);
    await service.confirmPhoto(f.a, item.id, photo, actor);
    await expect(service.confirmPhoto(f.b, item.id, photo, actor)).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
    });
    await expect(service.removePhoto(f.b, item.id, photo.fileId, actor)).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
    });
    const before = await f.row('files', photo.fileId);
    const owner = new ProductsRepository(f.tenant);
    expect(await owner.updatePhotos(f.b, item.id, [], instant)).toBeUndefined();
    await owner.expirePhoto(f.b, photo.fileId, instant);
    expect(await f.row('files', photo.fileId)).toEqual(before);
    const other = await service.create(f.b, createProductSchema.parse({ name: 'Other store' }), {
      kind: 'system',
    });
    await f.connection.pool.query(
      'update products set image_file_ids=ARRAY[$1::uuid] where id=$2',
      [photo.fileId, other.id],
    );
    expect((await owner.findById(f.b, other.id))!.photos).toEqual([]);
  });

  it('rolls back a confirmation when its uploader reference fails', async () => {
    const item = await product();
    const photo = await uploaded(item.id);
    await expect(
      service.confirmPhoto(f.a, item.id, photo, { kind: 'user', userId: randomUUID() }),
    ).rejects.toThrow();
    expect(await f.row('files', photo.fileId)).toBeUndefined();
    expect((await service.getById(f.a, item.id)).imageFileIds).toEqual([]);
  });
});
