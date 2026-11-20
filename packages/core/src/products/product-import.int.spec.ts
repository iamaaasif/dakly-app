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
  const context = { duplicateMode: 'update', importId: randomUUID(), actor } as const;

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
