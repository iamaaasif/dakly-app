import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { StoreTransaction } from '../platform/database/store-transaction';
import { TenantDatabase } from '../platform/database/tenant-database';
import { OutboxRepository } from '../platform/outbox/outbox.repository';
import { OutboxService } from '../platform/outbox/outbox.service';
import { StoresService } from '../stores/stores.service';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

const reference = { actor: { kind: 'system' }, reason: 'Stock test' } as const;
const now = new Date('2026-11-17T08:00:00Z');

describe('ProductsService stock ledger', () => {
  const f = new OwnerIsolationFixture();
  const app = createDatabase(process.env.DATABASE_URL!);
  const tenant = new TenantDatabase(app.db);
  const transaction = new StoreTransaction(tenant);
  const repository = new ProductsRepository(tenant);
  const service = new ProductsService(
    repository,
    transaction,
    new OutboxService(new OutboxRepository(app.db, tenant), transaction),
    { now: () => now },
    {} as StoresService,
    {} as FileStorageDriver,
  );
  beforeAll(() => f.setup());
  afterAll(async () => {
    for (const table of ['outbox_events', 'stock_movements', 'product_variants', 'products'])
      await f.connection.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [f.a, f.b],
      ]);
    await app.pool.end();
    await f.close();
  });
  async function variant(onHand: number, reserved = 0, isStockTracked = true) {
    const productId = randomUUID(),
      id = randomUUID();
    await f.connection.pool.query(
      "insert into products(id,store_id,name,is_stock_tracked) values($1,$2,'পাঞ্জাবি',$3)",
      [productId, f.a, isStockTracked],
    );
    await f.connection.pool.query(
      "insert into product_variants(id,store_id,product_id,title,on_hand,reserved,is_default) values($1,$2,$3,'Default',$4,$5,true)",
      [id, f.a, productId, onHand, reserved],
    );
    return id;
  }
  async function movements(id: string) {
    return (
      await f.connection.pool.query(
        'select kind,quantity,on_hand_after,reserved_after from stock_movements where variant_id=$1 order by id',
        [id],
      )
    ).rows;
  }

  it('allows exactly one of two concurrent reserves for the last unit', async () => {
    const id = await variant(1);
    const results = await Promise.allSettled([
      service.moveStock(f.a, id, { kind: 'reserve', quantity: 1, reference }),
      service.moveStock(f.a, id, { kind: 'reserve', quantity: 1, reference }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'STOCK_NOT_AVAILABLE' },
    });
    expect(await f.row('product_variants', id)).toMatchObject({ on_hand: 1, reserved: 1 });
    expect(await movements(id)).toEqual([
      { kind: 'reserve', quantity: 1, on_hand_after: 1, reserved_after: 1 },
    ]);
  });

  it('records reserve, release, ship, return, adjust and import with signed on-hand changes', async () => {
    const id = await variant(10);
    for (const [kind, quantity] of [
      ['reserve', 4],
      ['release', 1],
      ['ship', 2],
      ['return', 2],
      ['adjust', -3],
      ['import', 5],
    ] as const)
      await service.moveStock(f.a, id, { kind, quantity, reference });
    expect(await movements(id)).toEqual([
      { kind: 'reserve', quantity: 4, on_hand_after: 10, reserved_after: 4 },
      { kind: 'release', quantity: 1, on_hand_after: 10, reserved_after: 3 },
      { kind: 'ship', quantity: -2, on_hand_after: 8, reserved_after: 1 },
      { kind: 'return', quantity: 2, on_hand_after: 10, reserved_after: 1 },
      { kind: 'adjust', quantity: -3, on_hand_after: 7, reserved_after: 1 },
      { kind: 'import', quantity: 5, on_hand_after: 12, reserved_after: 1 },
    ]);
  });

  it('rejects adjustments below reserved and release or ship beyond the reservation', async () => {
    const id = await variant(3, 2);
    for (const [kind, quantity] of [
      ['adjust', -2],
      ['release', 3],
      ['ship', 3],
    ] as const)
      await expect(service.moveStock(f.a, id, { kind, quantity, reference })).rejects.toMatchObject(
        {
          code: 'STOCK_NOT_AVAILABLE',
        },
      );
    expect(await f.row('product_variants', id)).toMatchObject({ on_hand: 3, reserved: 2 });
    expect(await movements(id)).toEqual([]);
  });

  it('rejects zero or negative reserve quantities and counter overflow', async () => {
    const id = await variant(2147483647);
    for (const quantity of [0, -1])
      await expect(
        service.moveStock(f.a, id, { kind: 'reserve', quantity, reference }),
      ).rejects.toMatchObject({ code: 'STOCK_QUANTITY_INVALID' });
    await expect(
      service.moveStock(f.a, id, { kind: 'adjust', quantity: 1, reference }),
    ).rejects.toMatchObject({
      code: 'STOCK_NOT_AVAILABLE',
    });
    expect(await movements(id)).toEqual([]);
  });

  it('skips all movements when tracking is off', async () => {
    const id = await variant(0, 0, false);
    for (const kind of ['reserve', 'release', 'ship', 'return', 'adjust', 'import'] as const)
      await service.moveStock(f.a, id, { kind, quantity: 5, reference });
    expect(await f.row('product_variants', id)).toMatchObject({ on_hand: 0, reserved: 0 });
    expect(await movements(id)).toEqual([]);
  });

  it('rolls back stock when writing the ledger fails', async () => {
    const id = await variant(1);
    await expect(
      service.moveStock(f.a, id, {
        kind: 'reserve',
        quantity: 1,
        reference: {
          actor: { kind: 'user', userId: randomUUID() },
          reason: 'Invalid fixture actor',
        },
      }),
    ).rejects.toThrow();
    expect(await f.row('product_variants', id)).toMatchObject({ on_hand: 1, reserved: 0 });
    expect(await movements(id)).toEqual([]);
  });

  it('publishes a restock only when availability crosses zero and keeps events with the movement', async () => {
    const id = await variant(0);
    await service.moveStock(f.a, id, { kind: 'adjust', quantity: 2, reference });
    await service.moveStock(f.a, id, { kind: 'adjust', quantity: 1, reference });
    const events = await f.connection.pool.query(
      "select type,payload from outbox_events where store_id=$1 and payload->>'variantId'=$2 order by id",
      [f.a, id],
    );
    expect(events.rows).toEqual([
      { type: 'stock.changed', payload: { variantId: id, kind: 'adjust' } },
      { type: 'variant.restocked', payload: { variantId: id } },
      { type: 'stock.changed', payload: { variantId: id, kind: 'adjust' } },
    ]);
  });

  it('hides foreign variants and preserves their stock', async () => {
    const id = await variant(1);
    await expect(
      service.moveStock(f.b, id, { kind: 'reserve', quantity: 1, reference }),
    ).rejects.toMatchObject({
      code: 'PRODUCT_VARIANT_NOT_FOUND',
    });
    const owner = new ProductsRepository(f.tenant);
    expect(await owner.findStockVariant(f.b, id)).toBeUndefined();
    expect(
      await owner.changeStock(f.b, id, { onHandDelta: 1, reservedDelta: 0 }, now),
    ).toBeUndefined();
    expect(await f.row('product_variants', id)).toMatchObject({ on_hand: 1, reserved: 0 });
    expect(await movements(id)).toEqual([]);
  });
});
