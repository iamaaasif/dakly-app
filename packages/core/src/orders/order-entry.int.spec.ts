import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createOrderSchema } from '@dakly/contracts/orders';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { DeliveryModule } from '../delivery/delivery.module';
import { DeliveryService } from '../delivery/delivery.service';
import { DatabaseModule } from '../platform/database/database.module';
import { OrderEntryService } from './order-entry.service';
import { OrdersModule } from './orders.module';
import { OrdersService } from './orders.service';

class TestModule {}
Module({ imports: [DatabaseModule, DeliveryModule, OrdersModule] })(TestModule);

describe('New order page lookups', () => {
  const f = new OwnerIsolationFixture();
  let app: INestApplicationContext;
  let entry: OrderEntryService;
  let orders: OrdersService;
  const seesPhone = { seeFullPhone: true } as never;
  const hidesPhone = { seeFullPhone: false } as never;

  beforeAll(async () => {
    await f.setup();
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    entry = app.get(OrderEntryService);
    orders = app.get(OrdersService);
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
      await f.connection.pool.query(`delete from ${table} where store_id=$1`, [f.a]);
    await app.close();
    await f.close();
  });

  async function variant(name: string): Promise<string> {
    const productId = randomUUID();
    const variantId = randomUUID();
    await f.connection.pool.query(
      'insert into products(id,store_id,name,is_stock_tracked,price_poisha) values ($1,$2,$3,true,50000)',
      [productId, f.a, name],
    );
    await f.connection.pool.query(
      "insert into product_variants(id,store_id,product_id,title,on_hand) values ($1,$2,$3,'M',20)",
      [variantId, f.a, productId],
    );
    return variantId;
  }

  async function order(variantId: string, phone: string, extra: object = {}) {
    return orders.createOrder(
      f.a,
      createOrderSchema.parse({
        buyer: { name: 'Rahim', phone },
        recipient: { name: 'Rahim', phone, address: 'House 9, Road 2, Mirpur', areaId: 301 },
        items: [{ variantId, quantity: 1 }],
        ...extra,
      }),
      {
        actor: { kind: 'user', userId: f.userA },
        access: seesPhone,
        idempotencyKey: randomUUID(),
      },
    );
  }

  it('finds the customer by phone with the last address and the open orders', async () => {
    const created = await order(await variant('Shirt'), '01712458903');
    await order(await variant('Cap'), '01712458903');
    const found = await entry.lookupCustomer(f.a, { phone: '01712458903' }, seesPhone);
    expect(found.openOrders).toBe(2);
    expect(found.customer).toMatchObject({
      contactId: created.buyerContactId,
      name: 'Rahim',
      phone: '01712458903',
      address: 'House 9, Road 2, Mirpur',
      area: { id: 301, name: 'Dhaka', districtId: 301, districtName: 'Dhaka' },
    });
  });

  it('does not use a gift address as the customer address', async () => {
    const phone = '01811223344';
    await order(await variant('Scarf'), phone, {
      recipient: {
        name: 'Tania',
        phone: '01922334455',
        address: 'Her house',
        areaId: 301,
        isBuyer: false,
      },
    });
    const found = await entry.lookupCustomer(f.a, { phone }, seesPhone);
    expect(found.customer).toMatchObject({ name: 'Rahim', address: null, area: null });
  });

  it('returns no customer for an unknown number and still counts its open orders', async () => {
    expect(await entry.lookupCustomer(f.a, { phone: '01399999999' }, seesPhone)).toEqual({
      customer: null,
      openOrders: 0,
    });
  });

  it('does not reveal a customer by typed number to a member who cannot see phones', async () => {
    expect(await entry.lookupCustomer(f.a, { phone: '01712458903' }, hidesPhone)).toEqual({
      customer: null,
      openOrders: 0,
    });
    const created = await order(await variant('Belt'), '01755667788');
    const byId = await entry.lookupCustomer(
      f.a,
      { contactId: created.buyerContactId! },
      hidesPhone,
    );
    expect(byId.customer).toMatchObject({ name: 'Rahim', phone: null });
  });

  it('lists the five products sold last, newest first', async () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (const name of names) await order(await variant(`Recent ${name}`), '01766778899');
    const recent = await entry.recentProducts(f.a);
    expect(recent.map(({ name }) => name)).toEqual([
      'Recent F',
      'Recent E',
      'Recent D',
      'Recent C',
      'Recent B',
    ]);
  });

  it('searches areas by the start of the name and names the district', async () => {
    const delivery = app.get(DeliveryService);
    const upazila = await delivery.searchAreas(f.a, { search: 'mirp', limit: 8 });
    expect(upazila.items).toMatchObject([
      { name: 'Mirpur', kind: 'upazila', districtName: 'Kushtia' },
    ]);
    const district = await delivery.searchAreas(f.a, { search: 'dhaka', limit: 8 });
    expect(district.items).toContainEqual(
      expect.objectContaining({
        id: 301,
        kind: 'district',
        districtId: 301,
        districtName: 'Dhaka',
      }),
    );
    expect(district.items.every(({ kind }) => kind !== 'division')).toBe(true);
  });
});
