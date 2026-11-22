import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createProductSchema } from '@dakly/contracts/products';
import { createDatabase } from '@dakly/db/client';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { StoreTransaction } from '../platform/database/store-transaction';
import { TenantDatabase } from '../platform/database/tenant-database';
import { OutboxRepository } from '../platform/outbox/outbox.repository';
import { OutboxService } from '../platform/outbox/outbox.service';
import type { StoresService } from '../stores/stores.service';
import { ProductImportService, type ImportProduct } from './product-import.service';
import { ProductOrderVariantsRepository } from './product-order-variants.repository';
import { ProductStockRepository } from './product-stock.repository';
import { ProductStockService } from './product-stock.service';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

const actor = { kind: 'system' } as const;
const now = new Date('2026-11-17T08:00:00Z');

function variant(sku: string | null, rest: Partial<ImportProduct['variants'][number]> = {}) {
  return {
    rowNumber: 2,
    sku,
    optionValues: {},
    priceOverridePoisha: null,
    costPoisha: null,
    onHand: undefined,
    ...rest,
  };
}

function product(variants: ImportProduct['variants'], name = 'পাঞ্জাবি'): ImportProduct {
  return {
    name,
    category: null,
    description: null,
    status: 'active',
    pricePoisha: 100000,
    options: [],
    variants,
  };
}

describe('ProductImportService with Postgres', () => {
  const f = new OwnerIsolationFixture();
  const app = createDatabase(process.env.DATABASE_URL!);
  const tenant = new TenantDatabase(app.db);
  const transaction = new StoreTransaction(tenant);
  const outbox = new OutboxService(new OutboxRepository(app.db, tenant), transaction);
  const clock = { now: () => now };
  const repository = new ProductsRepository(tenant);
  const products = new ProductsService(
    repository,
    new ProductOrderVariantsRepository(tenant),
    transaction,
    outbox,
    clock,
    {
      settings: async () => ({ stock: { lowStockThreshold: 3 } }),
    } as unknown as StoresService,
    {} as FileStorageDriver,
  );
  const stock = new ProductStockService(
    new ProductStockRepository(tenant),
    transaction,
    clock,
    outbox,
  );
  const importer = new ProductImportService(
    repository,
    products,
    stock,
    transaction,
    outbox,
    clock,
  );
  const context = {
    duplicateMode: 'update',
    importId: randomUUID(),
    actor,
    tracksStock: true,
  } as const;

  beforeAll(() => f.setup());
  afterAll(async () => {
    for (const table of ['outbox_events', 'stock_movements', 'product_variants', 'products'])
      await f.connection.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [f.a, f.b],
      ]);
    await app.pool.end();
    await f.close();
  });

  async function stored(storeId: string, sku: string) {
    return (
      await f.connection.pool.query(
        'select id,on_hand,cost_poisha::int,price_override_poisha::int from product_variants where store_id=$1 and sku=$2',
        [storeId, sku],
      )
    ).rows[0];
  }
  async function movements(variantId: string) {
    return (
      await f.connection.pool.query(
        'select kind,quantity,reason from stock_movements where variant_id=$1 order by id',
        [variantId],
      )
    ).rows;
  }

  it('adds a product with its sizes, prices and opening stock', async () => {
    const result = await importer.importBatch(
      f.a,
      [
        {
          ...product([
            variant('ADD-M', {
              rowNumber: 2,
              optionValues: { Size: 'M' },
              onHand: 4,
              costPoisha: 60000,
            }),
            variant('ADD-L', {
              rowNumber: 3,
              optionValues: { Size: 'L' },
              priceOverridePoisha: 120000,
            }),
          ]),
          options: [{ name: 'Size', values: ['M', 'L'] }],
        },
      ],
      context,
    );
    expect(result).toEqual([
      { rowNumber: 2, outcome: 'added' },
      { rowNumber: 3, outcome: 'added' },
    ]);
    const medium = await stored(f.a, 'ADD-M');
    expect(medium).toMatchObject({ on_hand: 4, cost_poisha: 60000 });
    expect(await movements(medium.id)).toEqual([
      { kind: 'import', quantity: 4, reason: `Product import ${context.importId}` },
    ]);
    expect(await stored(f.a, 'ADD-L')).toMatchObject({ on_hand: 0, price_override_poisha: 120000 });
  });

  it('updates a matching sku once and leaves a repeated count without a second movement', async () => {
    await importer.importBatch(f.a, [product([variant('UPD-1', { onHand: 5 })])], context);
    const batch = [product([variant('UPD-1', { onHand: 8, costPoisha: 70000 })])];
    expect(await importer.importBatch(f.a, batch, context)).toEqual([
      { rowNumber: 2, outcome: 'updated' },
    ]);
    await importer.importBatch(f.a, batch, context);
    const row = await stored(f.a, 'UPD-1');
    expect(row).toMatchObject({ on_hand: 8, cost_poisha: 70000 });
    expect((await movements(row.id)).map(({ quantity }) => quantity)).toEqual([5, 3]);
  });

  it('skips a matching sku in skip mode and leaves its stock and prices', async () => {
    await importer.importBatch(f.a, [product([variant('SKP-1', { onHand: 2 })])], context);
    const result = await importer.importBatch(
      f.a,
      [product([variant('SKP-1', { onHand: 9, costPoisha: 1 })])],
      { ...context, duplicateMode: 'skip' },
    );
    expect(result).toEqual([{ rowNumber: 2, outcome: 'skipped' }]);
    expect(await stored(f.a, 'SKP-1')).toMatchObject({ on_hand: 2, cost_poisha: null });
  });

  it('ignores the on-hand count of a product that does not track stock', async () => {
    const untracked = await products.create(
      f.a,
      createProductSchema.parse({
        name: 'সেবা',
        isStockTracked: false,
        variants: [{ sku: 'UNT-1' }],
      }),
      actor,
    );
    expect(untracked.isStockTracked).toBe(false);
    const result = await importer.importBatch(
      f.a,
      [product([variant('UNT-1', { onHand: 9 })])],
      context,
    );
    expect(result).toEqual([{ rowNumber: 2, outcome: 'updated' }]);
    const row = await stored(f.a, 'UNT-1');
    expect(row.on_hand).toBe(0);
    expect(await movements(row.id)).toEqual([]);
  });

  it('tracks stock on new products only when the file has an on-hand column', async () => {
    await importer.importBatch(f.a, [product([variant('TRK-1')], 'With counts')], context);
    await importer.importBatch(f.a, [product([variant('TRK-2')], 'Without counts')], {
      ...context,
      tracksStock: false,
    });
    const tracked = async (name: string) =>
      (await f.connection.pool.query('select is_stock_tracked from products where name=$1', [name]))
        .rows[0].is_stock_tracked;
    expect(await tracked('With counts')).toBe(true);
    expect(await tracked('Without counts')).toBe(false);
  });

  it('writes the file price to the matched product in update mode and keeps it when blank', async () => {
    await importer.importBatch(f.a, [product([variant('PRC-1')], 'Priced')], context);
    const price = async () =>
      (
        await f.connection.pool.query(
          "select price_poisha::int as price from products where name='Priced'",
        )
      ).rows[0].price;
    await importer.importBatch(
      f.a,
      [{ ...product([variant('PRC-1')], 'Priced'), pricePoisha: 150000 }],
      context,
    );
    expect(await price()).toBe(150000);
    await importer.importBatch(
      f.a,
      [{ ...product([variant('PRC-1')], 'Priced'), pricePoisha: 0 }],
      context,
    );
    expect(await price()).toBe(150000);
    await importer.importBatch(
      f.a,
      [{ ...product([variant('PRC-1')], 'Priced'), pricePoisha: 99 }],
      {
        ...context,
        duplicateMode: 'skip',
      },
    );
    expect(await price()).toBe(150000);
  });

  it('applies the file fields to a matched product and keeps them when blank', async () => {
    await importer.importBatch(
      f.a,
      [{ ...product([variant('FLD-1')], 'Fields'), category: 'Men', description: 'Old' }],
      context,
    );
    const fields = async () =>
      (
        await f.connection.pool.query(
          "select category, description, status from products where name='Fields'",
        )
      ).rows[0];
    await importer.importBatch(
      f.a,
      [{ ...product([variant('FLD-1')], 'Fields'), status: 'hidden', category: 'Kurti' }],
      context,
    );
    expect(await fields()).toEqual({ category: 'Kurti', description: 'Old', status: 'hidden' });
    await importer.importBatch(
      f.a,
      [{ ...product([variant('FLD-1')], 'Fields'), status: undefined }],
      context,
    );
    expect(await fields()).toEqual({ category: 'Kurti', description: 'Old', status: 'hidden' });
  });

  it('keeps the variant when the file renames its option', async () => {
    await importer.importBatch(
      f.a,
      [
        {
          ...product([variant('OPT-1', { optionValues: { Size: 'M' } })], 'Renamed'),
          options: [{ name: 'Size', values: ['M'] }],
        },
      ],
      context,
    );
    const before = await stored(f.a, 'OPT-1');
    const result = await importer.importBatch(
      f.a,
      [
        {
          ...product([variant('OPT-1', { optionValues: { Size: 'Medium' } })], 'Renamed'),
          options: [{ name: 'Size', values: ['Medium'] }],
        },
      ],
      context,
    );
    expect(result).toEqual([{ rowNumber: 2, outcome: 'updated' }]);
    expect((await stored(f.a, 'OPT-1')).id).toBe(before.id);
    expect(
      (
        await f.connection.pool.query(
          "select count(*)::int as n from product_variants where product_id=(select id from products where name='Renamed')",
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it('reports rows whose skus belong to different products', async () => {
    await importer.importBatch(f.a, [product([variant('TWO-A')], 'First')], context);
    await importer.importBatch(f.a, [product([variant('TWO-B')], 'Second')], context);
    const result = await importer.importBatch(
      f.a,
      [product([variant('TWO-A', { rowNumber: 2 }), variant('TWO-B', { rowNumber: 3 })], 'Mixed')],
      context,
    );
    expect(result).toEqual([
      { rowNumber: 2, outcome: 'updated' },
      { rowNumber: 3, outcome: 'failed', message: 'These SKUs belong to different products' },
    ]);
  });

  it('reports a new size of an existing product instead of guessing', async () => {
    await importer.importBatch(f.a, [product([variant('MIX-1')], 'Mix')], context);
    const result = await importer.importBatch(
      f.a,
      [product([variant('MIX-1', { rowNumber: 2 }), variant('MIX-2', { rowNumber: 3 })], 'Mix')],
      context,
    );
    expect(result).toEqual([
      { rowNumber: 2, outcome: 'updated' },
      expect.objectContaining({ rowNumber: 3, outcome: 'failed' }),
    ]);
    expect(await stored(f.a, 'MIX-2')).toBeUndefined();
  });

  it('matches a sku only inside its own shop', async () => {
    await importer.importBatch(f.b, [product([variant('SHARED-1', { onHand: 7 })])], context);
    const result = await importer.importBatch(
      f.a,
      [product([variant('SHARED-1', { onHand: 1 })])],
      context,
    );
    expect(result).toEqual([{ rowNumber: 2, outcome: 'added' }]);
    expect(await stored(f.b, 'SHARED-1')).toMatchObject({ on_hand: 7 });
    expect(await stored(f.a, 'SHARED-1')).toMatchObject({ on_hand: 1 });
  });
});
