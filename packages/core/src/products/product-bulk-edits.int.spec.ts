import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { StoreTransaction } from '../platform/database/store-transaction';
import { TenantDatabase } from '../platform/database/tenant-database';
import { OutboxRepository } from '../platform/outbox/outbox.repository';
import { OutboxService } from '../platform/outbox/outbox.service';
import { ProductBrandsRepository } from './product-brands.repository';
import { ProductBrandsService } from './product-brands.service';
import { ProductBulkEditsRepository } from './product-bulk-edits.repository';
import { ProductBulkEditsService } from './product-bulk-edits.service';
import { ProductCategoriesRepository } from './product-categories.repository';
import { ProductCategoriesService } from './product-categories.service';
import { ProductStockRepository } from './product-stock.repository';
import { ProductStockService } from './product-stock.service';

describe('ProductBulkEditsService', () => {
  const f = new OwnerIsolationFixture();
  const app = createDatabase(process.env.DATABASE_URL!);
  const tenant = new TenantDatabase(app.db);
  const transaction = new StoreTransaction(tenant);
  const outbox = new OutboxService(new OutboxRepository(app.db, tenant), transaction);
  let now = new Date('2026-11-22T08:00:00Z');
  const clock = { now: () => now };
  const categories = new ProductCategoriesService(
    new ProductCategoriesRepository(tenant),
    transaction,
  );
  const brands = new ProductBrandsService(new ProductBrandsRepository(tenant), transaction);
  const service = new ProductBulkEditsService(
    new ProductBulkEditsRepository(tenant),
    new ProductStockService(new ProductStockRepository(tenant), transaction, clock, outbox),
    transaction,
    outbox,
    clock,
    categories,
    brands,
  );
  const actor = { kind: 'user', userId: randomUUID() } as const;
  let ids: { clothing: string; shirts: string; tops: string; aarong: string };
  beforeAll(async () => {
    await f.setup();
    const clothing = await categories.create(f.a, { name: 'Clothing', parentId: null });
    const shirts = await categories.create(f.a, { name: 'Shirts', parentId: null });
    const tops = await categories.create(f.a, { name: 'Tops', parentId: null });
    const aarong = await brands.create(f.a, { name: 'Aarong' });
    ids = { clothing: clothing.id, shirts: shirts.id, tops: tops.id, aarong: aarong.id };
    await f.connection.pool.query(
      "insert into users(id,email,password_hash,name) values($1,$2,'x','Owner') on conflict do nothing",
      [actor.userId, `${actor.userId}@example.com`],
    );
  });
  afterAll(async () => {
    for (const table of [
      'outbox_events',
      'product_bulk_edits',
      'stock_movements',
      'product_variants',
      'products',
      'product_categories',
      'product_brands',
    ])
      await f.connection.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [f.a, f.b],
      ]);
    await f.connection.pool.query('delete from users where id=$1', [actor.userId]);
    await app.pool.end();
    await f.close();
  });

  async function product(variants = 1) {
    const id = randomUUID();
    await f.connection.pool.query(
      "insert into products(id,store_id,name,price_poisha,category_id) values($1,$2,'Cotton T-shirt',120000,$3)",
      [id, f.a, ids.clothing],
    );
    for (let index = 0; index < variants; index += 1)
      await f.connection.pool.query(
        "insert into product_variants(id,store_id,product_id,title,cost_poisha,on_hand,is_default,position) values($1,$2,$3,'Default',65000,40,$4,$5)",
        [randomUUID(), f.a, id, index === 0, index],
      );
    return id;
  }
  async function read(id: string) {
    const { rows } = await f.connection.pool.query(
      `select p.price_poisha::int as price, (select name from product_categories where id = p.category_id) as category, p.status, p.version, v.cost_poisha::int as cost, v.on_hand
       from products p join product_variants v on v.product_id = p.id where p.id = $1`,
      [id],
    );
    return rows[0];
  }

  it('changes only the values sent and writes a stock movement with the reason', async () => {
    const id = await product();
    const result = await service.apply(
      f.a,
      { rows: [{ productId: id, pricePoisha: 125000, stock: 45 }], stockReason: 'Restock' },
      actor,
    );
    expect(result).toMatchObject({ changedProducts: 1, changedValues: 2 });
    expect(await read(id)).toMatchObject({
      price: 125000,
      version: 2,
      category: 'Clothing',
      cost: 65000,
      on_hand: 45,
    });
    const { rows } = await f.connection.pool.query(
      'select kind, quantity, reason from stock_movements where store_id=$1 and reason=$2',
      [f.a, 'Restock'],
    );
    expect(rows).toEqual([{ kind: 'adjust', quantity: 5, reason: 'Restock' }]);
  });

  it('undoes the edit, leaves a value changed since, and corrects stock with a new movement', async () => {
    const id = await product();
    const edit = await service.apply(
      f.a,
      {
        rows: [
          {
            productId: id,
            pricePoisha: 150000,
            categoryId: ids.shirts,
            brandId: ids.aarong,
            stock: 30,
          },
        ],
        stockReason: 'Recount',
      },
      actor,
    );
    expect(await read(id)).toMatchObject({ version: 2 });
    await f.connection.pool.query('update products set category_id=$2 where id=$1', [id, ids.tops]);

    expect(await service.undo(f.a, edit.id, actor)).toEqual({ restored: 3, skipped: 1 });
    expect(await read(id)).toMatchObject({
      price: 120000,
      category: 'Tops',
      on_hand: 40,
      version: 4,
    });
    expect(
      (await f.connection.pool.query('select brand_id from products where id=$1', [id])).rows[0],
    ).toEqual({
      brand_id: null,
    });
    const { rows } = await f.connection.pool.query(
      "select quantity from stock_movements where store_id=$1 and reason like 'Undo of bulk edit%' ",
      [f.a],
    );
    expect(rows).toContainEqual({ quantity: 10 });
    await expect(service.undo(f.a, edit.id, actor)).rejects.toMatchObject({
      code: 'PRODUCT_BULK_EDIT_ALREADY_UNDONE',
    });
  });

  it('refuses an undo after 24 hours', async () => {
    const id = await product();
    const edit = await service.apply(f.a, { rows: [{ productId: id, status: 'hidden' }] }, actor);
    now = new Date(now.getTime() + 24 * 3_600_000 + 1000);
    await expect(service.undo(f.a, edit.id, actor)).rejects.toMatchObject({
      code: 'PRODUCT_BULK_EDIT_UNDO_EXPIRED',
    });
    now = new Date('2026-11-22T08:00:00Z');
  });

  it('rejects cost or stock for a product with several sizes, and an edit that changes nothing', async () => {
    const id = await product(2);
    await expect(
      service.apply(f.a, { rows: [{ productId: id, costPoisha: 70000 }] }, actor),
    ).rejects.toMatchObject({ code: 'PRODUCT_BULK_EDIT_ROW_INVALID' });
    await expect(
      service.apply(f.a, { rows: [{ productId: id, pricePoisha: 120000 }] }, actor),
    ).rejects.toMatchObject({ code: 'PRODUCT_BULK_EDIT_NO_CHANGE' });
  });

  it('rejects a price when a size has its own price', async () => {
    const id = await product(2);
    await f.connection.pool.query(
      'update product_variants set price_override_poisha = 99000 where product_id = $1 and position = 1',
      [id],
    );
    await expect(
      service.apply(f.a, { rows: [{ productId: id, pricePoisha: 130000 }] }, actor),
    ).rejects.toMatchObject({ code: 'PRODUCT_BULK_EDIT_ROW_INVALID' });
    await expect(
      service.apply(f.a, { rows: [{ productId: id, categoryId: ids.shirts }] }, actor),
    ).resolves.toMatchObject({ changedValues: 1 });
  });

  it('refuses a category from another store', async () => {
    const foreign = await categories.create(f.b, { name: 'Foreign', parentId: null });
    const id = await product();
    await expect(
      service.apply(f.a, { rows: [{ productId: id, categoryId: foreign.id }] }, actor),
    ).rejects.toMatchObject({ code: 'PRODUCT_CATEGORY_NOT_FOUND' });
  });

  it('does not touch another store', async () => {
    const id = await product();
    await expect(
      service.apply(f.b, { rows: [{ productId: id, pricePoisha: 1 }] }, actor),
    ).rejects.toMatchObject({ code: 'PRODUCT_BULK_EDIT_ROW_INVALID' });
  });
});
