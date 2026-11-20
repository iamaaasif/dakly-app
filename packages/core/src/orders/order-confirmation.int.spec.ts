import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createOrderSchema, type CreateOrderInput } from '@dakly/contracts/orders';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { DeliveryModule } from '../delivery/delivery.module';
import { DeliveryService } from '../delivery/delivery.service';
import { DatabaseModule } from '../platform/database/database.module';
import { OrderConfirmationService } from './order-confirmation.service';
import { OrdersModule } from './orders.module';
import { OrdersService } from './orders.service';

class TestModule {}
Module({ imports: [DatabaseModule, DeliveryModule, OrdersModule] })(TestModule);

describe('order confirmation links (Postgres)', () => {
  const f = new OwnerIsolationFixture();
  let app: INestApplicationContext;
  let orders: OrdersService;
  let service: OrderConfirmationService;
  const staff = { kind: 'user', userId: f.userA } as const;
  const ip = '203.0.113.7';

  beforeAll(async () => {
    await f.setup();
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    orders = app.get(OrdersService);
    service = app.get(OrderConfirmationService);
    await f.connection.pool.query('insert into store_counters (store_id) values ($1)', [f.a]);
    await app.get(DeliveryService).initializeDefaults(f.a, staff);
  });
  afterAll(async () => {
    for (const table of [
      'order_confirmations',
      'orders',
      'outbox_events',
      'stock_movements',
      'contacts',
      'product_variants',
      'products',
      'delivery_zones',
      'store_counters',
    ])
      await f.connection.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [f.a, f.b],
      ]);
    await app.close();
    await f.close();
  });

  async function order(change: Partial<CreateOrderInput> = {}) {
    const productId = randomUUID();
    const variantId = randomUUID();
    await f.connection.pool.query(
      "insert into products(id,store_id,name,is_stock_tracked,price_poisha) values ($1,$2,'Panjabi',true,125000)",
      [productId, f.a],
    );
    await f.connection.pool.query(
      "insert into product_variants(id,store_id,product_id,title,on_hand) values ($1,$2,$3,'M',5)",
      [variantId, f.a, productId],
    );
    const input = createOrderSchema.parse({
      buyer: { name: 'Rahim' },
      recipient: { name: 'Rahim', phone: '01712458903', address: '<b>Dhanmondi</b>', areaId: 301 },
      items: [{ variantId, quantity: 2 }],
      ...change,
    });
    return orders.createOrder(f.a, input, {
      actor: staff,
      access: { seeFullPhone: true },
      idempotencyKey: randomUUID(),
    });
  }
  const tokenOf = (url: string) => url.split('/c/')[1] ?? '';
  const link = async (orderId: string) => tokenOf(await service.issueUrl(f.a, orderId));
  const stored = async (orderId: string) =>
    (await f.connection.pool.query('select * from orders where id=$1', [orderId])).rows[0];

  it('gives each message its own long token and keeps only the sha256 of every one', async () => {
    const { id } = await order();
    const urls = await Promise.all([service.issueUrl(f.a, id), service.issueUrl(f.a, id)]);
    const rows = await f.connection.pool.query(
      'select token_hash from order_confirmations where order_id=$1',
      [id],
    );
    expect(rows.rows).toHaveLength(2);
    for (const url of urls) {
      expect(tokenOf(url)).toMatch(/^[\w-]{43}$/u);
      const hash = createHash('sha256').update(tokenOf(url)).digest();
      expect(rows.rows.some((row) => (row.token_hash as Buffer).equals(hash))).toBe(true);
    }
  });

  it('refuses an order that belongs to another store', async () => {
    await expect(service.issueUrl(f.b, (await order()).id)).rejects.toThrow();
  });

  it('shows the order on open and changes nothing', async () => {
    const created = await order();
    const view = await service.view(await link(created.id), ip);
    expect(view).toMatchObject({
      state: 'open',
      orderNumber: created.number,
      totalPoisha: created.totalPoisha,
      items: [{ name: 'Panjabi - M', quantity: 2, totalPoisha: 250000 }],
    });
    expect((await stored(created.id)).stage).toBe('to_confirm');
  });

  it('treats an unknown token like a closed one', async () => {
    expect(await service.view('0'.repeat(43), ip)).toEqual({ state: 'closed' });
    expect(await service.answer('0'.repeat(43), 'confirm', ip)).toBe('closed');
  });

  it('confirms an order in To confirm once, by the customer, without touching contacts', async () => {
    const created = await order();
    const contacts = () =>
      f.connection.pool.query('select id from contacts where store_id=$1', [f.a]);
    const before = (await contacts()).rows.length;
    const token = await link(created.id);

    expect(await service.answer(token, 'confirm', ip)).toBe('confirmed');
    expect(await stored(created.id)).toMatchObject({
      stage: 'to_pack',
      confirmation_method: 'sms_link',
    });
    const events = await f.connection.pool.query(
      "select 1 from outbox_events where type='order.confirmed' and payload->>'orderId'=$1",
      [created.id],
    );
    expect(events.rows).toHaveLength(1);
    expect((await contacts()).rows).toHaveLength(before);

    expect(await service.answer(token, 'cancel', ip)).toBe('closed');
    expect(await service.view(token, ip)).toEqual({ state: 'closed' });
    expect((await stored(created.id)).stage).toBe('to_pack');
  });

  it('cancels with the customer reason and releases the stock', async () => {
    const created = await order();
    expect(await service.answer(await link(created.id), 'cancel', ip)).toBe('cancelled');
    expect(await stored(created.id)).toMatchObject({
      stage: 'cancelled',
      cancel_reason: 'customer_cancelled',
    });
    const [{ reserved }] = (
      await f.connection.pool.query('select reserved from product_variants where id=$1', [
        created.items[0]?.variantId,
      ])
    ).rows;
    expect(reserved).toBe(0);
  });

  it('does nothing for an order saved as confirmed, even though it still emits order.created', async () => {
    const created = await order({ confirm: true });
    const token = await link(created.id);
    expect(await service.view(token, ip)).toEqual({ state: 'closed' });
    expect(await service.answer(token, 'cancel', ip)).toBe('closed');
    expect((await stored(created.id)).stage).toBe('to_pack');
  });

  it('does nothing once staff moved the order out of To confirm', async () => {
    const created = await order();
    const token = await link(created.id);
    await orders.changeStage(
      f.a,
      created.id,
      { to: 'on_hold', reason: 'cannot_reach' },
      { actor: staff, access: { seeFullPhone: true } },
    );
    expect(await service.answer(token, 'confirm', ip)).toBe('closed');
    expect((await stored(created.id)).stage).toBe('on_hold');
  });
});
