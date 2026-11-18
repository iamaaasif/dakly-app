import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OrdersModule } from './orders.module';
import { OrdersService } from './orders.service';

class TestModule {}
Module({ imports: [DatabaseModule, OrdersModule] })(TestModule);

describe('OrdersService', () => {
  const fixture = new OwnerIsolationFixture();
  const access = { seeFullPhone: true };
  let app: INestApplicationContext;
  let service: OrdersService;

  async function order(storeId: string, number: number, stage: string): Promise<string> {
    const id = randomUUID();
    await fixture.connection.pool.query(
      `insert into orders (id, store_id, number, buyer_name, source, created_by_type,
        recipient_name, recipient_phone, recipient_address, recipient_district, stage, on_hold_reason,
        items_subtotal_poisha, cod_amount_poisha)
       values ($1,$2,$3,'রিনা','manual','user','করিম','01712458903','ধানমন্ডি','Dhaka',$4,case when $4='on_hold' then 'pre_order' end,50000,50000)`,
      [id, storeId, number, stage],
    );
    return id;
  }

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(OrdersService);
    await fixture.setup();
  });
  afterAll(async () => {
    for (const table of [
      'orders',
      'outbox_events',
      'stock_movements',
      'product_variants',
      'products',
    ])
      await fixture.connection.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [fixture.a, fixture.b],
      ]);
    await app.close();
    await fixture.close();
  });

  async function trackedItem(orderId: string, reserved: number): Promise<string> {
    const id = randomUUID();
    const productId = randomUUID();
    await fixture.connection.pool.query(
      "insert into products(id,store_id,name,is_stock_tracked) values($1,$2,'পাঞ্জাবি',true)",
      [productId, fixture.a],
    );
    await fixture.connection.pool.query(
      "insert into product_variants(id,store_id,product_id,title,on_hand,reserved) values($1,$2,$3,'M',1,$4)",
      [id, fixture.a, productId, reserved],
    );
    await fixture.connection.pool.query(
      `insert into order_items(id,store_id,order_id,variant_id,product_name,variant_title,
          quantity,unit_price_poisha,is_stock_tracked)
       values($1,$2,$3,$4,'পাঞ্জাবি','M',1,50000,true)`,
      [randomUUID(), fixture.a, orderId, id],
    );
    return id;
  }

  it('pages one stage and reports totals for all own stages', async () => {
    await order(fixture.a, 1001, 'to_confirm');
    await order(fixture.a, 1002, 'to_pack');
    await order(fixture.a, 1003, 'to_confirm');
    await order(fixture.b, 1004, 'to_confirm');

    const page = await service.list(fixture.a, { stage: 'to_confirm', limit: 1 });
    expect(page.items.map(({ number }) => number)).toEqual([1003]);
    expect(page.counts).toMatchObject({ to_confirm: 2, to_pack: 1, delivered: 0 });
    expect(page.nextCursor).toBe(1003);
    const next = await service.list(fixture.a, {
      stage: 'to_confirm',
      limit: 1,
      cursor: page.nextCursor!,
    });
    expect(next.items.map(({ number }) => number)).toEqual([1001]);
    expect(next.nextCursor).toBeNull();
    expect(await service.list(fixture.a, { stage: 'to_confirm', limit: 1, cursor: 1001 })).toEqual({
      items: [],
      counts: page.counts,
      alerts: page.alerts,
      nextCursor: null,
    });
  });

  it('reads the recipient snapshot separately from the buyer and hides a foreign order', async () => {
    const id = await order(fixture.a, 1005, 'on_hold');
    expect(await service.getById(fixture.a, id, access)).toMatchObject({
      id,
      buyerName: 'রিনা',
      recipientName: 'করিম',
      recipientPhone: '01712458903',
      stage: 'on_hold',
      items: [],
      timeline: [],
    });
    await expect(service.getById(fixture.b, id, access)).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
    });
  });
  it('keeps stock reserved through hold and confirmation and releases it on cancellation', async () => {
    const id = await order(fixture.a, 1006, 'to_confirm');
    const variantId = await trackedItem(id, 1);
    const actor = { kind: 'user', userId: fixture.userA } as const;
    await service.changeStage(
      fixture.a,
      id,
      { to: 'on_hold', reason: 'pre_order' },
      { actor, access },
    );
    await service.changeStage(fixture.a, id, { to: 'to_confirm' }, { actor, access });
    const confirmed = await service.changeStage(
      fixture.a,
      id,
      { to: 'to_pack' },
      { actor, access },
    );
    expect(confirmed).toMatchObject({ stage: 'to_pack', items: [{ variantId }] });
    expect(await fixture.row('product_variants', variantId)).toMatchObject({ reserved: 1 });
    await expect(
      service.changeStage(fixture.a, id, { to: 'to_confirm' }, { actor, access }),
    ).rejects.toMatchObject({ code: 'ORDER_STAGE_NOT_ALLOWED' });
    const cancelled = await service.changeStage(
      fixture.a,
      id,
      { to: 'cancelled', reason: 'duplicate' },
      { actor, access },
    );
    expect(cancelled).toMatchObject({
      stage: 'cancelled',
      timeline: [
        { from: 'to_confirm', to: 'on_hold', reason: 'pre_order', actorUserId: actor.userId },
        { from: 'on_hold', to: 'to_confirm' },
        { from: 'to_confirm', to: 'to_pack' },
        { from: 'to_pack', to: 'cancelled', reason: 'duplicate' },
      ],
    });
    expect(await fixture.row('product_variants', variantId)).toMatchObject({
      reserved: 0,
      on_hand: 1,
    });
    const events = await fixture.connection.pool.query(
      "select type from outbox_events where store_id=$1 and payload->>'orderId'=$2 order by id",
      [fixture.a, id],
    );
    expect(events.rows.map(({ type }) => type)).toEqual([
      'order.stage_changed',
      'order.stage_changed',
      'order.stage_changed',
      'order.confirmed',
      'order.stage_changed',
    ]);
  });

  it('keeps the stage timeline in transition order when the clock moves backwards', async () => {
    const id = await order(fixture.a, 1009, 'to_confirm');
    const editor = { access, actor: { kind: 'user', userId: fixture.userA } } as const;
    const now = vi.spyOn(Clock.prototype, 'now').mockReturnValue(new Date('2026-11-18T06:00:00Z'));
    try {
      await service.changeStage(fixture.a, id, { to: 'on_hold', reason: 'pre_order' }, editor);
      now.mockReturnValue(new Date('2026-11-18T05:59:59Z'));
      const updated = await service.changeStage(fixture.a, id, { to: 'to_pack' }, editor);
      expect(updated.timeline.map(({ to }) => to)).toEqual(['on_hold', 'to_pack']);
    } finally {
      now.mockRestore();
    }
  });

  it('orders stage history by when each audit was written rather than when the transaction began', async () => {
    const id = await order(fixture.a, 1011, 'to_confirm');
    const editor = { access, actor: { kind: 'user', userId: fixture.userA } } as const;
    const started = Promise.withResolvers<void>();
    const proceed = Promise.withResolvers<void>();
    const second = app.get(StoreTransaction).run(fixture.a, async () => {
      started.resolve();
      await proceed.promise;
      return service.changeStage(fixture.a, id, { to: 'to_pack' }, editor);
    });

    await started.promise;
    try {
      await service.changeStage(fixture.a, id, { to: 'on_hold', reason: 'pre_order' }, editor);
    } finally {
      proceed.resolve();
    }
    expect((await second).timeline.map(({ to }) => to)).toEqual(['on_hold', 'to_pack']);
  });

  it('releases a reservation once when two staff members cancel together', async () => {
    const id = await order(fixture.a, 1010, 'to_confirm');
    const variantId = await trackedItem(id, 1);
    const cancel = () =>
      service.changeStage(
        fixture.a,
        id,
        { to: 'cancelled', reason: 'duplicate' },
        { actor: { kind: 'user', userId: fixture.userA }, access },
      );
    const results = await Promise.allSettled([cancel(), cancel()]);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'fulfilled',
          value: expect.objectContaining({ stage: 'cancelled' }),
        }),
        expect.objectContaining({
          status: 'rejected',
          reason: expect.objectContaining({ code: 'ORDER_STAGE_NOT_ALLOWED' }),
        }),
      ]),
    );
    expect(await fixture.row('product_variants', variantId)).toMatchObject({
      reserved: 0,
      on_hand: 1,
    });
  });

  it('releases the order reservation if tracking was turned off after the order', async () => {
    const id = await order(fixture.a, 1008, 'to_confirm');
    const variantId = await trackedItem(id, 1);
    await fixture.connection.pool.query(
      `update products set is_stock_tracked=false
       where id=(select product_id from product_variants where id=$1)`,
      [variantId],
    );

    await service.changeStage(
      fixture.a,
      id,
      { to: 'cancelled', reason: 'duplicate' },
      {
        actor: { kind: 'user', userId: fixture.userA },
        access,
      },
    );

    expect(await fixture.row('product_variants', variantId)).toMatchObject({
      reserved: 0,
      on_hand: 1,
    });
  });

  it('rolls back earlier stock releases when a later line cannot release', async () => {
    const id = await order(fixture.a, 1007, 'to_confirm');
    const variants = [await trackedItem(id, 1), await trackedItem(id, 1)].sort();
    await fixture.connection.pool.query('update product_variants set reserved=0 where id=$1', [
      variants[1],
    ]);
    await expect(
      service.changeStage(
        fixture.a,
        id,
        { to: 'cancelled', reason: 'duplicate' },
        { actor: { kind: 'user', userId: fixture.userA }, access },
      ),
    ).rejects.toMatchObject({ code: 'STOCK_NOT_AVAILABLE' });
    expect(await fixture.row('product_variants', variants[0]!)).toMatchObject({ reserved: 1 });
    expect(await service.getById(fixture.a, id, access)).toMatchObject({
      stage: 'to_confirm',
      timeline: [],
    });
  });

  it('groups held and partly delivered orders into their pipeline tabs and counts only this store', async () => {
    const previous = (await service.list(fixture.a, { limit: 20 })).counts;
    const held = await order(fixture.a, 1100, 'on_hold');
    const delivered = await order(fixture.a, 1101, 'delivered');
    const partial = await order(fixture.a, 1102, 'partially_delivered');
    await order(fixture.b, 1100, 'on_hold');
    await order(fixture.b, 1102, 'partially_delivered');
    const confirm = await service.list(fixture.a, { stage: 'to_confirm', limit: 20 });
    expect(confirm.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: held, stage: 'on_hold', totalPoisha: 50000 }),
      ]),
    );
    const complete = await service.list(fixture.a, { stage: 'delivered', limit: 20 });
    expect(complete.items.map(({ id }) => id)).toEqual([partial, delivered]);
    expect(complete.counts).toMatchObject({
      delivered: previous.delivered + 2,
      partially_delivered: previous.partially_delivered + 1,
      on_hold: previous.on_hold + 1,
    });
    expect(confirm.counts.to_confirm).toBe(previous.to_confirm + 1);
    expect(confirm.items).toHaveLength(confirm.counts.to_confirm);
  });
});
