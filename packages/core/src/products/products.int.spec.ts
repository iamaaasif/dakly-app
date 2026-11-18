import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createProductSchema } from '@dakly/contracts/products';
import { createDatabase } from '@dakly/db/client';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { TenantDatabase } from '../platform/database/tenant-database';
import { OutboxRepository } from '../platform/outbox/outbox.repository';
import { OutboxService } from '../platform/outbox/outbox.service';
import { StoresService } from '../stores/stores.service';
import { ProductOrderVariantsRepository } from './product-order-variants.repository';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

const actor = { kind: 'system' } as const;
const instant = new Date('2026-11-17T08:00:00Z');

describe('ProductsService with Postgres', () => {
  const f = new OwnerIsolationFixture();
  const app = createDatabase(process.env.DATABASE_URL!);
  const tenant = new TenantDatabase(app.db);
  const transaction = new StoreTransaction(tenant);
  const repository = new ProductsRepository(tenant);
  const service = new ProductsService(
    repository,
    new ProductOrderVariantsRepository(tenant),
    transaction,
    new OutboxService(new OutboxRepository(app.db, tenant), transaction),
    { now: () => instant } as Clock,
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
    {} as FileStorageDriver,
  );
  const ownerRepository = new ProductsRepository(f.tenant);
  beforeAll(() => f.setup());
  afterAll(async () => {
    for (const table of ['outbox_events', 'product_variants', 'products'])
      await f.connection.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [f.a, f.b],
      ]);
    await app.pool.end();
    await f.close();
  });

  it('creates exactly one default variant, inherits price and emits an event atomically', async () => {
    const product = await service.create(
      f.a,
      createProductSchema.parse({
        name: 'পাঞ্জাবি',
        pricePoisha: 125050,
        aliases: ['panjabi', 'পাঞ্জাবি'],
      }),
      actor,
    );
    expect(product).toMatchObject({
      name: 'পাঞ্জাবি',
      aliases: ['panjabi', 'পাঞ্জাবি'],
      createdAt: instant.toISOString(),
    });
    expect(product.variants).toEqual([
      expect.objectContaining({
        title: 'Default',
        isDefault: true,
        pricePoisha: 125050,
        available: 0,
      }),
    ]);
    const events = await f.connection.pool.query(
      'select payload from outbox_events where store_id=$1 and type=$2',
      [f.a, 'product.updated'],
    );
    expect(events.rows.map((row) => row.payload)).toContainEqual({ productId: product.id });
  });

  it('edits variant prices while preserving variant ids and stock', async () => {
    const input = createProductSchema.parse({
      name: 'কুর্তি',
      pricePoisha: 0,
      options: [{ name: 'Size', values: ['M', 'L'] }],
      variants: [
        { optionValues: { Size: 'M' }, priceOverridePoisha: 60000 },
        { optionValues: { Size: 'L' }, priceOverridePoisha: null },
      ],
    });
    const product = await service.create(f.a, input, actor);
    const id = product.variants[0]!.id;
    await f.connection.pool.query('update product_variants set on_hand=5,reserved=2 where id=$1', [
      id,
    ]);
    const edited = await service.edit(
      f.a,
      product.id,
      {
        ...input,
        pricePoisha: 50000,
        variants: product.variants.map((variant) => ({ ...variant, priceOverridePoisha: null })),
      },
      actor,
    );
    expect(edited.variants[0]).toMatchObject({
      id,
      pricePoisha: 50000,
      onHand: 5,
      reserved: 2,
      available: 3,
    });
    expect(product.variants.map((variant) => variant.pricePoisha)).toEqual([60000, 0]);
  });

  it('preserves price, aliases and variants on a name-only edit', async () => {
    const product = await service.create(
      f.a,
      createProductSchema.parse({
        name: 'Before edit',
        pricePoisha: 42000,
        aliases: ['kurti'],
        variants: [{ sku: 'KEEP' }],
      }),
      actor,
    );
    const edited = await service.edit(f.a, product.id, { name: 'After edit' }, actor);
    expect(edited).toMatchObject({ name: 'After edit', pricePoisha: 42000, aliases: ['kurti'] });
    expect(edited.variants).toEqual(product.variants);
  });

  it('keeps the default variant when details change without explicit variants', async () => {
    const input = createProductSchema.parse({ name: 'স্যান্ডেল' });
    const product = await service.create(f.a, input, actor);
    const edited = await service.edit(f.a, product.id, { ...input, pricePoisha: 20000 }, actor);
    expect(edited.variants.map((variant) => variant.id)).toEqual([product.variants[0]!.id]);
  });

  it('hides foreign ids under RLS and with owner connections', async () => {
    const input = createProductSchema.parse({ name: 'রিনার শাড়ি' });
    const product = await service.create(f.a, input, actor);
    await expect(service.getById(f.b, product.id)).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
    });
    expect(await ownerRepository.findById(f.b, product.id)).toBeUndefined();
    expect(await ownerRepository.findVariants(f.b, [product.id])).toEqual([]);
    expect(await ownerRepository.update(f.b, product.id, input, instant)).toBeUndefined();
    expect(await ownerRepository.archive(f.b, product.id, instant)).toBe(false);
    expect(await service.getById(f.a, product.id)).toMatchObject({ name: 'রিনার শাড়ি' });
  });

  it('rolls back product edits and events when a variant does not belong to the product', async () => {
    const input = createProductSchema.parse({ name: 'শাড়ি' });
    const product = await service.create(f.a, input, actor);
    const before = await f.row('products', product.id);
    const count = async () =>
      (
        await f.connection.pool.query(
          'select count(*)::int as count from outbox_events where store_id=$1',
          [f.a],
        )
      ).rows[0].count;
    const events = await count();
    await expect(
      service.edit(
        f.a,
        product.id,
        {
          ...input,
          name: 'Changed',
          variants: [
            {
              id: randomUUID(),
              optionValues: {},
              sku: null,
              costPoisha: null,
              priceOverridePoisha: null,
            },
          ],
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'PRODUCT_VARIANT_NOT_FOUND' });
    expect(await f.row('products', product.id)).toEqual(before);
    expect(await count()).toBe(events);
  });

  it('rejects a duplicate SKU without leaving a product or an event', async () => {
    const input = createProductSchema.parse({ name: 'SKU product', variants: [{ sku: 'P-100' }] });
    await service.create(f.a, input, actor);
    await expect(service.create(f.a, input, actor)).rejects.toMatchObject({
      code: 'PRODUCT_SKU_TAKEN',
    });
    expect((await service.list(f.a, { limit: 50, search: 'SKU product' })).items).toHaveLength(1);
  });

  it('archives a product without removing its variant or changing past stock', async () => {
    const product = await service.create(
      f.a,
      createProductSchema.parse({ name: 'To archive' }),
      actor,
    );
    await service.remove(f.a, product.id, actor);
    await expect(service.getById(f.a, product.id)).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
    });
    expect(await f.row('product_variants', product.variants[0]!.id)).toMatchObject({
      product_id: product.id,
    });
  });

  it('returns one catalogue snapshot when a price edit commits during a detail read', async () => {
    const input = createProductSchema.parse({
      name: 'Snapshot detail',
      pricePoisha: 10000,
      variants: [{ priceOverridePoisha: 20000 }],
    });
    const product = await service.create(f.a, input, actor);
    const read = repository.findById.bind(repository);
    const interleave = vi
      .spyOn(repository, 'findById')
      .mockImplementationOnce(async (storeId, id) => {
        const snapshot = await read(storeId, id);
        await service.edit(
          f.a,
          product.id,
          {
            pricePoisha: 30000,
            options: [],
            variants: [
              {
                id: product.variants[0]!.id,
                optionValues: {},
                sku: null,
                costPoisha: null,
                priceOverridePoisha: null,
              },
            ],
          },
          actor,
        );
        return snapshot;
      });
    try {
      expect((await service.getById(f.a, product.id)).variants[0]!.pricePoisha).toBe(20000);
    } finally {
      interleave.mockRestore();
    }
  });

  it('keeps readiness and variant prices in the same list snapshot during an edit', async () => {
    const product = await service.create(
      f.a,
      createProductSchema.parse({
        name: 'Snapshot list',
        pricePoisha: 0,
        options: [{ name: 'Size', values: ['M', 'L'] }],
        variants: [
          { optionValues: { Size: 'M' }, priceOverridePoisha: 20000 },
          { optionValues: { Size: 'L' } },
        ],
      }),
      actor,
    );
    const read = repository.list.bind(repository);
    const interleave = vi
      .spyOn(repository, 'list')
      .mockImplementationOnce(async (storeId, query, lowStockThreshold) => {
        const snapshot = await read(storeId, query, lowStockThreshold);
        await service.edit(
          f.a,
          product.id,
          {
            pricePoisha: 30000,
            options: product.options,
            variants: product.variants.map((variant) => ({
              ...variant,
              priceOverridePoisha: null,
            })),
          },
          actor,
        );
        return snapshot;
      });
    try {
      const page = await service.list(f.a, {
        limit: 50,
        search: 'Snapshot list',
        readiness: 'needs_price',
      });
      expect(page.items.map((item) => item.variants[0]!.pricePoisha)).toEqual([20000]);
    } finally {
      interleave.mockRestore();
    }
  });

  it('filters inherited and overridden missing prices, ignores archived variants and checks photos', async () => {
    const input = createProductSchema.parse({ name: 'Readiness case' });
    const inherited = await service.create(f.a, input, actor);
    const overridden = await service.create(
      f.a,
      {
        ...input,
        options: [{ name: 'Size', values: ['M', 'L'] }],
        variants: [
          { optionValues: { Size: 'M' }, sku: null, costPoisha: null, priceOverridePoisha: 10000 },
          { optionValues: { Size: 'L' }, sku: null, costPoisha: null, priceOverridePoisha: null },
        ],
      },
      actor,
    );
    const priced = await service.create(
      f.a,
      {
        ...input,
        variants: [{ optionValues: {}, sku: null, costPoisha: null, priceOverridePoisha: 10000 }],
      },
      actor,
    );
    await f.connection.pool.query(
      "insert into product_variants(id,store_id,product_id,title,price_override_poisha,status) values($1,$2,$3,'Old size',null,'archived')",
      [randomUUID(), f.a, priced.id],
    );
    await f.connection.pool.query(
      'update products set image_file_ids=ARRAY[$1::uuid] where id=$2',
      [randomUUID(), priced.id],
    );
    expect(
      (
        await service.list(f.a, { limit: 50, search: 'Readiness case', readiness: 'needs_price' })
      ).items.map((item) => item.id),
    ).toEqual([overridden.id, inherited.id]);
    expect(
      (
        await service.list(f.a, { limit: 50, search: 'Readiness case', readiness: 'needs_photo' })
      ).items.map((item) => item.id),
    ).toEqual([overridden.id, inherited.id]);
  });

  it('computes readiness from effective price, photos, visibility and available stock', async () => {
    const product = await service.create(
      f.a,
      createProductSchema.parse({ name: 'Readiness labels', status: 'hidden' }),
      actor,
    );
    expect(product.readiness).toEqual(['needs_price', 'needs_photo', 'hidden', 'running_low']);
    await f.connection.pool.query('update product_variants set on_hand=5,reserved=1 where id=$1', [
      product.variants[0]!.id,
    ]);
    await f.connection.pool.query(
      'update products set image_file_ids=ARRAY[$1::uuid] where id=$2',
      [randomUUID(), product.id],
    );
    const ready = await service.edit(
      f.a,
      product.id,
      { pricePoisha: 10000, status: 'active' },
      actor,
    );
    expect(ready.readiness).toEqual([]);
    await f.connection.pool.query('update product_variants set on_hand=4 where id=$1', [
      product.variants[0]!.id,
    ]);
    expect((await service.getById(f.a, product.id)).readiness).toEqual(['running_low']);
    expect(
      (await service.edit(f.a, product.id, { isStockTracked: false }, actor)).readiness,
    ).toEqual([]);
  });

  it('lists by cursor with literal name searches and readiness filters', async () => {
    const input = createProductSchema.parse({ name: 'Unique_50%', pricePoisha: 0 });
    const first = await service.create(f.b, input, actor);
    const second = await service.create(f.b, { ...input, status: 'hidden' }, actor);
    const page = await service.list(f.b, { limit: 1, search: '_50%' });
    expect(page.items.map((item) => item.id)).toEqual([second.id]);
    expect(page.nextCursor).toBe(second.id);
    expect(
      (await service.list(f.b, { limit: 1, cursor: page.nextCursor!, search: '_50%' })).items.map(
        (item) => item.id,
      ),
    ).toEqual([first.id]);
    expect(
      (await service.list(f.b, { limit: 50, readiness: 'hidden' })).items.map((item) => item.id),
    ).toEqual([second.id]);
    expect((await service.list(f.a, { limit: 50, search: '_50%' })).items).toEqual([]);
  });

  it('finds archive variants only for the product in the current store on an owner connection', async () => {
    const product = await service.create(
      f.a,
      createProductSchema.parse({ name: 'Archive fixture' }),
      actor,
    );
    const repository = new ProductOrderVariantsRepository(f.tenant);
    await expect(repository.lockArchiveVariants(f.a, product.id)).resolves.toEqual([
      product.variants[0]!.id,
    ]);
    await expect(repository.lockArchiveVariants(f.b, product.id)).resolves.toBeNull();
  });
});
