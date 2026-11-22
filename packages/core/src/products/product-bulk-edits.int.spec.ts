import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { StoreTransaction } from '../platform/database/store-transaction';
import { TenantDatabase } from '../platform/database/tenant-database';
import { OutboxRepository } from '../platform/outbox/outbox.repository';
import { OutboxService } from '../platform/outbox/outbox.service';
import { ProductBulkEditsRepository } from './product-bulk-edits.repository';
import { ProductBulkEditsService } from './product-bulk-edits.service';
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
  const service = new ProductBulkEditsService(
    new ProductBulkEditsRepository(tenant),
    new ProductStockService(new ProductStockRepository(tenant), transaction, clock, outbox),
    transaction,
    outbox,
    clock,
  );
  const actor = { kind: 'user', userId: randomUUID() } as const;
  beforeAll(async () => {
    await f.setup();
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
      "insert into products(id,store_id,name,price_poisha,category) values($1,$2,'Cotton T-shirt',120000,'Clothing')",
      [id, f.a],
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
      `select p.price_poisha::int as price, p.category, p.status, v.cost_poisha::int as cost, v.on_hand
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
        rows: [{ productId: id, pricePoisha: 150000, category: 'Shirts', stock: 30 }],
        stockReason: 'Recount',
      },
      actor,
    );
    await f.connection.pool.query("update products set category='Tops' where id=$1", [id]);

    expect(await service.undo(f.a, edit.id, actor)).toEqual({ restored: 2, skipped: 1 });
    expect(await read(id)).toMatchObject({ price: 120000, category: 'Tops', on_hand: 40 });
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

  it('does not touch another store', async () => {
    const id = await product();
    await expect(
      service.apply(f.b, { rows: [{ productId: id, pricePoisha: 1 }] }, actor),
    ).rejects.toMatchObject({ code: 'PRODUCT_BULK_EDIT_ROW_INVALID' });
  });
});
