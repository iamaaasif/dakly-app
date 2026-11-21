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
import { ProductOrderVariantsRepository } from './product-order-variants.repository';
import { ProductVariantPhotosRepository } from './product-variant-photos.repository';
import { ProductVariantPhotosService } from './product-variant-photos.service';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

const instant = new Date();
const clock = { now: () => instant };
const upload = { contentType: 'image/png', sizeBytes: 4 } as const;

describe('variant photos with Postgres', () => {
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
        },
        stock: { lowStockThreshold: 3 },
      }),
    } as StoresService,
    storage,
  );
  const photos = () =>
    new ProductVariantPhotosService(
      new ProductsRepository(tenant),
      new ProductVariantPhotosRepository(tenant),
      service,
      transaction,
      new OutboxService(new OutboxRepository(app.db, tenant), transaction),
      clock,
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

  const variantPhotos = photos();
  async function shirt() {
    return service.create(
      f.a,
      createProductSchema.parse({
        name: 'Shirt',
        options: [{ name: 'Colour', values: ['Red', 'Blue'] }],
        variants: [{ optionValues: { Colour: 'Red' } }, { optionValues: { Colour: 'Blue' } }],
      }),
      actor,
    );
  }
  async function uploaded(productId: string, variantId: string) {
    const issued = await variantPhotos.requestUpload(f.a, { productId, variantId }, upload);
    objects.set(`stores/${f.a}/products/${issued.fileId}`, upload);
    return { ...upload, fileId: issued.fileId };
  }

  it('keeps photos per variant, in order, and leaves other variants without photos', async () => {
    const item = await shirt();
    const [red, blue] = item.variants;
    const first = await uploaded(item.id, red!.id);
    const second = await uploaded(item.id, red!.id);
    await variantPhotos.confirm(f.a, { productId: item.id, variantId: red!.id }, first, actor);
    const confirmed = await variantPhotos.confirm(
      f.a,
      { productId: item.id, variantId: red!.id },
      second,
      actor,
    );
    expect(confirmed.variants.find((v) => v.id === red!.id)!.photos.map((p) => p.id)).toEqual([
      first.fileId,
      second.fileId,
    ]);
    expect(confirmed.variants.find((v) => v.id === blue!.id)!.photos).toEqual([]);
    expect(confirmed.photos).toEqual([]);
    const reordered = await variantPhotos.reorder(
      f.a,
      { productId: item.id, variantId: red!.id },
      {
        fileIds: [second.fileId, first.fileId],
      },
    );
    expect(reordered.variants.find((v) => v.id === red!.id)!.imageFileIds).toEqual([
      second.fileId,
      first.fileId,
    ]);
    await expect(
      variantPhotos.reorder(
        f.a,
        { productId: item.id, variantId: red!.id },
        { fileIds: [first.fileId] },
      ),
    ).rejects.toMatchObject({ code: 'PRODUCT_PHOTO_ORDER_INVALID' });
    await variantPhotos.remove(f.a, { productId: item.id, variantId: red!.id }, first.fileId);
    expect((await service.getById(f.a, item.id)).variants[0]!.imageFileIds).toEqual([
      second.fileId,
    ]);
    await expect(
      variantPhotos.remove(f.a, { productId: item.id, variantId: blue!.id }, second.fileId),
    ).rejects.toMatchObject({ code: 'PRODUCT_PHOTO_NOT_FOUND' });
  });

  it('keeps variant photos when the product is edited and the variant is kept', async () => {
    const item = await shirt();
    const red = item.variants[0]!;
    const photo = await uploaded(item.id, red.id);
    await variantPhotos.confirm(f.a, { productId: item.id, variantId: red.id }, photo, actor);
    const edited = await service.edit(f.a, item.id, { name: 'Shirt 2' }, actor);
    expect(edited.variants.find((v) => v.id === red.id)!.imageFileIds).toEqual([photo.fileId]);
  });

  it('shows the product photo for the order picker when a variant has none', async () => {
    const item = await shirt();
    const [red, blue] = item.variants;
    const own = await uploaded(item.id, red!.id);
    await variantPhotos.confirm(f.a, { productId: item.id, variantId: red!.id }, own, actor);
    const shared = {
      ...upload,
      fileId: (await service.requestPhotoUpload(f.a, item.id, upload)).fileId,
    };
    objects.set(`stores/${f.a}/products/${shared.fileId}`, upload);
    await service.confirmPhoto(f.a, item.id, shared, actor);
    const picked = await service.getForOrder(f.a, item.id);
    const urlOf = (id: string) => picked.variants.find((v) => v.id === id)!.photoUrl!;
    expect(new URL(urlOf(red!.id)).pathname).toContain(own.fileId);
    expect(new URL(urlOf(blue!.id)).pathname).toContain(shared.fileId);
  });

  it('refuses a variant of another product or store', async () => {
    const item = await shirt();
    const other = await shirt();
    await expect(
      variantPhotos.requestUpload(
        f.a,
        { productId: item.id, variantId: other.variants[0]!.id },
        upload,
      ),
    ).rejects.toMatchObject({ code: 'PRODUCT_VARIANT_NOT_FOUND' });
    await expect(
      variantPhotos.requestUpload(
        f.b,
        { productId: item.id, variantId: item.variants[0]!.id },
        upload,
      ),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });
});
