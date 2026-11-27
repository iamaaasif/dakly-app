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
import { ProductMediaRepository } from './product-media.repository';
import { ProductMediaService } from './product-media.service';
import { ProductOrderVariantsRepository } from './product-order-variants.repository';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

const instant = new Date();
const clock = { now: () => instant };
const upload = { contentType: 'image/png', sizeBytes: 4 } as const;

describe('product media uploaded before the product exists', () => {
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
  const media = new ProductMediaService(
    new ProductsRepository(tenant),
    new ProductMediaRepository(tenant),
    new OutboxService(new OutboxRepository(app.db, tenant), transaction),
    clock,
    storage,
  );
  const service = new ProductsService(
    new ProductsRepository(tenant),
    new ProductOrderVariantsRepository(tenant),
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
          sms: { quietHoursOn: true, dailyLimit: { on: true, perDay: 2000 } },
        },
        stock: { lowStockThreshold: 3 },
      }),
    } as StoresService,
    storage,
    {} as never,
    {} as never,
    { unitsToConfirm: async () => [] } as never,
    {} as never,
    media,
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

  async function uploaded() {
    const issued = await media.requestUpload(f.a, upload);
    objects.set(`stores/${f.a}/products/${issued.fileId}`, upload);
    await media.confirm(f.a, f.userA, { ...upload, fileId: issued.fileId });
    return issued.fileId;
  }
  const create = (imageFileIds: string[]) =>
    service.create(f.a, createProductSchema.parse({ name: 'Media fixture', imageFileIds }), actor);

  it('keeps an unattached photo for 24 hours, then attaches it in order when the product is created', async () => {
    const first = await uploaded();
    const second = await uploaded();
    expect(new Date((await f.row('files', first))!.expires_at as string)).toEqual(
      new Date(instant.getTime() + 86_400_000),
    );
    const item = await create([second, first]);
    expect(item.imageFileIds).toEqual([second, first]);
    expect(item.photos.map((photo) => photo.id)).toEqual([second, first]);
    expect((await f.row('files', first))!.expires_at).toBeNull();
    const events = await f.connection.pool.query(
      "select payload from outbox_events where store_id=$1 and type='product.photo_added' and payload->>'productId'=$2",
      [f.a, item.id],
    );
    expect(events.rows).toHaveLength(2);
  });

  it("refuses a photo that is already on a product, unknown, or another store's", async () => {
    const fileId = await uploaded();
    await create([fileId]);
    await expect(create([fileId])).rejects.toMatchObject({ code: 'PRODUCT_PHOTO_NOT_FOUND' });
    await expect(create([randomUUID()])).rejects.toMatchObject({ code: 'PRODUCT_PHOTO_NOT_FOUND' });
    expect(() =>
      createProductSchema.parse({ name: 'x', imageFileIds: [fileId, fileId] }),
    ).toThrow();
  });

  it('rejects a confirm that does not match the stored object and limits waiting photos', async () => {
    const { fileId } = await media.requestUpload(f.a, upload);
    await expect(media.confirm(f.a, f.userA, { ...upload, fileId })).rejects.toMatchObject({
      code: 'PRODUCT_PHOTO_UPLOAD_INVALID',
    });
    await f.connection.pool.query('delete from files where store_id=$1 and expires_at > now()', [
      f.a,
    ]);
    for (let n = 0; n < 50; n += 1) await uploaded();
    await expect(media.requestUpload(f.a, upload)).rejects.toMatchObject({
      code: 'PRODUCT_MEDIA_PENDING_LIMIT',
    });
  });
});
