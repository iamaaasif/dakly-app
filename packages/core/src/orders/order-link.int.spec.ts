import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PlaceOrderLinkOrderInput } from '@dakly/contracts/order-link';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { DeliveryModule } from '../delivery/delivery.module';
import { DeliveryService } from '../delivery/delivery.service';
import { loadEnv } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { OrderLinkService } from './order-link.service';
import { OrdersModule } from './orders.module';

class TestModule {}
Module({ imports: [DatabaseModule, DeliveryModule, OrdersModule] })(TestModule);

describe('public order link (Postgres)', () => {
  const f = new OwnerIsolationFixture();
  let app: INestApplicationContext;
  let service: OrderLinkService;
  // A fresh address each call, so a limit counted by one test never reaches another.
  const ip = () =>
    `2001:db8::${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}`;
  const slugA = `shop-a-${randomUUID().slice(0, 8)}`;
  const slugB = `shop-b-${randomUUID().slice(0, 8)}`;
  const phone = () => `0171${Math.floor(1000000 + Math.random() * 8999999)}`;

  beforeAll(async () => {
    await f.setup();
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(OrderLinkService);
    await f.connection.pool.query('update stores set slug=$1 where id=$2', [slugA, f.a]);
    await f.connection.pool.query('update stores set slug=$1 where id=$2', [slugB, f.b]);
    await f.connection.pool.query('insert into store_counters (store_id) values ($1)', [f.a]);
    await app.get(DeliveryService).initializeDefaults(f.a, { kind: 'user', userId: f.userA });
  });
  afterAll(async () => {
    for (const table of [
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

  async function product(storeId = f.a, { visible = true, onHand = 5, price = 125000 } = {}) {
    const productId = randomUUID();
    const variantId = randomUUID();
    await f.connection.pool.query(
      'insert into products(id,store_id,name,is_stock_tracked,price_poisha,is_visible_in_order_link) values ($1,$2,$3,true,$4,$5)',
      [productId, storeId, 'Panjabi', price, visible],
    );
    await f.connection.pool.query(
      "insert into product_variants(id,store_id,product_id,title,on_hand) values ($1,$2,$3,'M',$4)",
      [variantId, storeId, productId, onHand],
    );
    return { productId, variantId };
  }

  const request = (variantId: string, change: Partial<PlaceOrderLinkOrderInput> = {}) =>
    ({
      botCheckToken: 'fake-bot-check-pass',
      idempotencyKey: randomUUID(),
      variantId,
      quantity: 2,
      buyer: { name: 'Rahim', phone: phone() },
      recipient: { isBuyer: true, address: 'Road 5, Dhanmondi', areaId: 301 },
      ...change,
    }) as PlaceOrderLinkOrderInput;

  it('shows the price from the database and the delivery charge of each district', async () => {
    const { productId, variantId } = await product();
    const view = await service.view(slugA, productId, ip());
    expect(view.product.variants).toMatchObject([{ id: variantId, pricePoisha: 125000 }]);
    expect(view.districts.length).toBeGreaterThan(30);
    expect(view.districts.every(({ chargePoisha }) => chargePoisha >= 0)).toBe(true);
  });

  it('answers a missing shop, another shop product and a hidden product the same way', async () => {
    const mine = await product(f.a, { visible: false });
    const theirs = await product(f.b);
    for (const [slug, productId] of [
      ['no-such-shop', mine.productId],
      [slugA, mine.productId],
      [slugA, theirs.productId],
      [slugB, mine.productId],
    ] as const)
      await expect(service.view(slug, productId, ip())).rejects.toMatchObject({
        code: 'ORDER_LINK_NOT_FOUND',
      });
  });

  it('gives staff the link of a product the page shows, and none for a hidden or other shop product', async () => {
    const { productId } = await product();
    expect(await service.urlFor(f.a, productId)).toEqual({
      url: `${loadEnv().SHORT_LINK_BASE_URL}/o/${slugA}/${productId}`,
    });
    const hidden = await product(f.a, { visible: false });
    const theirs = await product(f.b);
    for (const id of [hidden.productId, theirs.productId])
      await expect(service.urlFor(f.a, id)).rejects.toMatchObject({
        code: 'ORDER_LINK_NOT_FOUND',
      });
  });

  it('places an order in To confirm with the server price and the district charge', async () => {
    const { productId, variantId } = await product();
    const { charge } = (await service.view(slugA, productId, ip())).districts.reduce(
      (found, district) => (district.id === 301 ? { charge: district.chargePoisha } : found),
      { charge: -1 },
    );
    const placed = await service.place(slugA, productId, request(variantId), ip());
    expect(placed.totalPoisha).toBe(250000 + charge);
    const [row] = (
      await f.connection.pool.query(
        'select stage, source, created_by_type from orders where store_id=$1 and number=$2',
        [f.a, placed.orderNumber],
      )
    ).rows;
    expect(row).toMatchObject({
      stage: 'to_confirm',
      source: 'order_link',
      created_by_type: 'customer',
    });
  });

  it('gives the same order back for a repeated submit', async () => {
    const { productId, variantId } = await product();
    const body = request(variantId);
    const first = await service.place(slugA, productId, body, ip());
    expect(await service.place(slugA, productId, body, ip())).toEqual(first);
  });

  it('refuses a variant from another shop, a failed bot check and more than is in stock', async () => {
    const mine = await product();
    const theirs = await product(f.b);
    await expect(
      service.place(slugA, mine.productId, request(theirs.variantId), ip()),
    ).rejects.toMatchObject({ code: 'ORDER_LINK_NOT_FOUND' });
    await expect(
      service.place(slugA, mine.productId, request(mine.variantId, { botCheckToken: 'bad' }), ip()),
    ).rejects.toMatchObject({ code: 'ORDER_LINK_BOT_CHECK_FAILED' });
    await expect(
      service.place(slugA, mine.productId, request(mine.variantId, { quantity: 6 }), ip()),
    ).rejects.toThrow();
  });

  it('allows 5 orders a day for one phone and refuses the sixth', async () => {
    const { productId, variantId } = await product(f.a, { onHand: 50 });
    const buyer = { name: 'Rahim', phone: phone() };
    for (let count = 0; count < 5; count += 1)
      await service.place(slugA, productId, request(variantId, { buyer, quantity: 1 }), ip());
    await expect(
      service.place(slugA, productId, request(variantId, { buyer, quantity: 1 }), ip()),
    ).rejects.toMatchObject({ code: 'ORDER_LINK_PHONE_LIMIT' });
  });

  it('allows 30 orders an hour from one address and refuses the next', async () => {
    const { productId, variantId } = await product(f.a, { onHand: 100 });
    const address = ip();
    for (let count = 0; count < 30; count += 1)
      await service.place(slugA, productId, request(variantId, { quantity: 1 }), address);
    await expect(
      service.place(slugA, productId, request(variantId, { quantity: 1 }), address),
    ).rejects.toMatchObject({ code: 'ORDER_LINK_RATE_LIMITED' });
  });
});
