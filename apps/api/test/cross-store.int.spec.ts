import 'reflect-metadata';
import { createHash, createHmac, randomBytes, randomUUID, randomInt } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsService } from '@dakly/core/analytics/analytics.service';
import { META_CHANNEL_DRIVER } from '@dakly/core/channels/meta-authorization.service';
import { DeliveryService } from '@dakly/core/delivery/delivery.service';
import { NotificationStreamService } from '@dakly/core/notifications/notification-stream.service';
import { NotificationsService } from '@dakly/core/notifications/notifications.service';
import { ValkeyClient } from '@dakly/core/platform/cache/valkey-client';
import { loadEnv, resetEnvForTests } from '@dakly/core/platform/config/env';
import { EnvelopeEncryption } from '@dakly/core/platform/crypto/envelope-encryption';
import { DATABASE_CONNECTION } from '@dakly/core/platform/database/database.tokens';
import { createHttpServer } from '@dakly/core/platform/http/http-server';
import { registerSessionCookies, SESSION_COOKIE } from '@dakly/core/platform/http/session-cookie';
import { SessionsService } from '@dakly/core/sessions/sessions.service';
import { SmsService } from '@dakly/core/sms/sms.service';

import { AppModule } from '../src/app.module';
import { isolationBoundaries } from './isolation-boundaries';
import { type Actor, IsolationFixture, type Shop } from './isolation-fixture';
import { IsolationInventory } from './isolation-inventory';
import { captureRequestLogs } from './request-log-sink';

const permissions = {
  areas: { customers: 'view' },
  seeFullPhone: false,
  exportLists: false,
  refund: false,
};
const phone = () => `018${randomInt(10000000, 99999999)}`;
const fixtures = new Map<string, () => Promise<void>>();
let app: NestFastifyApplication, f: IsolationFixture;
const inventory = new IsolationInventory();
function fixture(route: string, run: () => Promise<void>) {
  fixtures.set(route, run);
}
async function pair() {
  return { a: await f.shop(), b: await f.shop() };
}
async function success(
  shop: Shop,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  status: number,
  payload?: object,
) {
  const result = await f.request(shop.owner, method, url, payload);
  expect(result.statusCode, result.body).toBe(status);
  return result;
}
async function hidden(
  shop: Shop,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: (id: string) => string,
  id: string,
  payload?: (id: string) => object,
) {
  const foreign = await f.request(shop.owner, method, url(id), payload?.(id));
  const absent = randomUUID();
  const missing = await f.request(shop.owner, method, url(absent), payload?.(absent));
  expect(foreign.statusCode, foreign.body).toBe(404);
  expect(missing.statusCode, missing.body).toBe(404);
  expect(foreign.json()).toEqual(missing.json());
}
async function contact(shop: Shop) {
  const result = await success(shop, 'POST', '/contacts', 201, { name: 'রিনা', phone: phone() });
  expect(result.json().name).toBe('রিনা');
  return result.json().id as string;
}
async function role(shop: Shop) {
  return (await success(shop, 'POST', '/roles', 201, { name: 'সহায়তা', permissions })).json()
    .id as string;
}
async function smsCredits(shop: Shop, quantity: number) {
  const id = randomUUID();
  await f.admin.pool.query(
    "insert into wallet_ledger(id,store_id,wallet,revision,kind,quantity_delta,balance_quantity_after,idempotency_key,actor_type) values($1::uuid,$2,'sms_credits',1,'top_up',$3,$3,$1::text,'system')",
    [id, shop.id, quantity],
  );
  return id;
}
async function order(shop: Shop): Promise<string> {
  const id = randomUUID();
  await f.admin.pool.query(
    `insert into orders (id,store_id,number,source,created_by_type,recipient_name,
       recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,cod_amount_poisha)
     values($1,$2,1001,'manual','user','রিনা',$3,'ধানমন্ডি','Dhaka',9000,9000)`,
    [id, shop.id, shop.owner.phone],
  );
  return id;
}

async function orderVariant(shop: Shop): Promise<string> {
  const result = await success(shop, 'POST', '/products', 201, {
    name: 'পাঞ্জাবি',
    pricePoisha: 125000,
    isStockTracked: false,
  });
  return result.json().variants[0].id as string;
}

fixture('POST /orders', async () => {
  const { a, b } = await pair();
  const ownVariant = await orderVariant(b);
  const foreignVariant = await orderVariant(a);
  const ownBuyer = await contact(b);
  const foreignBuyer = await contact(a);
  await deliveryZone(b);
  await f.admin.pool.query('insert into store_counters(store_id) values ($1)', [b.id]);
  const input = (contactId: string, variantId: string) => ({
    buyer: { contactId },
    recipient: { name: 'রিনা', phone: b.owner.phone, address: 'ধানমন্ডি', areaId: 301 },
    items: [{ variantId, quantity: 1 }],
  });
  const create = (payload: object, key = randomUUID()) =>
    f.request(b.member, 'POST', '/orders', payload, { 'idempotency-key': key });
  const before = await f.row('product_variants', foreignVariant);
  const buyerBefore = await f.row('contacts', foreignBuyer);
  for (const [foreign, missing] of [
    [input(foreignBuyer, ownVariant), input(randomUUID(), ownVariant)],
    [input(ownBuyer, foreignVariant), input(ownBuyer, randomUUID())],
  ] as const) {
    const denied = await create(foreign);
    const absent = await create(missing);
    expect(denied.statusCode, denied.body).toBe(404);
    expect(absent.statusCode, absent.body).toBe(404);
    expect(denied.json()).toEqual(absent.json());
  }
  expect(await f.row('product_variants', foreignVariant)).toEqual(before);
  expect(await f.row('contacts', foreignBuyer)).toEqual(buyerBefore);
  const key = randomUUID();
  const goodInput = input(ownBuyer, ownVariant);
  const created = await create(goodInput, key);
  expect(created.statusCode, created.body).toBe(201);
  expect(created.json()).toMatchObject({
    number: 1001,
    buyerContactId: ownBuyer,
    stage: 'to_confirm',
  });
  expect((await create(goodInput, key)).json()).toEqual(created.json());
  expect((await f.request(b.member, 'POST', '/orders', goodInput)).statusCode).toBe(400);
  const ownPhone = phone();
  const captured = await create({
    ...goodInput,
    buyer: { name: 'Rahim' },
    recipient: { ...goodInput.recipient, phone: ownPhone },
  });
  expect(captured.statusCode, captured.body).toBe(201);
  const buyerId = captured.json().buyerContactId;
  expect(await f.row('contacts', buyerId)).toMatchObject({ phone: ownPhone });
  const profileEdit = await f.request(b.member, 'PATCH', `/contacts/${buyerId}`, { name: 'Karim' });
  expect(profileEdit.statusCode).toBe(403);
});

fixture('PATCH /orders/:orderId', async () => {
  const { a, b } = await pair();
  const foreignId = await order(a);
  const ownId = await order(b);
  const variantId = await orderVariant(b);
  const edit = { items: [{ variantId, quantity: 2 }] };
  const before = await f.row('orders', foreignId);
  expect((await success(b, 'PATCH', `/orders/${ownId}`, 200, edit)).json()).toMatchObject({
    id: ownId,
    items: [{ variantId, quantity: 2 }],
    itemsSubtotalPoisha: 250000,
  });
  await hidden(
    b,
    'PATCH',
    (value) => `/orders/${value}`,
    foreignId,
    () => edit,
  );
  expect(await f.row('orders', foreignId)).toEqual(before);
  await f.admin.pool.query("update memberships set built_in_role='marketer' where id=$1", [
    b.membership,
  ]);
  expect((await f.request(b.member, 'PATCH', `/orders/${ownId}`, edit)).statusCode).toBe(403);
});

fixture('GET /orders', async () => {
  const { a, b } = await pair();
  const ownA = await order(a);
  const ownB = await order(b);
  for (const [shop, id] of [
    [a, ownA],
    [b, ownB],
  ] as const) {
    const result = await success(shop, 'GET', '/orders?stage=to_confirm', 200);
    expect(result.json()).toMatchObject({ items: [{ id }], counts: { to_confirm: 1 } });
    expect(result.json().items).toHaveLength(1);
  }
  await f.admin.pool.query("update stores set time_zone='America/New_York' where id=$1", [b.id]);
  await f.admin.pool.query(
    `update orders set stage='delivered', source='whatsapp', courier='pathao',
      created_at=case when id=$1 then '2026-11-16T18:00:00Z'::timestamptz
                      else '2026-11-18T04:59:59Z'::timestamptz end
      where id in ($1,$2)`,
    [ownA, ownB],
  );
  const filtered =
    '/orders?stage=delivered&source=whatsapp&courier=pathao&createdFrom=2026-11-17&createdThrough=2026-11-17';
  for (const [shop, id] of [
    [a, ownA],
    [b, ownB],
  ] as const) {
    expect((await success(shop, 'GET', filtered, 200)).json().items).toEqual([
      expect.objectContaining({ id }),
    ]);
  }
  await f.admin.pool.query("update orders set created_at='2026-11-18T05:00:00Z' where id=$1", [
    ownB,
  ]);
  expect((await success(b, 'GET', filtered, 200)).json().items).toEqual([]);
  for (const unmatched of [
    filtered.replace('source=whatsapp', 'source=manual'),
    filtered.replace('courier=pathao', 'courier=redx'),
    filtered.replaceAll('2026-11-17', '2026-11-18'),
    filtered.replace(
      '&createdFrom=2026-11-17&createdThrough=2026-11-17',
      '&createdThrough=2026-11-16',
    ),
  ]) {
    expect((await success(a, 'GET', unmatched, 200)).json().items).toEqual([]);
  }
});

fixture('GET /orders/catalogue', async () => {
  const { a, b } = await pair();
  const own = (
    await success(b, 'POST', '/products', 201, {
      name: 'Panjabi',
      pricePoisha: 125000,
      isStockTracked: true,
    })
  ).json();
  const foreign = await success(a, 'POST', '/products', 201, {
    name: 'Panjabi',
    pricePoisha: 80000,
  });
  expect(foreign.statusCode).toBe(201);
  await f.admin.pool.query("update memberships set built_in_role='marketer' where id=$1", [
    b.membership,
  ]);
  expect((await f.request(b.member, 'GET', '/orders/catalogue')).statusCode).toBe(403);
  const role = (
    await success(b, 'POST', '/roles', 201, {
      name: 'Order desk',
      permissions: { ...permissions, areas: { orders: 'edit' } },
    })
  ).json();
  await success(b, 'PATCH', `/members/${b.membership}`, 200, { roleId: role.id });
  expect((await f.request(b.member, 'GET', '/products')).statusCode).toBe(403);
  const catalogue = await f.request(b.member, 'GET', '/orders/catalogue?search=Panjabi');
  expect(catalogue.statusCode).toBe(200);
  expect(catalogue.json()).toEqual({
    items: [
      {
        id: own.id,
        name: 'Panjabi',
        isStockTracked: true,
        variants: [
          {
            id: own.variants[0].id,
            title: own.variants[0].title,
            isDefault: true,
            pricePoisha: 125000,
            available: 0,
          },
        ],
      },
    ],
    nextCursor: null,
  });
});

fixture('GET /orders/catalogue/stock', async () => {
  const { a, b } = await pair();
  const product = (
    await success(b, 'POST', '/products', 201, {
      name: 'Tracked Panjabi',
      pricePoisha: 125000,
      isStockTracked: true,
    })
  ).json();
  const own = product.variants[0].id as string;
  const foreign = await orderVariant(a);
  await f.admin.pool.query(
    "update product_variants set on_hand=7,reserved=3,status='archived' where store_id=$1 and id=$2",
    [b.id, own],
  );
  const url = `/orders/catalogue/stock?variantIds=${own},${foreign},${randomUUID()}`;
  expect((await success(b, 'GET', url, 200)).json()).toEqual([{ variantId: own, available: 4 }]);
  await f.admin.pool.query("update memberships set built_in_role='marketer' where id=$1", [
    b.membership,
  ]);
  expect((await f.request(b.member, 'GET', url)).statusCode).toBe(403);
});

fixture('GET /orders/catalogue/:productId', async () => {
  const { a, b } = await pair();
  const product = (
    await success(a, 'POST', '/products', 201, {
      name: 'Panjabi',
      pricePoisha: 125000,
    })
  ).json();
  await f.admin.pool.query(
    "insert into product_variants (id,store_id,product_id,title,status) values ($1,$2,$3,'Old size','archived')",
    [randomUUID(), a.id, product.id],
  );
  const url = (id: string) => `/orders/catalogue/${id}`;
  expect((await success(a, 'GET', url(product.id), 200)).json()).toMatchObject({
    id: product.id,
    variants: [{ id: product.variants[0].id, pricePoisha: 125000 }],
  });
  await f.admin.pool.query("update memberships set built_in_role='marketer' where id=$1", [
    a.membership,
  ]);
  expect((await f.request(a.member, 'GET', url(product.id))).statusCode).toBe(403);
  await hidden(b, 'GET', url, product.id);
  await success(a, 'DELETE', `/products/${product.id}`, 204);
  await hidden(a, 'GET', url, product.id);
});

fixture('GET /orders/:orderId', async () => {
  const { a, b } = await pair();
  const id = await order(a);
  expect((await success(a, 'GET', `/orders/${id}`, 200)).json()).toMatchObject({
    id,
    items: [],
    timeline: [],
  });
  const restricted = await f.request(a.member, 'GET', `/orders/${id}`);
  expect(restricted.statusCode, restricted.body).toBe(200);
  expect(restricted.json().recipientPhone).toBe(
    `${a.owner.phone.slice(0, 5)}-XXX${a.owner.phone.slice(-3)}`,
  );
  await hidden(b, 'GET', (value) => `/orders/${value}`, id);
});

fixture('POST /orders/:orderId/courier', async () => {
  const { a, b } = await pair();
  const foreign = await order(a);
  const own = await order(b);
  await f.admin.pool.query("update orders set stage='to_pack' where id=any($1::uuid[])", [
    [foreign, own],
  ]);
  const url = (id: string) => `/orders/${id}/courier`;
  const input = { courier: 'other', courierOtherName: 'Local rider', trackingCode: 'DP123' };
  const before = await f.row('orders', foreign);
  expect((await success(b, 'POST', url(own), 200, input)).json()).toMatchObject({
    stage: 'with_courier',
    courier: 'other',
    courierOtherName: 'Local rider',
    trackingCode: 'DP123',
    shippedByUserId: b.owner.id,
  });
  await hidden(b, 'POST', url, foreign, () => input);
  expect(await f.row('orders', foreign)).toEqual(before);
});

fixture('POST /orders/:orderId/cod-collected', async () => {
  const { a, b } = await pair();
  const foreign = await order(a);
  const own = await order(b);
  await f.admin.pool.query("update orders set stage='delivered' where id=any($1::uuid[])", [
    [foreign, own],
  ]);
  const url = (id: string) => `/orders/${id}/cod-collected`;
  const input = { amountPoisha: 9000 };
  const before = await f.row('orders', foreign);
  expect((await success(b, 'POST', url(own), 200, input)).json()).toMatchObject({
    stage: 'delivered',
    paymentStatus: 'cod_collected',
    codCollectedPoisha: 9000,
  });
  await hidden(b, 'POST', url, foreign, () => input);
  expect(await f.row('orders', foreign)).toEqual(before);
});

fixture('POST /orders/:orderId/stage', async () => {
  const { a, b } = await pair();
  const foreignId = await order(a);
  const ownId = await order(b);
  const url = (id: string) => `/orders/${id}/stage`;
  const change = { to: 'to_pack' };
  const before = await f.row('orders', foreignId);
  await f.admin.pool.query("update memberships set built_in_role='marketer' where id=$1", [
    b.membership,
  ]);
  expect((await f.request(b.member, 'POST', url(ownId), change)).statusCode).toBe(403);
  expect((await success(b, 'POST', url(ownId), 200, change)).json()).toMatchObject({
    stage: 'to_pack',
    timeline: [{ from: 'to_confirm', to: 'to_pack', actorUserId: b.owner.id }],
  });
  await hidden(b, 'POST', url, foreignId, () => change);
  expect(await f.row('orders', foreignId)).toEqual(before);
});

fixture('GET /contacts/:contactId', async () => {
  const { a, b } = await pair(),
    id = await contact(a);
  expect((await success(a, 'GET', `/contacts/${id}`, 200)).json().id).toBe(id);
  await hidden(b, 'GET', (value) => `/contacts/${value}`, id);
});
fixture('POST /contacts', async () => {
  const { a, b } = await pair(),
    id = await contact(a),
    before = await f.row('contacts', id);
  const own = await contact(b);
  expect((await f.row('contacts', own)).store_id).toBe(b.id);
  expect(await f.row('contacts', id)).toEqual(before);
});
fixture('GET /contacts', async () => {
  const { a, b } = await pair(),
    aId = await contact(a),
    bId = await contact(b);
  for (const [shop, own, foreign] of [
    [a, aId, bId],
    [b, bId, aId],
  ] as const) {
    const ids = (await success(shop, 'GET', '/contacts', 200))
      .json()
      .items.map((item: { id: string }) => item.id);
    expect(ids).toEqual([own]);
    expect(ids).not.toContain(foreign);
  }
});
for (const method of ['PATCH', 'DELETE'] as const)
  fixture(`${method} /contacts/:contactId`, async () => {
    const positive = await f.shop(),
      { a, b } = await pair();
    const positiveId = await contact(positive),
      foreignId = await contact(a);
    const payload = method === 'PATCH' ? { name: 'করিম', tags: ['ঈদ'] } : undefined;
    await success(
      positive,
      method,
      `/contacts/${positiveId}`,
      method === 'DELETE' ? 204 : 200,
      payload,
    );
    const changed = await f.row('contacts', positiveId);
    if (method === 'DELETE') expect(changed.deleted_at).not.toBeNull();
    else expect(changed).toMatchObject({ name: 'করিম', tags: ['ঈদ'] });
    const before = await f.row('contacts', foreignId);
    await hidden(
      b,
      method,
      (id) => `/contacts/${id}`,
      foreignId,
      () => payload ?? {},
    );
    expect(await f.row('contacts', foreignId)).toEqual(before);
  });
async function product(shop: Shop) {
  const result = await success(shop, 'POST', '/products', 201, {
    name: 'পাঞ্জাবি',
    pricePoisha: 125000,
  });
  expect(result.json().variants).toHaveLength(1);
  return result.json().id as string;
}
fixture('POST /products', async () => {
  const { a, b } = await pair(),
    id = await product(a);
  const before = await f.row('products', id),
    own = await product(b);
  expect((await f.row('products', own)).store_id).toBe(b.id);
  expect(await f.row('products', id)).toEqual(before);
  expect((await f.request(b.member, 'POST', '/products', { name: 'Forbidden' })).statusCode).toBe(
    403,
  );
});
fixture('GET /products', async () => {
  const { a, b } = await pair(),
    aId = await product(a),
    bId = await product(b);
  for (const [shop, id] of [
    [a, aId],
    [b, bId],
  ] as const)
    expect(
      (await success(shop, 'GET', '/products', 200))
        .json()
        .items.map((row: { id: string }) => row.id),
    ).toEqual([id]);
});
fixture('GET /products/:productId', async () => {
  const { a, b } = await pair(),
    id = await product(a);
  expect((await success(a, 'GET', `/products/${id}`, 200)).json().id).toBe(id);
  await hidden(b, 'GET', (value) => `/products/${value}`, id);
});
for (const method of ['PATCH', 'DELETE'] as const)
  fixture(`${method} /products/:productId`, async () => {
    const { a, b } = await pair(),
      foreignId = await product(a),
      own = await product(b);
    const before = await f.row('products', foreignId);
    const payload = method === 'PATCH' ? { name: 'লাল পাঞ্জাবি', status: 'hidden' } : undefined;
    await success(b, method, `/products/${own}`, method === 'PATCH' ? 200 : 204, payload);
    expect(await f.row('products', own)).toMatchObject(
      method === 'PATCH' ? { name: 'লাল পাঞ্জাবি', status: 'hidden' } : { status: 'archived' },
    );
    await hidden(
      b,
      method,
      (id) => `/products/${id}`,
      foreignId,
      () => payload ?? {},
    );
    expect(await f.row('products', foreignId)).toEqual(before);
  });
fixture('POST /variants/:variantId/stock-adjustments', async () => {
  const { a, b } = await pair();
  const created = (
    await success(a, 'POST', '/products', 201, { name: 'Stock fixture', pricePoisha: 10000 })
  ).json();
  const variantId = created.variants[0].id as string;
  await success(a, 'POST', `/variants/${variantId}/stock-adjustments`, 204, {
    quantity: 4,
    reason: 'Counted four units',
  });
  expect(await f.row('product_variants', variantId)).toMatchObject({ on_hand: 4, reserved: 0 });
  const stock = await f.admin.pool.query(
    'select kind,quantity,reason,actor_user_id from stock_movements where variant_id=$1',
    [variantId],
  );
  expect(stock.rows).toEqual([
    { kind: 'adjust', quantity: 4, reason: 'Counted four units', actor_user_id: a.owner.id },
  ]);
  expect((await success(a, 'GET', `/products/${created.id}`, 200)).json().readiness).not.toContain(
    'running_low',
  );
  const settings = (await success(a, 'GET', '/store', 200)).json();
  expect(settings.stock).toEqual({ lowStockThreshold: 3 });
  const saved = (
    await success(a, 'PATCH', '/store', 200, {
      stock: { lowStockThreshold: 5 },
      sending: settings.sending,
    })
  ).json();
  expect(saved.stock).toEqual({ lowStockThreshold: 5 });
  expect(saved.sending).toEqual(settings.sending);
  expect(
    (await success(a, 'PATCH', '/store', 200, { sending: settings.sending })).json().stock,
  ).toEqual({ lowStockThreshold: 5 });
  expect((await success(a, 'GET', `/products/${created.id}`, 200)).json().readiness).toContain(
    'running_low',
  );
  expect(
    (await success(a, 'GET', '/products?readiness=running_low', 200))
      .json()
      .items.map((item: { id: string }) => item.id),
  ).toEqual([created.id]);
  const before = await f.row('product_variants', variantId);
  await hidden(
    b,
    'POST',
    (id) => `/variants/${id}/stock-adjustments`,
    variantId,
    () => ({ quantity: 1, reason: 'Foreign stock' }),
  );
  expect(await f.row('product_variants', variantId)).toEqual(before);
  expect(
    (
      await f.request(a.member, 'POST', `/variants/${variantId}/stock-adjustments`, {
        quantity: 1,
        reason: 'Forbidden',
      })
    ).statusCode,
  ).toBe(403);
});
async function deliveryZone(shop: Shop) {
  const result = await success(shop, 'POST', '/delivery-zones', 201, {
    name: 'Outside Dhaka',
    chargePoisha: 12000,
    isDefault: true,
  });
  return result.json().id as string;
}
fixture('POST /delivery-zones', async () => {
  const { a, b } = await pair(),
    id = await deliveryZone(a),
    before = await f.row('delivery_zones', id);
  const own = await deliveryZone(b);
  expect((await f.row('delivery_zones', own)).store_id).toBe(b.id);
  expect(await f.row('delivery_zones', id)).toEqual(before);
  expect(
    (await f.request(b.member, 'POST', '/delivery-zones', { name: 'Forbidden', chargePoisha: 1 }))
      .statusCode,
  ).toBe(403);
});
fixture('POST /delivery-zones/initialize-defaults', async () => {
  const { a, b } = await pair(),
    id = await deliveryZone(a),
    before = await f.row('delivery_zones', id);
  const result = await success(b, 'POST', '/delivery-zones/initialize-defaults', 201);
  expect(result.json().items).toHaveLength(3);
  expect(result.json().items).toContainEqual(
    expect.objectContaining({
      name: 'Dhaka suburbs',
      chargePoisha: 10000,
      bdAreaIds: [303, 309, 30260072],
    }),
  );
  for (const zone of result.json().items)
    expect((await f.row('delivery_zones', zone.id)).store_id).toBe(b.id);
  expect(await f.row('delivery_zones', id)).toEqual(before);
});
fixture('GET /delivery-zones/charge', async () => {
  const { a, b } = await pair();
  await deliveryZone(a);
  await success(b, 'POST', '/delivery-zones', 201, {
    name: 'Standard delivery',
    chargePoisha: 6000,
    isDefault: true,
  });
  const path = '/delivery-zones/charge?areaId=301';
  expect((await success(a, 'GET', path, 200)).json().chargePoisha).toBe(12000);
  expect((await success(b, 'GET', path, 200)).json().chargePoisha).toBe(6000);
  await f.admin.pool.query("update memberships set built_in_role='marketer' where id=$1", [
    b.membership,
  ]);
  expect((await f.request(b.member, 'GET', path)).statusCode).toBe(403);
});
fixture('GET /delivery-zones', async () => {
  const { a, b } = await pair(),
    aId = await deliveryZone(a),
    bId = await deliveryZone(b);
  for (const [shop, id] of [
    [a, aId],
    [b, bId],
  ] as const)
    expect(
      (await success(shop, 'GET', '/delivery-zones', 200))
        .json()
        .items.map((zone: { id: string }) => zone.id),
    ).toEqual([id]);
});
for (const method of ['PATCH', 'DELETE'] as const)
  fixture(`${method} /delivery-zones/:deliveryZoneId`, async () => {
    const { a, b } = await pair(),
      foreignId = await deliveryZone(a);
    await deliveryZone(b);
    const own = (
      await success(b, 'POST', '/delivery-zones', 201, { name: 'City', chargePoisha: 6000 })
    ).json().id as string;
    const payload = method === 'PATCH' ? { chargePoisha: 6500 } : undefined;
    await success(b, method, `/delivery-zones/${own}`, method === 'PATCH' ? 200 : 204, payload);
    expect(await f.row('delivery_zones', own)).toEqual(
      method === 'PATCH' ? expect.objectContaining({ charge_poisha: 6500 }) : undefined,
    );
    const before = await f.row('delivery_zones', foreignId);
    await hidden(
      b,
      method,
      (id) => `/delivery-zones/${id}`,
      foreignId,
      () => payload ?? {},
    );
    expect(await f.row('delivery_zones', foreignId)).toEqual(before);
  });
const metaAppSecret = 'shared-meta-test-app-secret';
const metaStart = '/channel-connections/meta/start';
const metaAccounts = '/channel-connections/meta/accounts';

async function metaGrant(shop: Shop, actor = shop.owner) {
  const result = await f.request(actor, 'POST', metaStart);
  expect(result.statusCode, result.body).toBe(201);
  const { authorizationUrl } = result.json();
  const url = new URL(authorizationUrl);
  return { state: url.searchParams.get('state'), code: url.searchParams.get('code') };
}

async function secondShopSession(shop: Shop) {
  const { token } = await app.get(SessionsService).create(shop.owner.id, { isRemembered: false });
  const cookie = `${SESSION_COOKIE}=${token}`;
  expect(
    (await f.request(cookie, 'POST', '/me/active-store', { storeId: shop.id })).statusCode,
  ).toBe(204);
  return cookie;
}

async function metaCacheKey(shop: Shop, actor: Actor, kind: 'state' | 'selection', key: string) {
  const session = await app
    .get(SessionsService)
    .resolve(actor.cookie.slice(SESSION_COOKIE.length + 1));
  expect(session).toBeDefined();
  const hash = createHash('sha256').update(key).digest('hex');
  return `meta-auth:${shop.id}:${actor.id}:${session!.id}:${kind}:${hash}`;
}

async function expectMetaCredentialEncrypted(shop: Shop, selectionId: string, actor = shop.owner) {
  const key = await metaCacheKey(shop, actor, 'selection', selectionId);
  const redis = app.get(ValkeyClient).connection;
  const packed = await redis.get(key);
  expect(packed).toBeTruthy();
  expect(packed).not.toContain('fake-meta-user-credential');
  const ttl = await redis.ttl(key);
  expect(ttl).toBeGreaterThan(0);
  expect(ttl).toBeLessThanOrEqual(600);
  const { keyVersion, ciphertext } = JSON.parse(packed!);
  const plaintext = app
    .get(EnvelopeEncryption)
    .decrypt(
      { owner: 'store', storeId: shop.id, purpose: 'meta-selection-token' },
      { keyVersion, ciphertext: Buffer.from(ciphertext, 'base64') },
    );
  expect(plaintext.toString()).toBe('fake-meta-user-credential');
  plaintext.fill(0);
  await redis.del(key);
}

fixture('POST /channel-connections/meta/start', async () => {
  const { a, b } = await pair();
  const foreign = await metaGrant(a);
  const own = await metaGrant(b);
  expect(foreign.state).toMatch(/^[a-zA-Z0-9_-]{43}$/);
  expect(own.state).toMatch(/^[a-zA-Z0-9_-]{43}$/);
  expect(own.state).not.toBe(foreign.state);
  const redis = app.get(ValkeyClient).connection;
  const key = await metaCacheKey(b, b.owner, 'state', own.state!);
  expect(await redis.get(key)).toBe('1');
  const ttl = await redis.ttl(key);
  expect(ttl).toBeGreaterThan(0);
  expect(ttl).toBeLessThanOrEqual(600);
  await f.admin.pool.query("update memberships set built_in_role='marketer' where id=$1", [
    b.membership,
  ]);
  expect((await f.request(b.member, 'POST', metaStart)).statusCode).toBe(403);
  await f.admin.pool.query("update memberships set built_in_role='admin' where id=$1", [
    b.membership,
  ]);
  const adminGrant = await metaGrant(b, b.member);
  const adminAccounts = await f.request(b.member, 'POST', metaAccounts, adminGrant);
  expect(adminAccounts.statusCode).toBe(201);
  await expectMetaCredentialEncrypted(b, adminAccounts.json().selectionId, b.member);
  const expired = await metaGrant(b);
  await redis.expire(await metaCacheKey(b, b.owner, 'state', expired.state!), 0);
  expect((await f.request(b.owner, 'POST', metaAccounts, expired)).statusCode).toBe(404);
  const aAccounts = await success(a, 'POST', metaAccounts, 201, foreign);
  await expectMetaCredentialEncrypted(a, aAccounts.json().selectionId);
  const bAccounts = await success(b, 'POST', metaAccounts, 201, own);
  await expectMetaCredentialEncrypted(b, bAccounts.json().selectionId);
  expect(await redis.get(key)).toBeNull();
});

async function denyMetaStateOutsideItsShop(
  a: Shop,
  b: Shop,
  input: Awaited<ReturnType<typeof metaGrant>>,
) {
  await f.admin.pool.query(
    "insert into memberships(id,store_id,user_id,built_in_role,status) values($1,$2,$3,'admin','active')",
    [randomUUID(), b.id, a.owner.id],
  );
  const selectB = await f.request(a.owner, 'POST', '/me/active-store', { storeId: b.id });
  expect(selectB.statusCode).toBe(204);
  const foreign = await f.request(a.owner, 'POST', metaAccounts, input);
  expect(foreign.statusCode).toBe(404);
  const selectA = await f.request(a.owner, 'POST', '/me/active-store', { storeId: a.id });
  expect(selectA.statusCode).toBe(204);
  return foreign.json();
}

async function denyCustomMetaRole(shop: Shop, input: Awaited<ReturnType<typeof metaGrant>>) {
  const role = await success(shop, 'POST', '/roles', 201, {
    name: 'দোকানের সেটিংস',
    permissions: {
      areas: { storeSettings: 'edit' },
      seeFullPhone: false,
      exportLists: false,
      refund: false,
    },
  });
  await f.admin.pool.query('update memberships set built_in_role=null,role_id=$2 where id=$1', [
    shop.membership,
    role.json().id,
  ]);
  for (const [url, body] of [
    [metaStart, undefined],
    [metaAccounts, input],
  ] as const) {
    const denied = await f.request(shop.member, 'POST', url, body);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('META_LOGIN_ROLE_REQUIRED');
  }
}

fixture('POST /channel-connections/meta/accounts', async () => {
  const { a, b } = await pair();
  const foreign = await metaGrant(a);
  const own = await metaGrant(b);
  const wrongStore = await f.request(b.owner, 'POST', metaAccounts, foreign);
  const missing = await f.request(b.owner, 'POST', metaAccounts, { ...own, state: 'a'.repeat(43) });
  expect([wrongStore.statusCode, missing.statusCode]).toEqual([404, 404]);
  expect(wrongStore.json()).toEqual(missing.json());
  expect(await denyMetaStateOutsideItsShop(a, b, foreign)).toEqual(missing.json());
  const wrongSession = await f.request(await secondShopSession(b), 'POST', metaAccounts, own);
  expect(wrongSession.statusCode).toBe(404);
  expect(wrongSession.json()).toEqual(missing.json());
  await denyCustomMetaRole(b, own);
  await f.admin.pool.query(
    "update memberships set built_in_role='admin',role_id=null where id=$1",
    [b.membership],
  );
  const wrongUser = await f.request(b.member, 'POST', metaAccounts, own);
  expect(wrongUser.statusCode).toBe(404);
  expect(wrongUser.json()).toEqual(missing.json());

  const redemptions = await Promise.all([
    f.request(b.owner, 'POST', metaAccounts, own),
    f.request(b.owner, 'POST', metaAccounts, own),
  ]);
  expect(redemptions.map(({ statusCode }) => statusCode).sort()).toEqual([201, 404]);
  const authorized = redemptions.find(({ statusCode }) => statusCode === 201)!;
  expect(authorized.json()).toEqual({
    selectionId: expect.stringMatching(/^[a-zA-Z0-9_-]{43}$/),
    pages: [
      { id: '1001001', name: 'রিনার দোকান', instagram: { id: '1002001', name: 'rinas_shop' } },
      { id: '1001002', name: 'করিমের দোকান', instagram: null },
    ],
  });
  await expectMetaCredentialEncrypted(b, authorized.json().selectionId);
  expect((await f.request(b.owner, 'POST', metaAccounts, own)).statusCode).toBe(404);
  const aAccounts = await success(a, 'POST', metaAccounts, 201, foreign);
  await expectMetaCredentialEncrypted(a, aAccounts.json().selectionId);

  const rejectedCode = 'rejected-test-authorization-code';
  const invalid = await metaGrant(b);
  const rejected = await f.request(b.owner, 'POST', metaAccounts, {
    ...invalid,
    code: rejectedCode,
  });
  expect(rejected.statusCode).toBe(400);
  expect(rejected.json().error.code).toBe('META_LOGIN_REJECTED');
  expect(logs.contents()).toContain('Request completed');
  const sensitive = [
    own.state!,
    own.code!,
    rejectedCode,
    'fake-meta-user-credential',
    'fake-rina-page-credential',
    'fake-karim-page-credential',
  ];
  for (const value of sensitive) {
    expect(authorized.body).not.toContain(value);
    expect(rejected.body).not.toContain(value);
    expect(logs.contents()).not.toContain(value);
  }
});

fixture('GET /areas', async () => {
  const { a, b } = await pair();
  const own = (await success(a, 'GET', '/areas?parentId=3', 200)).json();
  expect(own.items).toContainEqual(
    expect.objectContaining({ id: 301, nameBn: 'ঢাকা', kind: 'district' }),
  );
  expect((await success(b, 'GET', '/areas?parentId=3', 200)).json()).toEqual(own);
  expect((await f.request(b.member, 'GET', '/areas?parentId=3')).statusCode).toBe(200);
  const upazilas = (await success(a, 'GET', '/areas?parentId=301', 200)).json();
  expect(upazilas.items).toContainEqual({
    id: 30260072,
    kind: 'upazila',
    parentId: 301,
    name: 'Savar',
    nameBn: 'সাভার',
  });
});
async function knowledgeItem(shop: Shop, answer: string) {
  return (await success(shop, 'POST', '/knowledge-items', 201, { kind: 'policy', answer })).json()
    .id as string;
}
fixture('POST /knowledge-items', async () => {
  const { a, b } = await pair();
  const foreign = await knowledgeItem(a, 'ঢাকায় ৬০ টাকা।');
  const before = await f.row('knowledge_items', foreign);
  const own = await knowledgeItem(b, 'ঢাকার বাইরে ১২০ টাকা।');
  expect((await f.row('knowledge_items', own)).store_id).toBe(b.id);
  expect(await f.row('knowledge_items', foreign)).toEqual(before);
  expect(
    (
      await f.request(b.member, 'POST', '/knowledge-items', {
        kind: 'policy',
        answer: 'বন্ধের সময় রাত আটটা।',
      })
    ).statusCode,
  ).toBe(403);
});
fixture('POST /knowledge-items/uploads', async () => {
  const { a, b } = await pair();
  const url = '/knowledge-items/uploads';
  const metadata = { contentType: 'text/plain', sizeBytes: 40 };
  const foreign = (await success(a, 'POST', url, 201, metadata)).json();
  const before = await f.row('files', foreign.fileId);

  expect((await f.request(b.member, 'POST', url, metadata)).statusCode).toBe(403);
  await f.admin.pool.query(
    "update memberships set built_in_role = 'admin' where store_id = $1 and user_id = $2",
    [b.id, b.member.id],
  );
  const res = await f.request(b.member, 'POST', url, metadata);
  expect(res.statusCode, res.body).toBe(201);
  const { fileId, uploadUrl } = res.json();
  const objectKey = `stores/${b.id}/knowledge/${fileId}`;
  expect(new URL(uploadUrl).pathname).toContain(objectKey);
  expect(await f.row('files', fileId)).toMatchObject({
    store_id: b.id,
    object_key: objectKey,
    purpose: 'knowledge_file',
    status: 'pending',
  });
  await success(b, 'POST', '/knowledge-items', 201, { kind: 'file', fileId });
  await hidden(
    b,
    'POST',
    () => '/knowledge-items',
    foreign.fileId,
    (id) => ({
      kind: 'file',
      fileId: id,
    }),
  );
  expect(await f.row('files', foreign.fileId)).toEqual(before);
});
fixture('GET /knowledge-items', async () => {
  const { a, b } = await pair();
  const first = await knowledgeItem(a, 'ঢাকায় ৬০ টাকা।');
  const second = await knowledgeItem(b, 'ঢাকার বাইরে ১২০ টাকা।');
  expect((await success(a, 'GET', '/knowledge-items', 200)).json().items).toMatchObject([
    { id: first },
  ]);
  expect((await success(b, 'GET', '/knowledge-items', 200)).json().items).toMatchObject([
    { id: second },
  ]);
});
fixture('GET /knowledge-items/:knowledgeItemId', async () => {
  const { a, b } = await pair();
  const id = await knowledgeItem(a, 'ঢাকায় ৬০ টাকা।');
  expect((await success(a, 'GET', `/knowledge-items/${id}`, 200)).json().answer).toBe(
    'ঢাকায় ৬০ টাকা।',
  );
  await hidden(b, 'GET', (value) => `/knowledge-items/${value}`, id);
});
for (const method of ['PATCH', 'DELETE'] as const)
  fixture(`${method} /knowledge-items/:knowledgeItemId`, async () => {
    const { a, b } = await pair();
    const foreign = await knowledgeItem(a, 'ঢাকায় ৬০ টাকা।');
    const own = await knowledgeItem(b, 'ঢাকার বাইরে ১২০ টাকা।');
    const before = await f.row('knowledge_items', foreign);
    const url = (id: string) => `/knowledge-items/${id}`;
    const body = method === 'PATCH' ? { answer: 'ঢাকার বাইরে ১৫০ টাকা।' } : undefined;
    const response = await success(b, method, url(own), method === 'PATCH' ? 200 : 204, body);
    if (body) expect(response.json()).toMatchObject(body);
    else expect(await f.row('knowledge_items', own)).toBeUndefined();
    await hidden(b, method, url, foreign, body ? () => body : undefined);
    expect(await f.row('knowledge_items', foreign)).toEqual(before);
  });
fixture('POST /contacts/:contactId/consents', async () => {
  const { a, b } = await pair(),
    id = await contact(a);
  const answer = { channel: 'sms', status: 'granted', note: 'দোকানে এসে রাজি হয়েছেন' };
  const own = await success(a, 'POST', `/contacts/${id}/consents`, 201, answer);
  expect(own.json()).toMatchObject({ contactId: id, status: 'granted', source: 'manual' });
  await hidden(
    b,
    'POST',
    (value) => `/contacts/${value}/consents`,
    id,
    () => ({ ...answer, status: 'withdrawn' }),
  );
  const rows = await f.admin.pool.query(
    'select id, store_id, status from consents where contact_id=$1',
    [id],
  );
  expect(rows.rows).toEqual([{ id: own.json().id, store_id: a.id, status: 'granted' }]);
});
async function customerImport(shop: Shop) {
  const result = await success(shop, 'POST', '/imports', 201, { sizeBytes: 120 });
  expect(result.json().uploadUrl).toContain(`/imports/${shop.id}/`);
  return result.json().importId as string;
}
const startImport = { mapping: { phone: 0 }, duplicateMode: 'update', consentEvidence: {} };
fixture('POST /imports', async () => {
  const { a, b } = await pair(),
    id = await customerImport(a),
    before = await f.row('imports', id);
  const own = await customerImport(b);
  expect((await f.row('imports', own)).store_id).toBe(b.id);
  expect(await f.row('imports', id)).toEqual(before);
});
fixture('POST /imports/:importId/start', async () => {
  const { a, b } = await pair(),
    own = await customerImport(a),
    foreign = await customerImport(a);
  const started = await success(a, 'POST', `/imports/${own}/start`, 202, startImport);
  expect(started.json()).toMatchObject({ id: own, status: 'importing' });
  const before = await f.row('imports', foreign);
  await hidden(
    b,
    'POST',
    (id) => `/imports/${id}/start`,
    foreign,
    () => startImport,
  );
  expect(await f.row('imports', foreign)).toEqual(before);
});
fixture('POST /imports/:importId/undo', async () => {
  const { a, b } = await pair(),
    id = await customerImport(a);
  await f.admin.pool.query("update imports set status='done', finished_at=now() where id=$1", [id]);
  const before = await f.row('imports', id);
  await hidden(b, 'POST', (value) => `/imports/${value}/undo`, id);
  expect(await f.row('imports', id)).toEqual(before);
  const undone = await success(a, 'POST', `/imports/${id}/undo`, 202);
  expect(undone.json()).toMatchObject({ id, status: 'undone' });
});
fixture('GET /imports/:importId', async () => {
  const { a, b } = await pair(),
    id = await customerImport(a);
  expect((await success(a, 'GET', `/imports/${id}`, 200)).json()).toMatchObject({
    id,
    status: 'uploaded',
  });
  await hidden(b, 'GET', (value) => `/imports/${value}`, id);
});
const dhaka = {
  match: 'all',
  conditions: [{ field: 'district', operator: 'is_any_of', values: ['ঢাকা'] }],
};
async function segment(shop: Shop) {
  const input = { name: `ঢাকা ${randomUUID()}`, rules: dhaka };
  return (await success(shop, 'POST', '/segments', 201, input)).json().id as string;
}
async function dhakaContact(shop: Shop) {
  const id = await contact(shop);
  await f.admin.pool.query("update contacts set district='ঢাকা' where id=$1", [id]);
}
fixture('GET /segments', async () => {
  const { a, b } = await pair(),
    aId = await segment(a),
    bId = await segment(b);
  const ids = (await success(b, 'GET', '/segments', 200))
    .json()
    .items.map((item: { id: string }) => item.id);
  expect(ids).toEqual([bId]);
  expect((await success(a, 'GET', '/segments', 200)).json().items[0].id).toBe(aId);
});
fixture('POST /segments', async () => {
  const { a, b } = await pair(),
    id = await segment(a),
    before = await f.row('segments', id);
  const own = await segment(b);
  expect((await f.row('segments', own)).store_id).toBe(b.id);
  expect(await f.row('segments', id)).toEqual(before);
});
fixture('POST /segments/preview', async () => {
  const { a, b } = await pair();
  await dhakaContact(a);
  await dhakaContact(a);
  await dhakaContact(b);
  const count = async (shop: Shop) =>
    (await success(shop, 'POST', '/segments/preview', 200, { rules: dhaka })).json().count;
  expect(await count(a)).toBe(2);
  expect(await count(b)).toBe(1);
});
for (const method of ['PATCH', 'DELETE'] as const)
  fixture(`${method} /segments/:segmentId`, async () => {
    const { a, b } = await pair(),
      own = await segment(b),
      foreign = await segment(a);
    const payload = method === 'PATCH' ? { name: 'নতুন নাম' } : undefined;
    await success(b, method, `/segments/${own}`, method === 'DELETE' ? 204 : 200, payload);
    const changed = await f.row('segments', own);
    if (method === 'DELETE') expect(changed).toBeUndefined();
    else expect(changed).toMatchObject({ name: 'নতুন নাম' });
    const before = await f.row('segments', foreign);
    await hidden(
      b,
      method,
      (id) => `/segments/${id}`,
      foreign,
      () => payload ?? {},
    );
    expect(await f.row('segments', foreign)).toEqual(before);
  });
const welcome = {
  trigger: { key: 'consent_given', filters: [] },
  reEntry: { rule: 'once' },
  workflowFilters: [],
  goal: { kind: 'placed_order' },
  exitConditions: [],
  firstStepKey: 'welcome',
  steps: {
    welcome: {
      kind: 'send',
      category: 'marketing',
      channels: ['sms'],
      message: { text: 'আমাদের সাথে থাকার জন্য ধন্যবাদ!', buttons: [] },
      ifNotReachable: 'skip',
      reviewBeforeSending: false,
      next: 'end',
    },
    end: { kind: 'exit' },
  },
};
async function automation(shop: Shop) {
  const input = { name: `স্বাগতম ${randomUUID()}`, graph: welcome };
  return (await success(shop, 'POST', '/automations', 201, input)).json().id as string;
}
async function publishedAutomation(shop: Shop) {
  const id = await automation(shop);
  const versionId = (await success(shop, 'POST', `/automations/${id}/publish`, 200)).json()
    .publishedVersionId as string;
  return { id, versionId };
}
fixture('GET /automations', async () => {
  const { a, b } = await pair(),
    aId = await automation(a),
    bId = await automation(b);
  const ids = (await success(b, 'GET', '/automations', 200))
    .json()
    .items.map((item: { id: string }) => item.id);
  expect(ids).toEqual([bId]);
  expect((await success(a, 'GET', '/automations', 200)).json().items[0]).toMatchObject({
    id: aId,
    enteredLast30Days: 0,
    trigger: 'consent_given',
    channels: ['sms'],
  });
});
fixture('POST /automations', async () => {
  const { a, b } = await pair(),
    id = await automation(a),
    before = await f.row('automations', id);
  const response = await success(b, 'POST', '/automations', 201, {
    name: 'Birthday template',
    templateKey: 'birthday',
  });
  expect(response.json()).toMatchObject({
    templateKey: 'birthday',
    graph: { trigger: { key: 'birthday' }, firstStepKey: 'morning' },
  });
  expect((await f.row('automations', response.json().id)).store_id).toBe(b.id);
  expect(await f.row('automations', id)).toEqual(before);
});
fixture('GET /automations/:automationId', async () => {
  const { a, b } = await pair(),
    { id, versionId } = await publishedAutomation(a);
  const contactId = randomUUID();
  await f.admin.pool.query(
    "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','customer')",
    [contactId, a.id],
  );
  await f.admin.pool.query(
    `insert into automation_runs(id,store_id,automation_id,version_id,contact_id,trigger_key,current_step_key,status,wake_at)
     values($5,$1,$2,$3,$4,'waiting','welcome','waiting',now()+interval '1 day'),
           ($6,$1,$2,$3,$4,'finished','end','done',null)`,
    [a.id, id, versionId, contactId, randomUUID(), randomUUID()],
  );
  const own = (await success(a, 'GET', `/automations/${id}`, 200)).json();
  expect(own.versions.map((version: { id: string }) => version.id)).toEqual([versionId]);
  expect(own.activeRuns).toBe(1);
  await hidden(b, 'GET', (value) => `/automations/${value}`, id);
});
fixture('GET /automations/:automationId/trigger-preview', async () => {
  const { a, b } = await pair();
  const addGrants = async (shop: Shop) => {
    const contactId = randomUUID();
    const eventIds = Array.from({ length: 12 }, () => randomUUID());
    const now = Date.now();
    for (const [index, id] of eventIds.entries()) {
      await f.admin.pool.query(
        `insert into outbox_events(id,store_id,type,payload,occurred_at)
         values($1,$2,'consent.changed',$3,$4)`,
        [
          id,
          shop.id,
          { contactId, channel: 'sms', status: 'granted', source: 'manual' },
          new Date(now - index * 1000),
        ],
      );
    }
    await f.admin.pool.query(
      `insert into outbox_events(id,store_id,type,payload,occurred_at)
       values($1,$2,'consent.changed',$3,$4)`,
      [
        randomUUID(),
        shop.id,
        { contactId, channel: 'sms', status: 'granted', source: 'import' },
        new Date(now),
      ],
    );
    return eventIds.slice(0, 10);
  };
  const [aId, bId, aEvents, bEvents] = await Promise.all([
    automation(a),
    automation(b),
    addGrants(a),
    addGrants(b),
  ]);
  const path = (id: string) => `/automations/${id}/trigger-preview`;
  for (const [shop, id, ids] of [
    [a, aId, aEvents],
    [b, bId, bEvents],
  ] as const) {
    const response = await success(shop, 'GET', path(id), 200);
    expect(response.json().items.map((item: { id: string }) => item.id)).toEqual(ids);
  }
  await hidden(b, 'GET', path, aId);
});
// Each action runs on a workflow in the status it starts from.
for (const [method, action, status, start, expected] of [
  ['PATCH', '', 200, 'draft', { name: 'নতুন নাম' }],
  ['POST', '/publish', 200, 'draft', { status: 'active' }],
  ['POST', '/pause', 200, 'active', { status: 'paused' }],
  ['POST', '/enable', 200, 'paused', { status: 'active' }],
  ['POST', '/archive', 204, 'active', { status: 'archived' }],
] as const)
  fixture(`${method} /automations/:automationId${action}`, async () => {
    const { a, b } = await pair();
    const prepare = async (shop: Shop) => {
      const id = start === 'draft' ? await automation(shop) : (await publishedAutomation(shop)).id;
      if (start === 'paused') await success(shop, 'POST', `/automations/${id}/pause`, 200);
      return id;
    };
    const own = await prepare(b),
      foreign = await prepare(a);
    const payload = method === 'PATCH' ? { name: 'নতুন নাম' } : undefined;
    await success(b, method, `/automations/${own}${action}`, status, payload);
    expect(await f.row('automations', own)).toMatchObject(expected);
    const before = await f.row('automations', foreign);
    await hidden(
      b,
      method,
      (id) => `/automations/${id}${action}`,
      foreign,
      () => payload ?? {},
    );
    expect(await f.row('automations', foreign)).toEqual(before);
  });
fixture('POST /automations/:automationId/versions/:versionId/stop', async () => {
  const { a, b } = await pair();
  const stopOld = async (shop: Shop) => {
    const { id, versionId } = await publishedAutomation(shop);
    await success(shop, 'POST', `/automations/${id}/publish`, 200);
    return { id, versionId };
  };
  const own = await stopOld(b),
    foreign = await stopOld(a);
  await success(b, 'POST', `/automations/${own.id}/versions/${own.versionId}/stop`, 204);
  expect(await f.row('automation_versions', own.versionId)).toMatchObject({ is_stopped: true });
  await hidden(
    b,
    'POST',
    (id) => `/automations/${id}/versions/${foreign.versionId}/stop`,
    foreign.id,
  );
  await hidden(b, 'POST', (id) => `/automations/${own.id}/versions/${id}/stop`, foreign.versionId);
  expect(await f.row('automation_versions', foreign.versionId)).toMatchObject({
    is_stopped: false,
  });
});
async function campaign(shop: Shop) {
  const input = { name: 'ঈদের অফার', channel: 'sms', content: { text: 'ঈদে ২০% ছাড়' } };
  return (await success(shop, 'POST', '/campaigns', 201, input)).json().id as string;
}
fixture('GET /campaigns', async () => {
  const { a, b } = await pair(),
    aId = await campaign(a),
    bId = await campaign(b);
  const ids = (await success(b, 'GET', '/campaigns', 200))
    .json()
    .items.map((item: { id: string }) => item.id);
  expect(ids).toEqual([bId]);
  expect((await success(a, 'GET', '/campaigns', 200)).json().items[0].id).toBe(aId);
});
fixture('POST /campaigns', async () => {
  const { a, b } = await pair(),
    id = await campaign(a),
    before = await f.row('campaigns', id);
  const own = await campaign(b);
  expect((await f.row('campaigns', own)).store_id).toBe(b.id);
  expect(await f.row('campaigns', id)).toEqual(before);
});
fixture('GET /campaigns/:campaignId', async () => {
  const { a, b } = await pair(),
    id = await campaign(a);
  expect((await success(a, 'GET', `/campaigns/${id}`, 200)).json().id).toBe(id);
  await hidden(b, 'GET', (value) => `/campaigns/${value}`, id);
});
for (const method of ['PATCH', 'DELETE'] as const)
  fixture(`${method} /campaigns/:campaignId`, async () => {
    const { a, b } = await pair(),
      own = await campaign(b),
      foreign = await campaign(a);
    const payload = method === 'PATCH' ? { name: 'শীতের অফার' } : undefined;
    await success(b, method, `/campaigns/${own}`, method === 'DELETE' ? 204 : 200, payload);
    const changed = await f.row('campaigns', own);
    if (method === 'DELETE') expect(changed).toBeUndefined();
    else expect(changed).toMatchObject({ name: 'শীতের অফার' });
    const before = await f.row('campaigns', foreign);
    await hidden(
      b,
      method,
      (id) => `/campaigns/${id}`,
      foreign,
      () => payload ?? {},
    );
    expect(await f.row('campaigns', foreign)).toEqual(before);
  });
// A draft to one consented Dhaka customer, with the credits to send it.
async function approvableCampaign(shop: Shop) {
  const contactId = await contact(shop);
  await f.admin.pool.query("update contacts set district='ঢাকা' where id=$1", [contactId]);
  const answer = { channel: 'sms', status: 'granted', note: 'দোকানে এসে রাজি হয়েছেন' };
  await success(shop, 'POST', `/contacts/${contactId}/consents`, 201, answer);
  await smsCredits(shop, 5);
  const input = {
    name: 'ঈদের অফার',
    channel: 'sms',
    content: { text: 'ঈদে ২০% ছাড়' },
    includeSegmentIds: [await segment(shop)],
  };
  return (await success(shop, 'POST', '/campaigns', 201, input)).json().id as string;
}
fixture('GET /campaigns/:campaignId/estimate', async () => {
  const { a, b } = await pair(),
    id = await approvableCampaign(a);
  const estimate = (await success(a, 'GET', `/campaigns/${id}/estimate`, 200)).json();
  expect(estimate).toMatchObject({ audienceCount: 1, recipientsCount: 1, smsCredits: 1 });
  await hidden(b, 'GET', (value) => `/campaigns/${value}/estimate`, id);
});
fixture('POST /campaigns/:campaignId/approve', async () => {
  const { a, b } = await pair(),
    own = await approvableCampaign(b),
    foreign = await approvableCampaign(a);
  await f.admin.pool.query("update memberships set built_in_role='marketer' where id=$1", [
    b.membership,
  ]);
  const marketer = await f.request(b.member, 'POST', `/campaigns/${own}/approve`);
  expect(marketer.statusCode).toBe(403);
  expect(marketer.json().error.code).toBe('CAMPAIGN_APPROVAL_DENIED');
  expect((await success(b, 'POST', `/campaigns/${own}/approve`, 200)).json().status).toBe(
    'sending',
  );
  const before = await f.row('campaigns', foreign);
  await hidden(b, 'POST', (id) => `/campaigns/${id}/approve`, foreign);
  expect(await f.row('campaigns', foreign)).toEqual(before);
  const recipients = await f.admin.pool.query(
    'select store_id from campaign_recipients where campaign_id=any($1::uuid[])',
    [[own, foreign]],
  );
  expect(recipients.rows).toEqual([{ store_id: b.id }]);
});
// An approved campaign in the given state: scheduled for tomorrow, sending, or paused by hand.
async function campaignIn(shop: Shop, status: 'scheduled' | 'sending' | 'paused') {
  const id = await approvableCampaign(shop);
  if (status === 'scheduled')
    await success(shop, 'PATCH', `/campaigns/${id}`, 200, {
      scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  await success(shop, 'POST', `/campaigns/${id}/approve`, 200);
  if (status === 'paused') await success(shop, 'POST', `/campaigns/${id}/pause`, 200);
  return id;
}
for (const [action, from, to] of [
  ['unschedule', 'scheduled', 'draft'],
  ['cancel', 'scheduled', 'cancelled'],
  ['pause', 'sending', 'paused'],
  ['resume', 'paused', 'sending'],
] as const)
  fixture(`POST /campaigns/:campaignId/${action}`, async () => {
    const { a, b } = await pair(),
      own = await campaignIn(b, from),
      foreign = await campaignIn(a, from);
    expect((await success(b, 'POST', `/campaigns/${own}/${action}`, 200)).json().status).toBe(to);
    const before = await f.row('campaigns', foreign);
    await hidden(b, 'POST', (id) => `/campaigns/${id}/${action}`, foreign);
    expect(await f.row('campaigns', foreign)).toEqual(before);
  });
for (const [path, table, create] of [
  ['roles', 'roles', role],
  ['members', 'memberships', async (shop: Shop) => shop.membership],
] as const) {
  fixture(`GET /${path}`, async () => {
    const { a, b } = await pair(),
      aId = await create(a),
      bId = await create(b);
    const own = (await success(a, 'GET', `/${path}`, 200)).json().items;
    expect(own.map((item: { id: string }) => item.id)).toContain(aId);
    const other = (await success(b, 'GET', `/${path}`, 200)).json().items;
    expect(other.map((item: { id: string }) => item.id)).toContain(bId);
    expect(other.map((item: { id: string }) => item.id)).not.toContain(aId);
    if (path === 'members')
      expect(other.map((item: { id: string }) => item.id)).not.toContain(a.ownerMembership);
  });
  for (const method of ['PATCH', 'DELETE'] as const)
    fixture(`${method} /${path}/:${path === 'roles' ? 'roleId' : 'membershipId'}`, async () => {
      const positive = await f.shop(),
        { a, b } = await pair();
      const positiveId = await create(positive),
        foreignId = await create(a);
      const change = path === 'roles' ? { name: 'নতুন নাম' } : { builtInRole: 'marketer' };
      const payload = method === 'PATCH' ? change : undefined;
      await success(
        positive,
        method,
        `/${path}/${positiveId}`,
        method === 'DELETE' ? 204 : 200,
        payload,
      );
      const changed = await f.row(table, positiveId);
      if (path === 'roles' && method === 'DELETE') expect(changed).toBeUndefined();
      else {
        const changedFields =
          path === 'roles' ? { name: 'নতুন নাম' } : { built_in_role: 'marketer' };
        expect(changed).toMatchObject(method === 'DELETE' ? { status: 'removed' } : changedFields);
      }
      const before = await f.row(table, foreignId);
      await hidden(
        b,
        method,
        (id) => `/${path}/${id}`,
        foreignId,
        () => payload ?? {},
      );
      expect(await f.row(table, foreignId)).toEqual(before);
    });
}
fixture('POST /roles', async () => {
  const { a, b } = await pair(),
    id = await role(a),
    before = await f.row('roles', id),
    own = await role(b);
  expect((await f.row('roles', own)).store_id).toBe(b.id);
  expect(await f.row('roles', id)).toEqual(before);
});
fixture('POST /members/invites', async () => {
  const { a, b } = await pair(),
    roleA = await role(a),
    before = await f.row('roles', roleA);
  const input = { phone: phone(), roleId: roleA };
  const invited = await success(a, 'POST', '/members/invites', 201, input);
  expect(invited.json()).toMatchObject({ roleId: roleA, status: 'invited' });
  await hidden(
    b,
    'POST',
    () => '/members/invites',
    roleA,
    (roleId) => ({ ...input, roleId }),
  );
  expect(await f.row('roles', roleA)).toEqual(before);
  expect((await success(b, 'GET', '/members', 200)).json().items).toHaveLength(2);
});
fixture('POST /members/invites/:membershipId/resend', async () => {
  const { a, b } = await pair();
  const id = randomUUID();
  await f.admin.pool.query(
    "insert into memberships(id,store_id,built_in_role,status,invite_phone,invite_token_hash,invite_expires_at) values($1,$2,'support_agent','invited',$3,$4,now()+interval '1 day')",
    [id, a.id, phone(), randomBytes(32)],
  );
  const beforeResend = await f.row('memberships', id);
  await success(a, 'POST', `/members/invites/${id}/resend`, 200, {});
  const before = await f.row('memberships', id);
  expect(before.invite_token_hash).not.toEqual(beforeResend.invite_token_hash);
  await hidden(
    b,
    'POST',
    (value) => `/members/invites/${value}/resend`,
    id,
    () => ({}),
  );
  expect(await f.row('memberships', id)).toEqual(before);
});
fixture('GET /store', async () => {
  const { a, b } = await pair();
  expect((await success(a, 'GET', '/store', 200)).json().id).toBe(a.id);
  expect((await success(b, 'GET', '/store', 200)).json().id).toBe(b.id);
});
const shopSending = {
  quietHours: { startHour: 22, endHour: 8 },
  frequencyCap: { perChannelPerDay: 2, perSevenDays: 5 },
  onlyOwnersAndAdminsApprove: false,
};
for (const [path, payload, expected] of [
  [
    '/store',
    { name: 'রিনার দোকান', sending: shopSending },
    { name: 'রিনার দোকান', sending: shopSending },
  ],
  ['/store/extensions', { extensions: ['chats'] }, { extensions: ['chats'] }],
] as const)
  fixture(`PATCH ${path}`, async () => {
    const { a, b } = await pair();
    expect((await success(a, 'PATCH', path, 200, payload)).json()).toMatchObject({
      id: a.id,
      ...expected,
    });
    const before = await f.row('stores', a.id);
    expect((await success(b, 'PATCH', path, 200, payload)).json()).toMatchObject({
      id: b.id,
      ...expected,
    });
    expect(await f.row('stores', a.id)).toEqual(before);
  });
for (const route of ['POST /store/ownership-transfer/code', 'POST /store/ownership-transfer'])
  fixture(route, async () => {
    const { a, b } = await pair();
    if (route.endsWith('/code'))
      await success(a, 'POST', '/store/ownership-transfer/code', 204, {
        membershipId: a.membership,
      });
    else expect(await f.transfer(a)).toBeTruthy();
    await success(b, 'POST', '/store/ownership-transfer/code', 204, { membershipId: b.membership });
    const code = f.code(b.owner);
    const before = await f.row('memberships', a.membership);
    await hidden(
      b,
      'POST',
      () => route.slice(5),
      a.membership,
      (membershipId) => (route.endsWith('/code') ? { membershipId } : { membershipId, code }),
    );
    expect(await f.row('memberships', a.membership)).toEqual(before);
    expect((await success(b, 'GET', '/store/ownership-transfer', 200)).json()).toEqual({
      transfer: null,
    });
  });
fixture('GET /store/ownership-transfer', async () => {
  const { a, b } = await pair(),
    aId = await f.transfer(a),
    bId = await f.transfer(b);
  expect((await success(a, 'GET', '/store/ownership-transfer', 200)).json().transfer.id).toBe(aId);
  expect((await success(b, 'GET', '/store/ownership-transfer', 200)).json().transfer.id).toBe(bId);
});
for (const accept of [false, true])
  fixture(
    accept
      ? 'POST /store/ownership-transfer/accept'
      : 'DELETE /store/ownership-transfer/:transferId',
    async () => {
      const positive = await f.shop(),
        { a, b } = await pair();
      const positiveId = await f.transfer(positive),
        id = await f.transfer(a);
      const url = (value: string) =>
        accept ? '/store/ownership-transfer/accept' : `/store/ownership-transfer/${value}`;
      const payload = (value: string) => (accept ? { transferId: value } : {});
      const method = accept ? 'POST' : 'DELETE';
      const result = await f.request(
        accept ? positive.member : positive.owner,
        method,
        url(positiveId),
        payload(positiveId),
      );
      expect(result.statusCode, result.body).toBe(accept ? 200 : 204);
      expect(await f.row('ownership_transfers', positiveId)).toMatchObject({
        status: accept ? 'accepted' : 'cancelled',
      });
      const before = await f.row('ownership_transfers', id),
        memberBefore = await f.row('memberships', a.membership);
      await hidden(b, method, url, id, payload);
      expect(await f.row('ownership_transfers', id)).toEqual(before);
      expect(await f.row('memberships', a.membership)).toEqual(memberBefore);
    },
  );
fixture('GET /support-access', async () => {
  const { a, b } = await pair(),
    aGrant = await f.grant(a),
    bGrant = await f.grant(b);
  expect(
    (await success(a, 'GET', '/support-access', 200))
      .json()
      .items.map((item: { id: string }) => item.id),
  ).toEqual([aGrant.id]);
  expect(
    (await success(b, 'GET', '/support-access', 200))
      .json()
      .items.map((item: { id: string }) => item.id),
  ).toEqual([bGrant.id]);
});
for (const action of ['code', 'approve', 'deny', 'end'])
  fixture(`POST /support-access/:id/${action}`, async () => {
    const positive = await f.shop(),
      { a, b } = await pair(),
      grant = await f.grant(positive, action !== 'code'),
      foreign = await f.grant(a);
    if (action === 'end') {
      await success(positive, 'POST', `/support-access/${grant.id}/approve`, 201, {
        code: f.code(positive.owner),
      });
      await success(a, 'POST', `/support-access/${foreign.id}/approve`, 201, {
        code: f.code(a.owner),
      });
    }
    const payload = action === 'approve' ? { code: f.code(positive.owner) } : {};
    await success(positive, 'POST', `/support-access/${grant.id}/${action}`, 201, payload);
    if (action !== 'code')
      expect(await f.row('support_grants', grant.id)).toMatchObject({
        status: { approve: 'approved', deny: 'denied', end: 'ended' }[action],
      });
    else expect(f.code(positive.owner)).toMatch(/^\d{6}$/);
    let foreignPayload = payload;
    if (action === 'approve') {
      await f.grant(b);
      foreignPayload = { code: f.code(b.owner) };
    }
    const before = await f.row('support_grants', foreign.id);
    await hidden(
      b,
      'POST',
      (value) => `/support-access/${value}/${action}`,
      foreign.id,
      () => foreignPayload,
    );
    expect(await f.row('support_grants', foreign.id)).toEqual(before);
  });
fixture('GET /support/session', async () => {
  const { a, b } = await pair(),
    supportA = await f.support(a),
    supportB = await f.support(b);
  for (const [shop, cookie] of [
    [a, supportA],
    [b, supportB],
  ] as const) {
    const response = await f.request(cookie, 'GET', '/support/session');
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      storeName: `দোকান ${shop.id}`,
      status: 'approved',
      access: 'write',
    });
  }
});
fixture('GET /support/customers/:id', async () => {
  const { a, b } = await pair(),
    id = await contact(a),
    supportA = await f.support(a),
    supportB = await f.support(b);
  const own = await f.request(supportA, 'GET', `/support/customers/${id}`);
  expect(own.statusCode, own.body).toBe(200);
  expect(own.json().id).toBe(id);
  const foreign = await f.request(supportB, 'GET', `/support/customers/${id}`),
    absent = await f.request(supportB, 'GET', `/support/customers/${randomUUID()}`);
  expect(foreign.statusCode, foreign.body).toBe(404);
  expect(absent.statusCode, absent.body).toBe(404);
  expect(foreign.json()).toEqual(absent.json());
});
fixture('POST /support/customers', async () => {
  const { a, b } = await pair(),
    supportA = await f.support(a),
    supportB = await f.support(b);
  const input = { name: 'করিম', phone: phone() };
  const own = await f.request(supportA, 'POST', '/support/customers', input);
  expect(own.statusCode, own.body).toBe(201);
  const before = await f.row('contacts', own.json().id);
  const other = await f.request(supportB, 'POST', '/support/customers', input);
  expect(other.statusCode, other.body).toBe(201);
  expect((await f.row('contacts', other.json().id)).store_id).toBe(b.id);
  expect(await f.row('contacts', own.json().id)).toEqual(before);
});
async function notification(shop: Shop) {
  await app.get(NotificationsService).notify(shop.id, {
    type: 'conversation.handed_over',
    category: 'fix_now',
    dedupeKey: randomUUID(),
    recipientPermission: 'chats.view',
    title: 'একটি চ্যাট দেখুন',
  });
  const result = await f.admin.pool.query(
    'select id from notifications where store_id=$1 and user_id=$2 order by id desc limit 1',
    [shop.id, shop.owner.id],
  );
  return result.rows[0].id as string;
}
async function enableSavedReplies(shop: Shop) {
  await success(shop, 'PATCH', '/store/extensions', 200, { extensions: ['chats'] });
}

async function savedReply(shop: Shop, shortcut: string) {
  const result = await success(shop, 'POST', '/saved-replies', 201, {
    title: 'ঢাকার ভেতরে',
    body: 'ঢাকায় ডেলিভারি চার্জ ৬০ টাকা।',
    shortcut,
  });
  return result.json().id as string;
}

async function savedReplyAudit(shop: Shop, id: string) {
  const { rows } = await f.admin.pool.query(
    `select action, actor_user_id, "after" from audit_log
     where store_id = $1 and entity_type = 'saved_reply' and entity_id = $2 order by action`,
    [shop.id, id],
  );
  return rows;
}

fixture('GET /saved-replies', async () => {
  const { a, b } = await pair();
  expect((await f.request(b.owner, 'GET', '/saved-replies')).statusCode).toBe(403);
  await enableSavedReplies(a);
  await enableSavedReplies(b);
  await savedReply(a, 'delivery');
  const own = await savedReply(b, 'delivery');
  const result = await success(b, 'GET', '/saved-replies', 200);
  expect(result.json()).toMatchObject({
    items: [{ id: own, shortcut: 'delivery', body: 'ঢাকায় ডেলিভারি চার্জ ৬০ টাকা।' }],
    nextCursor: null,
  });
  const { id: roleId } = (
    await success(b, 'POST', '/roles', 201, {
      name: 'Read saved replies',
      permissions: { ...permissions, areas: { chats: 'view' } },
    })
  ).json();
  await f.admin.pool.query(
    'update memberships set built_in_role = null, role_id = $1 where id = $2',
    [roleId, b.membership],
  );
  expect((await f.request(b.member, 'GET', '/saved-replies')).statusCode).toBe(200);
  const writeRequests = [
    ['POST', '/saved-replies', { title: 'Delivery', body: '60 taka' }],
    ['PATCH', `/saved-replies/${own}`, { title: 'Changed' }],
    ['DELETE', `/saved-replies/${own}`, undefined],
  ] as const;
  for (const [method, url, payload] of writeRequests)
    expect((await f.request(b.member, method, url, payload)).statusCode).toBe(403);
  await f.admin.pool.query(
    "update memberships set built_in_role = 'marketer', role_id = null where id = $1",
    [b.membership],
  );
  expect((await f.request(b.member, 'GET', '/saved-replies')).statusCode).toBe(403);
});

fixture('POST /saved-replies', async () => {
  const { a, b } = await pair();
  await enableSavedReplies(a);
  await enableSavedReplies(b);
  const reply = { title: 'Delivery', body: 'Delivery inside Dhaka is 60 taka.', shortcut: 'dhaka' };
  await success(a, 'POST', '/saved-replies', 201, reply);
  const result = await success(b, 'POST', '/saved-replies', 201, reply);
  expect(result.json()).toMatchObject(reply);
  await success(b, 'POST', '/saved-replies', 409, reply);
  await success(b, 'POST', '/saved-replies', 400, { ...reply, storeId: a.id });
  for (const field of ['title', 'body', 'shortcut'])
    await success(b, 'POST', '/saved-replies', 400, { ...reply, [field]: 'invalid\u0000text' });
  expect(await savedReplyAudit(b, result.json().id)).toEqual([
    {
      action: 'saved_reply.created',
      actor_user_id: b.owner.id,
      after: { changedFields: ['title', 'body', 'shortcut'] },
    },
  ]);
  expect(await f.row('saved_replies', result.json().id)).toMatchObject({
    created_by_user_id: b.owner.id,
  });
});

fixture('PATCH /saved-replies/:savedReplyId', async () => {
  const { a, b } = await pair();
  await enableSavedReplies(a);
  await enableSavedReplies(b);
  const foreign = await savedReply(a, 'delivery');
  const own = await savedReply(b, 'delivery');
  await savedReply(b, 'returns');
  const url = (id: string) => `/saved-replies/${id}`;
  await hidden(b, 'PATCH', url, foreign, () => ({ shortcut: null }));
  await success(b, 'PATCH', url(own), 409, { shortcut: 'returns' });
  await success(b, 'PATCH', url(own), 400, { body: 'invalid\u0000text' });
  const result = await success(b, 'PATCH', url(own), 200, {
    body: 'চার্জ ৭০ টাকা।',
    shortcut: null,
  });
  expect(result.json()).toMatchObject({ id: own, body: 'চার্জ ৭০ টাকা।', shortcut: null });
  expect(await f.row('saved_replies', foreign)).toMatchObject({ shortcut: 'delivery' });
  const audited = (await savedReplyAudit(b, own)).filter(
    ({ action }) => action === 'saved_reply.updated',
  );
  expect(audited).toEqual([
    {
      action: 'saved_reply.updated',
      actor_user_id: b.owner.id,
      after: { changedFields: ['body', 'shortcut'] },
    },
  ]);
});

fixture('DELETE /saved-replies/:savedReplyId', async () => {
  const { a, b } = await pair();
  await enableSavedReplies(a);
  await enableSavedReplies(b);
  const url = (id: string) => `/saved-replies/${id}`;
  const foreign = await savedReply(a, 'delivery');
  const own = await savedReply(b, 'delivery');
  await hidden(b, 'DELETE', url, foreign);
  await success(b, 'DELETE', url(own), 204);
  expect(await f.row('saved_replies', own)).toBeUndefined();
  expect(await f.row('saved_replies', foreign)).toMatchObject({ shortcut: 'delivery' });
  expect((await savedReplyAudit(b, own)).at(-1)).toEqual({
    action: 'saved_reply.deleted',
    actor_user_id: b.owner.id,
    after: null,
  });
});

fixture('GET /dashboard', async () => {
  const { a, b } = await pair();
  const reports = app.get(AnalyticsService);
  const shops = await Promise.all(
    (
      [
        [a, 2],
        [b, 7],
      ] as const
    ).map(async ([shop, count]) => ({ shop, count, ...(await reports.periods(shop.id, 7)) })),
  );
  for (const { shop, count, current, previous } of shops) {
    await f.admin.pool.query(
      `insert into store_daily_metrics (store_id,day,metric,dimension,value) values
       ($1,$2,'orders','',$4),($1,$3,'orders','',$4::bigint + 1),
       ($1,$2,'lifecycle','new',$4),
       ($1,$2,'sales','manual',$4::bigint * 10000),
       ($1,$2,'sales','order_link',$4::bigint * 5000),
       ($1,$3,'sales','manual',$4::bigint * 10000)`,
      [shop.id, current.through, previous.through, count],
    );
    await f.admin.pool.query(
      `with repeat_buyers as (
         select gen_random_uuid()::text as id from generate_series(1, 8 - $4::integer)
       )
       insert into store_daily_metrics (store_id,day,metric,dimension,value)
       select $1::uuid,$2::date,'buyer_activity',gen_random_uuid()::text,$2::date-date '1970-01-01'
       from generate_series(1,$4::integer)
       union all
       select $1,$2,'buyer_activity',id,$3::date-date '1970-01-01' from repeat_buyers
       union all
       select $1,$3,'buyer_activity',id,$3::date-date '1970-01-01' from repeat_buyers`,
      [shop.id, current.through, previous.through, count],
    );
  }
  for (const { shop, count, current, previous } of shops) {
    const result = await success(shop, 'GET', '/dashboard?period=7', 200);
    const { cards, lifecycle } = result.json();
    for (const key of ['orders', 'newCustomers', 'customersWhoCameBack'] as const) {
      const now = await reports[key](shop.id, current);
      const before = await reports[key](shop.id, previous);
      expect(cards[key]).toEqual({
        total: now.total.toString(),
        previous: before.total.toString(),
        points: now.points.map(({ value }) => value.toString()),
      });
    }
    const sales = await reports.sales(shop.id, current);
    const previousSales = await reports.sales(shop.id, previous);
    expect(cards.sales).toEqual({
      totalPoisha: sales.total.toString(),
      previousPoisha: previousSales.total.toString(),
      pointsPoisha: sales.points.map(({ value }) => value.toString()),
    });
    expect(cards.sales).toMatchObject({
      totalPoisha: String(count * 15000),
      previousPoisha: String(count * 10000),
    });
    expect(cards.orders).toMatchObject({ total: String(count), previous: String(count + 1) });
    expect(cards.newCustomers).toMatchObject({ total: String(count), previous: String(8 - count) });
    expect(cards.customersWhoCameBack).toMatchObject({ total: String(8 - count), previous: '0' });
    expect(lifecycle).toEqual(await reports.lifecycleCounts(shop.id, current));
    expect(lifecycle.new).toBe(count);
  }
  await f.admin.pool.query("update memberships set built_in_role='marketer' where id=$1", [
    a.membership,
  ]);
  const restricted = await f.request(a.member, 'GET', '/dashboard?period=7');
  expect(restricted.statusCode, restricted.body).toBe(200);
  expect(Object.keys(restricted.json().cards)).toEqual(['newCustomers', 'customersWhoCameBack']);
  expect(restricted.json().lifecycle.new).toBe(2);
  const ordersOnly = await success(b, 'POST', '/roles', 201, {
    name: 'Order reader',
    permissions: { ...permissions, areas: { orders: 'view' } },
  });
  await success(b, 'PATCH', `/members/${b.membership}`, 200, { roleId: ordersOnly.json().id });
  const ordersDashboard = await f.request(b.member, 'GET', '/dashboard');
  expect(ordersDashboard.statusCode, ordersDashboard.body).toBe(200);
  expect(ordersDashboard.json()).not.toHaveProperty('lifecycle');
  expect(ordersDashboard.json().cards).not.toHaveProperty('newCustomers');
  expect(ordersDashboard.json().cards).not.toHaveProperty('customersWhoCameBack');
  expect(ordersDashboard.json().cards.orders.points).toHaveLength(30);
  expect(ordersDashboard.json().cards.sales.pointsPoisha).toHaveLength(30);
  expect((await f.request(a.owner, 'GET', `/dashboard?storeId=${b.id}`)).statusCode).toBe(400);
  expect((await f.request(a.owner, 'GET', '/dashboard?period=8')).statusCode).toBe(400);
});

fixture('GET /notifications', async () => {
  const { a, b } = await pair(),
    aId = await notification(a),
    bId = await notification(b);
  for (const [shop, own, foreign] of [
    [a, aId, bId],
    [b, bId, aId],
  ] as const) {
    const ids = (await success(shop, 'GET', '/notifications', 200))
      .json()
      .items.map((item: { id: string }) => item.id);
    expect(ids).toEqual([own]);
    expect(ids).not.toContain(foreign);
  }
});
for (const [action, status] of [
  ['seen', 'seen'],
  ['done', 'done'],
  ['snooze', 'snoozed'],
] as const)
  fixture(`POST /notifications/:notificationId/${action}`, async () => {
    const positive = await f.shop(),
      { a, b } = await pair();
    const positiveId = await notification(positive),
      foreignId = await notification(a);
    const payload = action === 'snooze' ? { until: new Date(Date.now() + 3_600_000) } : {};
    await success(positive, 'POST', `/notifications/${positiveId}/${action}`, 204, payload);
    expect(await f.row('notifications', positiveId)).toMatchObject({ status });
    const before = await f.row('notifications', foreignId);
    await hidden(
      b,
      'POST',
      (id) => `/notifications/${id}/${action}`,
      foreignId,
      () => payload,
    );
    expect(await f.row('notifications', foreignId)).toEqual(before);
  });
fixture('GET /wallets', async () => {
  const { a, b } = await pair();
  await smsCredits(a, 120);
  expect((await success(a, 'GET', '/wallets', 200)).json()).toEqual({
    smsCredits: 120,
    whatsappPoisha: 0,
  });
  expect((await success(b, 'GET', '/wallets', 200)).json()).toEqual({
    smsCredits: 0,
    whatsappPoisha: 0,
  });
  expect((await f.request(a.member, 'GET', '/wallets')).statusCode).toBe(403);
});
async function smsSender(shop: Shop, status: 'requested' | 'approved' = 'requested') {
  const id = (
    await success(shop, 'POST', '/sms-sender-ids', 201, { senderName: 'Rina Shop' })
  ).json().id as string;
  if (status === 'approved')
    await f.admin.pool.query("update sms_sender_ids set status='approved' where id=$1", [id]);
  return id;
}
const metaConnect = '/channel-connections/meta';
const pageSelection = { kind: 'facebook_page', externalAccountId: '1001001' };
const instagramSelection = { kind: 'instagram', externalAccountId: '1002001' };

async function metaSelection(shop: Shop) {
  const result = await success(shop, 'POST', metaAccounts, 201, await metaGrant(shop));
  return result.json().selectionId as string;
}

async function expectSavedMetaCredential(shop: Shop, id: string, kind: string) {
  const {
    rows: [row],
  } = await f.admin.pool.query(
    'select store_id, kind, status, access_token_ciphertext, key_version from channel_connections where id=$1',
    [id],
  );
  expect(row).toMatchObject({ store_id: shop.id, kind, status: 'active' });
  const plaintext = app
    .get(EnvelopeEncryption)
    .decrypt(
      { owner: 'store', storeId: shop.id, purpose: 'channel-access-token' },
      { ciphertext: row.access_token_ciphertext, keyVersion: row.key_version },
    );
  expect(plaintext.toString()).toBe('fake-rina-page-credential');
  plaintext.fill(0);
}

function metaSubscriptionDriver() {
  return app.get<{ subscribePage(pageId: string, token: string): Promise<void> }>(
    META_CHANNEL_DRIVER,
  );
}

async function expectRetryAfterSubscriptionFailure(shop: Shop) {
  const selectionId = await metaSelection(shop);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let subscriptionPending = false;
  const subscription = vi
    .spyOn(metaSubscriptionDriver(), 'subscribePage')
    .mockImplementation(async (id) => {
      if (id === pageSelection.externalAccountId) throw new Error('Temporary test failure');
      subscriptionPending = true;
      await pending;
      subscriptionPending = false;
    });
  try {
    const response = await f.request(shop.owner, 'POST', metaConnect, {
      selectionId,
      accounts: [pageSelection, { kind: 'facebook_page', externalAccountId: '1001002' }],
    });
    expect(response.statusCode).toBe(500);
    expect(subscriptionPending).toBe(false);
  } finally {
    release();
    subscription.mockRestore();
  }
  await success(shop, 'POST', metaConnect, 201, { selectionId, accounts: [pageSelection] });
}

async function expectGrantConsumedAfterCacheFailure(shop: Shop) {
  const selectionId = await metaSelection(shop);
  const key = await metaCacheKey(shop, shop.owner, 'selection', selectionId);
  const cache = app.get(ValkeyClient).connection;
  const deletion = vi.spyOn(cache, 'del').mockRejectedValueOnce(new Error('Test cache failure'));
  try {
    const response = await f.request(shop.owner, 'POST', metaConnect, {
      selectionId,
      accounts: [{ kind: 'facebook_page', externalAccountId: '1001002' }],
    });
    expect(response.statusCode).toBe(500);
  } finally {
    deletion.mockRestore();
  }
  try {
    const list = await success(shop, 'GET', '/channel-connections', 200);
    expect(list.json().items).toContainEqual(
      expect.objectContaining({ externalAccountId: '1001002' }),
    );
    const replay = await f.request(shop.owner, 'POST', metaConnect, {
      selectionId,
      accounts: [pageSelection],
    });
    expect(replay.json().error.code).toBe('META_SELECTION_IN_PROGRESS');
  } finally {
    await cache.del(key, `${key}:claimed`);
  }
}

async function rejectMetaConflict(shop: Shop, accounts: (typeof pageSelection)[]) {
  const selectionId = await metaSelection(shop);
  const input = { selectionId, accounts };
  const subscription = vi.spyOn(metaSubscriptionDriver(), 'subscribePage');
  try {
    const denied = await f.request(shop.owner, 'POST', metaConnect, input);
    expect(denied.statusCode).toBe(409);
    expect(denied.json().error.code).toBe('META_ACCOUNT_ALREADY_CONNECTED');
    expect(subscription).not.toHaveBeenCalled();
    expect((await f.request(shop.owner, 'POST', metaConnect, input)).statusCode).toBe(404);
    return { selectionId, denied };
  } finally {
    subscription.mockRestore();
  }
}

fixture('POST /channel-connections/meta', async () => {
  const { a, b } = await pair();
  const selectionId = await metaSelection(a);
  const input = { selectionId, accounts: [pageSelection, instagramSelection] };
  const foreign = await f.request(b.owner, 'POST', metaConnect, input);
  const other = await f.request(await secondShopSession(a), 'POST', metaConnect, input);
  expect([foreign.statusCode, other.statusCode]).toEqual([404, 404]);
  expect(foreign.json()).toEqual(other.json());
  await f.admin.pool.query("update memberships set built_in_role='marketer' where id=$1", [
    a.membership,
  ]);
  expect((await f.request(a.member, 'POST', metaConnect, input)).statusCode).toBe(403);

  const submissions = await Promise.all([
    f.request(a.owner, 'POST', metaConnect, input),
    f.request(a.owner, 'POST', metaConnect, input),
  ]);
  expect(submissions.filter((response) => response.statusCode === 201)).toHaveLength(1);
  const connected = submissions.find((response) => response.statusCode === 201)!;
  const replay = submissions.find((response) => response.statusCode !== 201)!;
  expect(['META_SELECTION_NOT_FOUND', 'META_SELECTION_IN_PROGRESS']).toContain(
    replay.json().error.code,
  );
  const { ids } = connected.json();
  expect(ids).toHaveLength(2);
  await expectSavedMetaCredential(a, ids[0], 'facebook_page');
  await expectSavedMetaCredential(a, ids[1], 'instagram');
  expect((await f.request(a.owner, 'POST', metaConnect, input)).statusCode).toBe(404);

  await rejectMetaConflict(b, [pageSelection]);
  const { selectionId: bSelection, denied: conflict } = await rejectMetaConflict(b, [
    { kind: 'facebook_page', externalAccountId: '1001002' },
    instagramSelection,
  ]);
  expect((await success(b, 'GET', '/channel-connections', 200)).json()).toEqual({
    items: [],
    nextCursor: null,
  });
  const events = await f.admin.pool.query(
    'select payload from outbox_events where store_id=$1 and type=$2',
    [a.id, 'channel.connected'],
  );
  expect(events.rows).toHaveLength(2);
  expect(events.rows).toEqual(
    expect.arrayContaining(ids.map((id: string) => ({ payload: { channelConnectionId: id } }))),
  );
  for (const value of [
    selectionId,
    bSelection,
    'fake-meta-user-credential',
    'fake-rina-page-credential',
  ]) {
    expect(connected.body).not.toContain(value);
    expect(conflict.body).not.toContain(value);
    expect(logs.contents()).not.toContain(value);
  }
  await expectRetryAfterSubscriptionFailure(a);
  await expectGrantConsumedAfterCacheFailure(a);
});

async function seedChannel(shop: Shop, kind: 'facebook_page' | 'instagram' = 'facebook_page') {
  const id = randomUUID();
  await f.admin.pool.query(
    `insert into channel_connections(id,store_id,kind,external_account_id,display_name,access_token_ciphertext,key_version)
     values($1::uuid,$2,$4,$1::uuid::text,'রিনার দোকান',$3,1)`,
    [id, shop.id, Buffer.from('encrypted-page-credential'), kind],
  );
  return id;
}

async function seedPostPhoto(shop: Shop) {
  const id = randomUUID();
  await f.admin.pool.query(
    `insert into files(id,store_id,purpose,object_key,content_type,size_bytes,status)
     values($1::uuid,$2,'post_media',$1::text,'image/jpeg',1024,'ready')`,
    [id, shop.id],
  );
  return id;
}

async function postDraft(
  shop: Shop,
  channelConnectionId: string,
  captionOverride: string | null = '',
) {
  const result = await f.request(
    shop.owner,
    'POST',
    '/posts',
    { caption: 'নতুন পাঞ্জাবি', targets: [{ channelConnectionId, captionOverride }] },
    { 'idempotency-key': randomUUID() },
  );
  expect(result.statusCode, result.body).toBe(201);
  expect(result.json().targets[0]).toMatchObject({ channelConnectionId, captionOverride });
  return result.json().id as string;
}

fixture('POST /posts', async () => {
  const { a, b } = await pair();
  const channel = await seedChannel(a);
  const id = await postDraft(a, channel);
  expect(await f.row('posts', id)).toMatchObject({ store_id: a.id });
  for (const channelConnectionId of [channel, randomUUID()]) {
    const result = await f.request(
      b.owner,
      'POST',
      '/posts',
      { caption: 'নতুন পাঞ্জাবি', targets: [{ channelConnectionId, captionOverride: null }] },
      { 'idempotency-key': randomUUID() },
    );
    expect(result.statusCode, result.body).toBe(404);
    expect(result.json().error.code).toBe('POST_CONNECTION_NOT_FOUND');
  }
});

fixture('GET /posts', async () => {
  const { a, b } = await pair();
  for (const shop of [a, b]) {
    const id = await postDraft(shop, await seedChannel(shop));
    expect(
      (await success(shop, 'GET', '/posts', 200)).json().items.map((row: { id: string }) => row.id),
    ).toEqual([id]);
  }
  expect((await success(a, 'GET', '/posts', 200)).json().items).toHaveLength(1);
  await f.admin.pool.query("update memberships set built_in_role = 'marketer' where id=$1", [
    a.membership,
  ]);
  const privateList = await f.request(a.member, 'GET', '/posts');
  expect(privateList.statusCode, privateList.body).toBe(200);
  expect(privateList.json().items).toEqual([]);
  expect((await f.request(a.member, 'GET', '/posts?drafts=team')).statusCode).toBe(403);
  expect((await success(a, 'GET', '/posts?drafts=team', 200)).json().items).toHaveLength(1);
});

fixture('GET /posts/:postId', async () => {
  const { a, b } = await pair();
  const id = await postDraft(a, await seedChannel(a));
  const own = await success(a, 'GET', `/posts/${id}`, 200);
  expect(own.json()).toMatchObject({ id, targets: [{ captionOverride: '' }] });
  await hidden(b, 'GET', (value) => `/posts/${value}`, id);
});

for (const method of ['PATCH', 'DELETE'] as const) {
  fixture(`${method} /posts/:postId`, async () => {
    const { a, b } = await pair();
    const own = await postDraft(b, await seedChannel(b));
    const foreign = await postDraft(a, await seedChannel(a));
    const payload = method === 'PATCH' ? { caption: 'ঈদের পাঞ্জাবি' } : undefined;
    await success(b, method, `/posts/${own}`, method === 'PATCH' ? 200 : 204, payload);
    const changed = await f.row('posts', own);
    if (method === 'PATCH') expect(changed.caption).toBe(payload?.caption);
    else expect(changed.deleted_at).toBeTruthy();
    const before = await f.row('posts', foreign);
    await hidden(
      b,
      method,
      (id) => `/posts/${id}`,
      foreign,
      () => payload!,
    );
    expect(await f.row('posts', foreign)).toEqual(before);
  });
}

async function aiPostDraft(shop: Shop, actor = shop.owner) {
  const channelConnectionId = await seedChannel(shop);
  const draft = await f.request(
    actor,
    'POST',
    '/posts',
    {
      caption: 'ঈদের পাঞ্জাবি',
      isAiWritten: true,
      targets: [{ channelConnectionId, captionOverride: null }],
    },
    { 'idempotency-key': randomUUID() },
  );
  expect(draft.statusCode, draft.body).toBe(201);
  return draft.json().id as string;
}

fixture('POST /posts/:postId/approve', async () => {
  const { a, b } = await pair();
  const foreign = await aiPostDraft(a);
  const own = await aiPostDraft(b);
  const url = `/posts/${own}/approve`;
  const approved = await success(b, 'POST', url, 200);
  expect(approved.json()).toMatchObject({ id: own, approvedByUserId: b.owner.id });
  const before = await f.row('posts', foreign);
  await hidden(b, 'POST', (id) => `/posts/${id}/approve`, foreign);
  expect(await f.row('posts', foreign)).toEqual(before);
});

fixture('POST /posts/:postId/schedule', async () => {
  const { a, b } = await pair();
  const own = await aiPostDraft(a);
  const foreign = await aiPostDraft(b);
  const scheduledFor = '2099-11-20T20:30:00+06:00';
  const response = await success(a, 'POST', `/posts/${own}/schedule`, 200, { scheduledFor });
  const target = response.json().targets[0];
  expect(response.json()).toMatchObject({ id: own, approvedByUserId: a.owner.id });
  expect(target).toMatchObject({ status: 'scheduled', scheduledFor: '2099-11-20T14:30:00.000Z' });
  const scheduled = await f.admin.pool.query(
    "select payload from outbox_events where store_id=$1 and type='post.scheduled'",
    [a.id],
  );
  expect(scheduled.rows).toEqual([
    {
      payload: { postId: own, postTargetId: target.id, scheduledFor: target.scheduledFor },
    },
  ]);
  const before = await f.row('posts', foreign);
  await hidden(
    a,
    'POST',
    (id) => `/posts/${id}/schedule`,
    foreign,
    () => ({ scheduledFor }),
  );
  expect(await f.row('posts', foreign)).toEqual(before);
});

fixture('GET /posts/queue-slots', async () => {
  const { a, b } = await pair();
  const own = await seedChannel(b);
  const foreign = await seedChannel(a);
  const result = await success(b, 'GET', `/posts/queue-slots?channelConnectionId=${own}`, 200);
  expect(result.json()).toMatchObject({
    channelConnectionId: own,
    timeZone: 'Asia/Dhaka',
    slots: expect.arrayContaining([{ weekday: 5, time: '20:30' }]),
  });
  await hidden(b, 'GET', (id) => `/posts/queue-slots?channelConnectionId=${id}`, foreign);
});

fixture('PUT /posts/queue-slots', async () => {
  const { a, b } = await pair();
  const own = await seedChannel(b);
  const foreign = await seedChannel(a);
  const slots = [{ weekday: 5, time: '19:30' }];
  const saved = await success(b, 'PUT', '/posts/queue-slots', 200, {
    channelConnectionId: own,
    slots,
  });
  expect(saved.json()).toMatchObject({ channelConnectionId: own, slots });
  const reloaded = await success(b, 'GET', `/posts/queue-slots?channelConnectionId=${own}`, 200);
  expect(reloaded.json()).toEqual(saved.json());
  const before = await f.row('channel_connections', foreign);
  await hidden(
    b,
    'PUT',
    () => '/posts/queue-slots',
    foreign,
    (id) => ({
      channelConnectionId: id,
      slots,
    }),
  );
  expect(await f.row('channel_connections', foreign)).toEqual(before);
  const audit = await f.admin.pool.query(
    'select action from audit_log where store_id=$1 and entity_id=$2',
    [b.id, own],
  );
  expect(audit.rows).toEqual([{ action: 'post.slots_saved' }]);
});

fixture('GET /channel-connections', async () => {
  const { a, b } = await pair();
  await seedChannel(a);
  const own = await seedChannel(b);
  const result = await success(b, 'GET', '/channel-connections', 200);
  expect(result.json()).toEqual({
    nextCursor: null,
    items: [
      {
        id: own,
        kind: 'facebook_page',
        displayName: 'রিনার দোকান',
        externalAccountId: own,
        status: 'active',
        tokenExpiresAt: null,
        connectedAt: expect.any(String),
        disconnectedAt: null,
      },
    ],
  });
  const second = await seedChannel(b);
  const firstPage = await success(b, 'GET', '/channel-connections?limit=1', 200);
  const { items, nextCursor } = firstPage.json();
  expect(items.map(({ id }: { id: string }) => id)).toEqual([nextCursor]);
  const nextPage = await success(
    b,
    'GET',
    `/channel-connections?limit=1&cursor=${nextCursor}`,
    200,
  );
  expect(nextPage.json().nextCursor).toBeNull();
  expect([nextCursor, nextPage.json().items[0].id].sort()).toEqual([own, second].sort());
  expect((await f.request(b.member, 'GET', '/channel-connections')).statusCode).toBe(403);
});

fixture('DELETE /channel-connections/:channelConnectionId', async () => {
  const { a, b } = await pair();
  const foreign = await seedChannel(a);
  const own = await seedChannel(b);
  const url = (id: string) => `/channel-connections/${id}`;
  const conversation = randomUUID();
  await f.admin.pool.query(
    `insert into conversations(id,store_id,contact_id,channel_connection_id,channel)
     values($2,$1,$4,$3,'messenger')`,
    [b.id, conversation, own, await contact(b)],
  );
  await hidden(b, 'DELETE', url, foreign);
  expect((await f.request(b.member, 'DELETE', url(own))).statusCode).toBe(403);
  await success(b, 'DELETE', url(own), 204);
  expect(await f.row('conversations', conversation)).toMatchObject({ channel_connection_id: own });
  expect(await f.row('channel_connections', foreign)).toMatchObject({ status: 'active' });
  expect(await f.row('channel_connections', own)).toMatchObject({
    status: 'disconnected',
    access_token_ciphertext: null,
    key_version: null,
  });
  const events = await f.admin.pool.query(
    'select payload from outbox_events where store_id=$1 and type=$2',
    [b.id, 'channel.disconnected'],
  );
  expect(events.rows).toEqual([{ payload: { channelConnectionId: own } }]);
});

async function seedConversation(shop: Shop) {
  const id = randomUUID();
  await f.admin.pool.query(
    "insert into conversations(id,store_id,contact_id,channel_connection_id,channel) values($1,$2,$3,$4,'messenger')",
    [id, shop.id, await contact(shop), await seedChannel(shop)],
  );
  return id;
}

async function enableChats(shop: Shop) {
  await success(shop, 'PATCH', '/store/extensions', 200, { extensions: ['chats'] });
}

fixture('GET /conversations', async () => {
  const { a, b } = await pair();
  await seedConversation(a);
  const own = await seedConversation(b);
  expect((await f.request(b.owner, 'GET', '/conversations')).statusCode).toBe(403);
  await enableChats(b);
  await success(b, 'GET', `/conversations?cursor=0000-01-01T00:00:00Z_${own}`, 400);
  const result = await success(b, 'GET', '/conversations', 200);
  expect(result.json()).toMatchObject({ items: [{ id: own }], nextCursor: null });
  const second = await seedConversation(b);
  await success(b, 'PATCH', `/conversations/${own}`, 200, { status: 'later' });
  expect((await success(b, 'GET', '/conversations?status=later', 200)).json()).toMatchObject({
    items: [{ id: own, status: 'later' }],
    nextCursor: null,
  });
  const [latest, older] = [own, second].sort();
  await f.admin.pool.query('update conversations set last_message_at = $1 where id = $2', [
    '2026-11-18T10:00:00.123456Z',
    latest,
  ]);
  const page = (await success(b, 'GET', '/conversations?limit=1', 200)).json();
  expect(page.items).toMatchObject([{ id: latest }]);
  expect(page.nextCursor).toEqual(expect.any(String));
  const next = await success(b, 'GET', `/conversations?limit=1&cursor=${page.nextCursor}`, 200);
  expect(next.json()).toMatchObject({ items: [{ id: older }], nextCursor: null });

  const removed = await seedConversation(b);
  const { contact_id: removedContactId } = await f.row('conversations', removed);
  await f.admin.pool.query('update conversations set last_message_at = now() where id = $1', [
    removed,
  ]);
  await success(b, 'DELETE', `/contacts/${removedContactId}`, 204);
  expect((await success(b, 'GET', '/conversations?limit=1', 200)).json().items).toMatchObject([
    { id: latest },
  ]);
  const url = (id: string) => `/conversations/${id}`;
  await hidden(b, 'GET', url, removed);
  await hidden(b, 'GET', (id) => `${url(id)}/messages`, removed);
  await hidden(b, 'PATCH', url, removed, () => ({ status: 'later' }));
  await hidden(b, 'POST', (id) => `${url(id)}/take-over`, removed);
  await hidden(b, 'POST', (id) => `${url(id)}/return-to-ai`, removed);
});

fixture('GET /conversations/:conversationId', async () => {
  const { a, b } = await pair();
  await enableChats(b);
  const url = (id: string) => `/conversations/${id}`;
  await hidden(b, 'GET', url, await seedConversation(a));
  const own = await seedConversation(b);
  expect((await success(b, 'GET', url(own), 200)).json()).toMatchObject({ id: own });
});

fixture('GET /conversations/:conversationId/messages', async () => {
  const { a, b } = await pair();
  await enableChats(b);
  const url = (id: string) => `/conversations/${id}/messages`;
  await hidden(b, 'GET', url, await seedConversation(a));
  const own = await seedConversation(b);
  const [newest, older] = [randomUUID(), randomUUID()].sort();
  await success(b, 'GET', `${url(own)}?cursor=0000-01-01T00:00:00Z_${newest}`, 400);
  const senderIdentity = randomUUID();
  await f.admin.pool.query(
    `insert into contact_identities(id,store_id,contact_id,channel_connection_id,channel,external_id)
     select $1::uuid,store_id,contact_id,channel_connection_id,channel,$1::text
     from conversations where store_id=$2 and id=$3`,
    [senderIdentity, b.id, own],
  );
  await f.admin.pool.query(
    `insert into messages(id,store_id,conversation_id,direction,author_type,kind,body,status,created_at,sender_identity_id)
     values($1,$2,$3,'in','customer','text','দাম কত?','received','2026-11-18T10:00:00.123456Z',$5),
     ($4,$2,$3,'in','customer','text','সাইজ কত?','received','2026-11-18T10:00:00.123123Z',$5)`,
    [newest, b.id, own, older, senderIdentity],
  );
  const page = (await success(b, 'GET', `${url(own)}?limit=1`, 200)).json();
  expect(page.items).toMatchObject([
    { id: newest, body: 'দাম কত?', status: 'received', authorType: 'customer' },
  ]);
  expect(page.nextCursor).toEqual(expect.any(String));
  const next = await success(b, 'GET', `${url(own)}?limit=1&cursor=${page.nextCursor}`, 200);
  expect(next.json()).toMatchObject({
    items: [{ id: older, body: 'সাইজ কত?' }],
    nextCursor: null,
  });
});

fixture('PATCH /conversations/:conversationId', async () => {
  const { a, b } = await pair();
  await enableChats(b);
  const url = (id: string) => `/conversations/${id}`;
  const foreign = await seedConversation(a);
  const own = await seedConversation(b);
  await hidden(b, 'PATCH', url, foreign, () => ({ status: 'done' }));
  await success(b, 'PATCH', url(own), 400, { assigneeUserId: a.member.id });
  const changed = await success(b, 'PATCH', url(own), 200, {
    status: 'done',
    assigneeUserId: b.member.id,
  });
  expect(changed.json()).toMatchObject({
    status: 'done',
    assigneeUserId: b.member.id,
    responder: 'ai',
  });
  expect(await f.row('conversations', foreign)).toMatchObject({ status: 'open' });
  expect(await f.row('conversations', own)).toMatchObject({ version: 1 });
  await success(b, 'PATCH', url(own), 200, {
    status: 'done',
    assigneeUserId: b.member.id.toUpperCase(),
  });
  expect(await f.row('conversations', own)).toMatchObject({ version: 1 });
  const records = await f.admin.pool.query(
    'select actor_user_id, "after" from audit_log where store_id = $1 and entity_id = $2',
    [b.id, own],
  );
  expect(records.rows).toEqual([
    { actor_user_id: b.owner.id, after: { changedFields: ['status', 'assigneeUserId'] } },
  ]);
  const { id: roleId } = (
    await success(b, 'POST', '/roles', 201, {
      name: 'Chats view only',
      permissions: { ...permissions, areas: { chats: 'view' } },
    })
  ).json();
  await f.admin.pool.query(
    'update memberships set built_in_role = null, role_id = $1 where id = $2',
    [roleId, b.membership],
  );
  expect((await f.request(b.member, 'GET', url(own))).statusCode).toBe(200);
  expect((await f.request(b.member, 'PATCH', url(own), { assigneeUserId: null })).statusCode).toBe(
    403,
  );
  expect((await success(b, 'PATCH', url(own), 200, { assigneeUserId: null })).json()).toMatchObject(
    { assigneeUserId: null },
  );
  const locker = await f.admin.pool.connect();
  let assignment: ReturnType<typeof f.request> | undefined;
  try {
    await locker.query('begin');
    await locker.query('select id from conversations where id = $1 for no key update', [own]);
    const {
      rows: [backend],
    } = await locker.query<{ pid: number }>('select pg_backend_pid() as pid');
    assignment = f.request(b.owner, 'PATCH', url(own), { assigneeUserId: b.member.id });
    await vi.waitFor(async () => {
      const { rows } = await f.admin.pool.query(
        'select 1 from pg_stat_activity where $1 = any(pg_blocking_pids(pid))',
        [backend!.pid],
      );
      expect(rows).toHaveLength(1);
    });
    await locker.query(
      "update conversations set status = 'open', version = version + 1 where id = $1",
      [own],
    );
    await locker.query('commit');
  } catch (error) {
    await locker.query('rollback');
    await assignment;
    throw error;
  } finally {
    locker.release();
  }
  const assigned = await assignment;
  expect(assigned.statusCode, assigned.body).toBe(200);
  expect(assigned.json()).toMatchObject({ status: 'open', assigneeUserId: b.member.id });
});

for (const [path, responder] of [
  ['take-over', 'human'],
  ['return-to-ai', 'ai'],
] as const) {
  fixture(`POST /conversations/:conversationId/${path}`, async () => {
    const { a, b } = await pair();
    await enableChats(b);
    const url = (id: string) => `/conversations/${id}/${path}`;
    const foreign = await seedConversation(a);
    const own = await seedConversation(b);
    await hidden(b, 'POST', url, foreign);
    if (path === 'return-to-ai')
      await f.admin.pool.query("update conversations set responder = 'human' where id = $1", [own]);
    expect((await success(b, 'POST', url(own), 200)).json()).toMatchObject({
      status: 'open',
      responder,
      aiResumesAt: null,
    });
    if (path === 'take-over') {
      await success(b, 'POST', url(own), 400, { returnAfterMinutes: 31 });
      const earliest = Date.now() + 30 * 60_000;
      const timed = await success(b, 'POST', url(own), 200, { returnAfterMinutes: 30 });
      const deadline = Date.parse(timed.json().aiResumesAt);
      expect(deadline).toBeGreaterThanOrEqual(earliest);
      expect(deadline).toBeLessThanOrEqual(Date.now() + 30 * 60_000);
      const handBack = await success(b, 'POST', `/conversations/${own}/return-to-ai`, 200);
      expect(handBack.json()).toMatchObject({ responder: 'ai', aiResumesAt: null });
    }
    expect(await f.row('conversations', foreign)).toMatchObject({ responder: 'ai' });
  });
}

fixture('POST /conversations/:conversationId/notes', async () => {
  const { a, b } = await pair();
  await enableChats(b);
  const url = (id: string) => `/conversations/${id}/notes`;
  const foreign = await seedConversation(a);
  const own = await seedConversation(b);
  const body = 'গ্রাহককে কাল জানাতে হবে।';
  await hidden(b, 'POST', url, foreign, () => ({ body }));
  await success(b, 'POST', url(own), 400, { body: '   ' });
  await f.admin.pool.query(
    `update conversations set last_message_preview = 'Customer message',
       last_message_at = now(), window_expires_at = now() + interval '1 day' where id = $1`,
    [own],
  );
  const before = await f.row('conversations', own);
  const added = await success(b, 'POST', url(own), 201, { body });
  expect(added.json()).toMatchObject({
    body,
    kind: 'note',
    authorType: 'user',
    authorUserId: b.owner.id,
    sentAt: null,
  });
  const thread = await success(b, 'GET', `/conversations/${own}/messages`, 200);
  expect(thread.json().items).toMatchObject([{ id: added.json().id, kind: 'note', body }]);
  expect(await f.row('conversations', own)).toMatchObject({
    last_message_preview: before.last_message_preview,
    last_message_at: before.last_message_at,
    window_expires_at: before.window_expires_at,
    unread_count: before.unread_count,
    version: before.version,
  });
  const events = await f.admin.pool.query(
    "select type from outbox_events where store_id = $1 and type like 'message.%'",
    [b.id],
  );
  expect(events.rows).toEqual([]);
});

fixture('GET /sms-sender-ids', async () => {
  const { a, b } = await pair(),
    aId = await smsSender(a),
    bId = await smsSender(b);
  for (const [shop, own] of [
    [a, aId],
    [b, bId],
  ] as const)
    expect(
      (await success(shop, 'GET', '/sms-sender-ids', 200))
        .json()
        .items.map((item: { id: string }) => item.id),
    ).toEqual([own]);
  expect((await f.request(a.member, 'GET', '/sms-sender-ids')).statusCode).toBe(403);
});
fixture('POST /sms-sender-ids', async () => {
  const { a, b } = await pair(),
    id = await smsSender(a),
    before = await f.row('sms_sender_ids', id);
  // A pending request in shop A does not block shop B.
  const own = await smsSender(b);
  expect((await f.row('sms_sender_ids', own)).store_id).toBe(b.id);
  expect(await f.row('sms_sender_ids', id)).toEqual(before);
});
fixture('POST /sms-sender-ids/:smsSenderIdId/test', async () => {
  const { a, b } = await pair(),
    id = await smsSender(a, 'approved');
  await success(a, 'POST', `/sms-sender-ids/${id}/test`, 204, {});
  expect(f.sms.at(-1)).toMatchObject({ to: a.owner.phone, sender: 'Rina Shop' });
  const sent = f.sms.length;
  await hidden(
    b,
    'POST',
    (value) => `/sms-sender-ids/${value}/test`,
    id,
    () => ({}),
  );
  expect(f.sms).toHaveLength(sent);
});
// Nest's SSE stream needs a real socket, which app.inject does not provide.
fixture('GET /events/stream', async () => {
  const { a, b } = await pair();
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const streams = await Promise.all(
    [a, b].map(async (shop) => {
      const abort = new AbortController();
      const response = await fetch(`${url}/events/stream`, {
        headers: { cookie: shop.owner.cookie },
        signal: abort.signal,
      });
      expect(response.status).toBe(200);
      const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
      const read = { text: '' };
      void (async () => {
        for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
          read.text += chunk.value;
      })().catch(() => undefined);
      return { shop, abort, read };
    }),
  );
  // Nest can send headers while Valkey is still subscribing. Give both streams one deadline.
  await vi.waitFor(
    async () => {
      for (const shop of [a, b]) {
        const reply = await app
          .get(ValkeyClient)
          .connection.pubsub('NUMSUB', `notifications:${shop.id}`);
        expect((reply as [string, number])[1]).toBe(1);
      }
    },
    { timeout: 2_000 },
  );
  const ids = new Map<string, string>();
  for (const shop of [a, b]) {
    ids.set(shop.id, await notification(shop));
    await app.get(NotificationStreamService).announce(shop.id, ids.get(shop.id)!, shop.owner.id);
  }
  for (const { shop, read } of streams)
    await vi.waitFor(() => expect(read.text).toContain(`id: ${ids.get(shop.id)}`));
  expect(streams[0]!.read.text).not.toContain(ids.get(b.id));
  expect(streams[1]!.read.text).not.toContain(ids.get(a.id));
  for (const { abort } of streams) abort.abort();
});
fixture('GET /account-recovery-history', async () => {
  const { a, b } = await pair(),
    aId = await f.recovery(a),
    bId = await f.recovery(b);
  expect(
    (await success(a, 'GET', '/account-recovery-history', 200))
      .json()
      .items.map((row: { id: string }) => row.id),
  ).toEqual([aId]);
  expect(
    (await success(b, 'GET', '/account-recovery-history', 200))
      .json()
      .items.map((row: { id: string }) => row.id),
  ).toEqual([bId]);
});

const photoInput = { contentType: 'image/png', sizeBytes: 4 };
async function uploadedPhoto(shop: Shop, productId: string) {
  const issued = (
    await success(shop, 'POST', `/products/${productId}/photos/upload-url`, 200, photoInput)
  ).json();
  const response = await fetch(issued.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': photoInput.contentType },
    body: new Uint8Array([137, 80, 78, 71]),
  });
  expect(response.status).toBe(200);
  return { ...photoInput, fileId: issued.fileId as string };
}
fixture('POST /products/:productId/photos/upload-url', async () => {
  const { a, b } = await pair(),
    foreignId = await product(a),
    own = await product(b);
  const before = await f.row('products', foreignId);
  const issued = (
    await success(b, 'POST', `/products/${own}/photos/upload-url`, 200, photoInput)
  ).json();
  expect(new URL(issued.uploadUrl).pathname).toBe(
    `/dakly-local/stores/${b.id}/products/${issued.fileId}`,
  );
  expect(await f.row('files', issued.fileId)).toBeUndefined();
  await hidden(
    b,
    'POST',
    (id) => `/products/${id}/photos/upload-url`,
    foreignId,
    () => photoInput,
  );
  expect(await f.row('products', foreignId)).toEqual(before);
  expect(
    (await f.request(b.member, 'POST', `/products/${own}/photos/upload-url`, photoInput))
      .statusCode,
  ).toBe(403);
  expect(
    (
      await f.request(b.owner, 'POST', `/products/${own}/photos/upload-url`, {
        ...photoInput,
        sizeBytes: 5242881,
      })
    ).statusCode,
  ).toBe(400);
});
fixture('POST /products/:productId/photos/confirm', async () => {
  const { a, b } = await pair(),
    foreignId = await product(a),
    own = await product(b);
  const photo = await uploadedPhoto(b, own);
  const confirmed = (
    await success(b, 'POST', `/products/${own}/photos/confirm`, 201, photo)
  ).json();
  expect(confirmed.imageFileIds).toEqual([photo.fileId]);
  expect((await f.row('files', photo.fileId)).store_id).toBe(b.id);
  const url = confirmed.photos[0].url as string;
  expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('900');
  const download = await fetch(url);
  expect(download.status).toBe(200);
  expect(new Uint8Array(await download.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
  const before = await f.row('products', foreignId);
  await hidden(
    b,
    'POST',
    (id) => `/products/${id}/photos/confirm`,
    foreignId,
    () => photo,
  );
  expect(await f.row('products', foreignId)).toEqual(before);
});
fixture('PATCH /products/:productId/photos', async () => {
  const { a, b } = await pair(),
    foreignId = await product(a),
    own = await product(b);
  const first = await uploadedPhoto(b, own),
    second = await uploadedPhoto(b, own);
  await success(b, 'POST', `/products/${own}/photos/confirm`, 201, first);
  await success(b, 'POST', `/products/${own}/photos/confirm`, 201, second);
  const payload = { fileIds: [second.fileId, first.fileId] };
  const changed = (await success(b, 'PATCH', `/products/${own}/photos`, 200, payload)).json();
  expect(changed.photos.map((photo: { id: string }) => photo.id)).toEqual(payload.fileIds);
  const before = await f.row('products', foreignId);
  await hidden(
    b,
    'PATCH',
    (id) => `/products/${id}/photos`,
    foreignId,
    () => payload,
  );
  expect(await f.row('products', foreignId)).toEqual(before);
});
fixture('DELETE /products/:productId/photos/:fileId', async () => {
  const { a, b } = await pair(),
    foreignProduct = await product(a),
    own = await product(b);
  const foreignPhoto = await uploadedPhoto(a, foreignProduct),
    photo = await uploadedPhoto(b, own);
  await success(a, 'POST', `/products/${foreignProduct}/photos/confirm`, 201, foreignPhoto);
  await success(b, 'POST', `/products/${own}/photos/confirm`, 201, photo);
  const before = await f.row('files', foreignPhoto.fileId);
  await success(b, 'DELETE', `/products/${own}/photos/${photo.fileId}`, 204);
  expect((await f.row('products', own)).image_file_ids).toEqual([]);
  expect((await f.row('files', photo.fileId)).expires_at).not.toBeNull();
  await hidden(
    b,
    'DELETE',
    (id) => `/products/${id}/photos/${foreignPhoto.fileId}`,
    foreignProduct,
  );
  await hidden(b, 'DELETE', (id) => `/products/${own}/photos/${id}`, foreignPhoto.fileId);
  expect(await f.row('files', foreignPhoto.fileId)).toEqual(before);
});

let logs: ReturnType<typeof captureRequestLogs>;

describe('every production shop route isolates its data', () => {
  beforeEach(() => logs.beginTest());
  beforeAll(async () => {
    vi.stubEnv('STAFF_SESSION_SIGNING_KEY', randomBytes(32).toString('base64'));
    vi.stubEnv('META_CHANNEL_DRIVER', 'fake');
    vi.stubEnv('META_APP_SECRET', metaAppSecret);
    vi.stubEnv('META_WEBHOOK_VERIFY_TOKEN', undefined);
    vi.stubEnv('META_OAUTH_REDIRECT_URI', 'http://localhost:3000/integrations/meta');
    resetEnvForTests();
    const adapter = new FastifyAdapter(createHttpServer(loadEnv().API_TRUSTED_PROXIES));
    adapter.getInstance().addHook('onRoute', (route) => {
      inventory.record(route);
    });
    app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      logger: false,
      abortOnError: false,
      rawBody: true,
    });
    logs = captureRequestLogs(app);
    f = new IsolationFixture(app);
    vi.spyOn(app.get(SmsService), 'send').mockImplementation(async (message) => {
      f.sms.push(message);
      return { providerMessageId: 'test-sms' };
    });
    await registerSessionCookies(app);
    await app.init();
    await adapter.getInstance().ready();
  });
  afterAll(async () => {
    try {
      await f?.close();
    } finally {
      logs?.restore();
      await app?.close();
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      resetEnvForTests();
    }
  });
  it('keeps signed webhook intake disabled with only the shared Meta app secret', async () => {
    const payload = JSON.stringify({ object: 'page', entry: [{ id: randomUUID() }] });
    const signature = createHmac('sha256', metaAppSecret).update(payload).digest('hex');
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/meta',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${signature}` },
      payload,
    });
    expect(response.statusCode).toBe(401);
  });

  it('requires an executable fixture or a named boundary proof for every actual Fastify route', () => {
    inventory.assertCovered([...fixtures.keys(), ...isolationBoundaries.keys()]);
  });
  it('returns the phone limit error to a masked member on contact search, create and edit', async () => {
    const shop = await f.shop();
    await f.admin.pool.query("update memberships set built_in_role='marketer' where id=$1", [
      shop.membership,
    ]);
    const number = phone();
    const input = { name: 'রিনা', phone: number };
    const { id } = (await success(shop, 'POST', '/contacts', 201, input)).json();
    const search = `/contacts?search=${number}`;
    const cache = app.get(ValkeyClient).connection;
    const lookup = `contacts:phone-lookup:${shop.id}:${shop.member.id}`;
    const write = `contacts:phone-write:${shop.id}:${shop.member.id}`;
    const ownerLookup = `contacts:phone-lookup:${shop.id}:${shop.owner.id}`;
    try {
      await Promise.all([
        cache.set(lookup, 30, 'EX', 3600),
        cache.set(write, 10, 'EX', 3600),
        cache.set(ownerLookup, 30, 'EX', 3600),
      ]);
      for (const response of [
        await f.request(shop.member, 'GET', search),
        await f.request(shop.member, 'POST', '/contacts', input),
        await f.request(shop.member, 'PATCH', `/contacts/${id}`, { phone: phone() }),
      ]) {
        expect(response.statusCode, response.body).toBe(429);
        expect(response.json()).toEqual({
          error: {
            code: 'CONTACT_PHONE_RATE_LIMITED',
            message: 'Too many phone searches or changes. Try again later',
          },
        });
      }
      expect((await success(shop, 'GET', search, 200)).json().items).toEqual([
        expect.objectContaining({ id, phone: number }),
      ]);
    } finally {
      await cache.del(lookup, write, ownerLookup);
    }
  });
  it('quotes Savar, another Dhaka upazila and an outside upazila from the defaults', async () => {
    const shop = await f.shop();
    const zones = await success(shop, 'POST', '/delivery-zones/initialize-defaults', 201);
    const service = app.get(DeliveryService);
    const cases = [
      { areaId: 30260072, name: 'Dhaka suburbs', chargePoisha: 10000, district: 'Dhaka' },
      { areaId: 30260014, name: 'Inside Dhaka', chargePoisha: 6000, district: 'Dhaka' },
      { areaId: 20030004, name: 'Outside Dhaka', chargePoisha: 12000, district: 'Bandarban' },
    ];

    for (const { areaId, name, chargePoisha, district } of cases) {
      const zone = zones.json().items.find((item: { name: string }) => item.name === name);
      expect(zone).toBeDefined();
      await expect(service.calculateDeliveryCharge(shop.id, areaId)).resolves.toEqual({
        deliveryZoneId: zone.id,
        chargePoisha,
        district,
      });
    }
  });
  it('uses the non-owner app role without bypassing row security', async () => {
    const connection = app.get<IsolationFixture['admin']>(DATABASE_CONNECTION);
    const result = await connection.pool.query(
      "select current_user,rolsuper,rolbypassrls,pg_get_userbyid(c.relowner)=current_user as owns_contacts from pg_roles join pg_class c on c.relname='contacts' where rolname=current_user",
    );
    expect(result.rows).toEqual([
      { current_user: 'dakly_app', rolsuper: false, rolbypassrls: false, owns_contacts: false },
    ]);
  });
  it('returns own rows and hides foreign rows without repository filters under every route policy', async () => {
    const { a, b } = await pair();
    const rows: [string, string, string, string][] = [
      ['stores', 'id', a.id, b.id],
      ['memberships', 'id', a.membership, b.membership],
      [
        'knowledge_items',
        'id',
        await knowledgeItem(a, 'ঢাকায় ৬০ টাকা।'),
        await knowledgeItem(b, 'ঢাকার বাইরে ১২০ টাকা।'),
      ],
      ['contacts', 'id', await contact(a), await contact(b)],
      ['roles', 'id', await role(a), await role(b)],
      ['segments', 'id', await segment(a), await segment(b)],
      ['campaigns', 'id', await campaign(a), await campaign(b)],
      ['ownership_transfers', 'id', await f.transfer(a), await f.transfer(b)],
      ['support_grants', 'id', (await f.grant(a, false)).id, (await f.grant(b, false)).id],
      ['staff_recovery_history', 'audit_id', await f.recovery(a), await f.recovery(b)],
      ['wallet_ledger', 'id', await smsCredits(a, 10), await smsCredits(b, 20)],
      ['sms_sender_ids', 'id', await smsSender(a), await smsSender(b)],
    ];
    const connection = app.get<IsolationFixture['admin']>(DATABASE_CONNECTION);
    const client = await connection.pool.connect();
    try {
      await client.query('begin');
      for (const [current, ownIndex, foreignIndex] of [
        [a, 2, 3],
        [b, 3, 2],
      ] as const) {
        await client.query("select set_config('app.store_id',$1,true)", [current.id]);
        for (const row of rows) {
          const result = await client.query(`select ${row[1]} as id from ${row[0]}`);
          const ids = result.rows.map((item: { id: string }) => item.id);
          const expected =
            row[0] === 'memberships' ? [row[ownIndex], current.ownerMembership] : [row[ownIndex]];
          expect(ids.sort(), row[0]).toEqual(expected.sort());
          expect(ids, row[0]).not.toContain(row[foreignIndex]);
        }
      }
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
  it('DELETE /products/:productId refuses variants on open orders', async () => {
    const { a, b } = await pair();
    const variantId = await orderVariant(b);
    const { product_id: productId } = await f.row('product_variants', variantId);
    const orderId = await order(b);
    await f.admin.pool.query(
      `insert into order_items (id,store_id,order_id,variant_id,product_name,variant_title,quantity,unit_price_poisha,is_stock_tracked)
       values($1,$2,$3,$4,'Panjabi','Default',1,125000,false)`,
      [randomUUID(), b.id, orderId, variantId],
    );
    await f.admin.pool.query("update product_variants set status='archived' where id=$1", [
      variantId,
    ]);
    const url = `/products/${productId}`;
    expect((await f.request(b.member, 'DELETE', url)).statusCode).toBe(403);
    for (const change of [
      undefined,
      { to: 'on_hold', reason: 'cannot_reach' },
      { to: 'to_pack' },
    ]) {
      if (change) await success(b, 'POST', `/orders/${orderId}/stage`, 200, change);
      const denied = await f.request(b.owner, 'DELETE', url);
      expect(denied.statusCode, denied.body).toBe(409);
      expect(denied.json()).toMatchObject({ error: { code: 'PRODUCT_HAS_OPEN_ORDERS' } });
      expect(await f.row('products', productId)).not.toMatchObject({ status: 'archived' });
    }
    await hidden(a, 'DELETE', (id) => `/products/${id}`, productId);
    await success(b, 'POST', `/orders/${orderId}/stage`, 200, {
      to: 'cancelled',
      reason: 'customer_cancelled',
    });
    await success(b, 'DELETE', url, 204);
    expect(await f.row('products', productId)).toMatchObject({ status: 'archived' });
  });

  it('DELETE /products/:productId races new order creation', async () => {
    const { b } = await pair();
    const variantId = await orderVariant(b);
    const { product_id: productId } = await f.row('product_variants', variantId);
    await deliveryZone(b);
    await f.admin.pool.query('insert into store_counters(store_id) values ($1)', [b.id]);
    const startRequests = () =>
      Promise.allSettled([
        f.request(
          b.owner,
          'POST',
          '/orders',
          {
            buyer: { name: 'Rahim' },
            recipient: { name: 'Rahim', phone: b.owner.phone, address: 'Mirpur', areaId: 301 },
            items: [{ variantId, quantity: 1 }],
          },
          { 'idempotency-key': randomUUID() },
        ),
        f.request(b.owner, 'DELETE', `/products/${productId}`),
      ]);
    const lock = await f.admin.pool.connect();
    let requests: ReturnType<typeof startRequests> | undefined;
    try {
      await lock.query('begin');
      const {
        rows: [session],
      } = await lock.query<{ pid: number }>('select pg_backend_pid() as pid');
      await lock.query('select id from product_variants where id=$1 for no key update', [
        variantId,
      ]);
      requests = startRequests();
      await expect
        .poll(async () => {
          const {
            rows: [blocked],
          } = await f.admin.pool.query<{ total: string }>(
            `with recursive waiting(pid) as (
             select $1::int
             union
             select activity.pid from pg_stat_activity activity
             join waiting on waiting.pid=any(pg_blocking_pids(activity.pid))
           ) select count(*)-1 as total from waiting`,
            [session!.pid],
          );
          return Number(blocked!.total);
        })
        .toBe(2);
    } finally {
      let rolledBack = false;
      try {
        await lock.query('rollback');
        rolledBack = true;
      } finally {
        lock.release(!rolledBack);
        await requests;
      }
    }
    const [creation, archive] = (await requests)!;
    if (creation.status === 'rejected') throw creation.reason;
    if (archive.status === 'rejected') throw archive.reason;
    const created = creation.value;
    const archived = archive.value;
    if (created.statusCode === 201) {
      expect(archived.statusCode, archived.body).toBe(409);
      expect(archived.json()).toMatchObject({ error: { code: 'PRODUCT_HAS_OPEN_ORDERS' } });
    } else {
      expect(archived.statusCode, archived.body).toBe(204);
      expect(created.statusCode, created.body).toBe(404);
      expect(created.json()).toMatchObject({ error: { code: 'PRODUCT_VARIANT_NOT_FOUND' } });
    }
  });
  it('keeps post media in its own store on create and edit', async () => {
    const { a, b } = await pair();
    const foreignPhoto = await seedPostPhoto(a);
    const ownPhoto = await seedPostPhoto(b);
    const channelConnectionId = await seedChannel(b, 'instagram');
    const targets = [{ channelConnectionId, captionOverride: null }];
    const send = (mediaFileId: string) =>
      f.request(
        b.owner,
        'POST',
        '/posts',
        { mediaFileIds: [mediaFileId], targets },
        { 'idempotency-key': randomUUID() },
      );
    const own = await send(ownPhoto);
    expect(own.statusCode, own.body).toBe(201);
    const url = `/posts/${own.json().id}`;
    for (const mediaFileId of [foreignPhoto, randomUUID()]) {
      const rejectedCreate = await send(mediaFileId);
      const rejectedEdit = await f.request(b.owner, 'PATCH', url, { mediaFileIds: [mediaFileId] });
      for (const rejected of [rejectedCreate, rejectedEdit]) {
        expect(rejected.statusCode, rejected.body).toBe(404);
        expect(rejected.json().error.code).toBe('POST_MEDIA_NOT_FOUND');
      }
    }
    expect((await success(b, 'GET', url, 200)).json().mediaFileIds).toEqual([ownPhoto]);
  });

  it('validates each Instagram caption and keeps AI provenance when edited', async () => {
    const shop = await f.shop();
    const channelConnectionId = await seedChannel(shop, 'instagram');
    const common = {
      caption: 'ক'.repeat(2_201),
      mediaFileIds: [await seedPostPhoto(shop)],
      isAiWritten: true,
    };
    const send = (captionOverride: string | null) =>
      f.request(
        shop.owner,
        'POST',
        '/posts',
        { ...common, targets: [{ channelConnectionId, captionOverride }] },
        { 'idempotency-key': randomUUID() },
      );
    const fallback = await send(null);
    expect(fallback.statusCode, fallback.body).toBe(400);
    expect(fallback.json().error.code).toBe('POST_CAPTION_TOO_LONG');
    const hashtags = await send('#নতুন '.repeat(31));
    expect(hashtags.statusCode, hashtags.body).toBe(400);
    expect(hashtags.json().error.code).toBe('POST_TOO_MANY_HASHTAGS');
    const created = await send('');
    expect(created.statusCode, created.body).toBe(201);
    const edited = await success(shop, 'PATCH', `/posts/${created.json().id}`, 200, {
      caption: 'ঈদের পাঞ্জাবি',
      isAiWritten: false,
    });
    expect(edited.json()).toMatchObject({
      caption: 'ঈদের পাঞ্জাবি',
      isAiWritten: true,
      targets: [{ channelConnectionId, captionOverride: '', status: 'waiting_approval' }],
    });
  });

  it('keeps another team member’s draft private and keeps team drafts read only', async () => {
    const shop = await f.shop();
    const id = await postDraft(shop, await seedChannel(shop));
    const url = `/posts/${id}`;
    await f.admin.pool.query("update memberships set built_in_role='marketer' where id=$1", [
      shop.membership,
    ]);
    expect((await f.request(shop.member, 'GET', url)).statusCode).toBe(404);
    expect((await f.request(shop.member, 'PATCH', url, { caption: 'ঈদ' })).statusCode).toBe(404);
    await f.admin.pool.query("update memberships set built_in_role='admin' where id=$1", [
      shop.membership,
    ]);
    const teamDrafts = await f.request(shop.member, 'GET', '/posts?drafts=team');
    expect(teamDrafts.statusCode, teamDrafts.body).toBe(200);
    expect(teamDrafts.json().items).toMatchObject([{ id }]);
    expect((await f.request(shop.member, 'GET', url)).statusCode).toBe(200);
    expect((await f.request(shop.member, 'DELETE', url)).statusCode).toBe(404);
  });

  it('pages drafts in order and ignores a cursor from another store', async () => {
    const { a, b } = await pair();
    const channel = await seedChannel(b);
    const older = await postDraft(b, channel);
    const newer = await postDraft(b, channel);
    const foreign = await postDraft(a, await seedChannel(a));
    const first = (await success(b, 'GET', '/posts?limit=1', 200)).json();
    expect(first).toMatchObject({ items: [{ id: newer }], nextCursor: newer });
    const next = await success(b, 'GET', `/posts?limit=1&cursor=${first.nextCursor}`, 200);
    expect(next.json()).toMatchObject({ items: [{ id: older }], nextCursor: null });
    expect((await success(b, 'GET', `/posts?cursor=${foreign}`, 200)).json().items).toEqual([]);
  });

  it('records one draft and audit entry for concurrent creates with the same key', async () => {
    const shop = await f.shop();
    const key = { 'idempotency-key': randomUUID() };
    const send = (caption: string) => f.request(shop.owner, 'POST', '/posts', { caption }, key);
    const [first, second] = await Promise.all([send('নতুন পাঞ্জাবি'), send('নতুন পাঞ্জাবি')]);
    expect(first.statusCode, first.body).toBe(201);
    expect(second.statusCode, second.body).toBe(201);
    expect(second.json().id).toBe(first.json().id);
    expect((await send('ঈদের পাঞ্জাবি')).statusCode).toBe(409);
    const audits = await f.admin.pool.query(
      'select action from audit_log where store_id=$1 and entity_id=$2 order by created_at',
      [shop.id, first.json().id],
    );
    expect(audits.rows).toEqual([{ action: 'post.created' }]);
  });

  it('refuses to approve or schedule an empty Facebook target', async () => {
    const shop = await f.shop();
    const post = await postDraft(shop, await seedChannel(shop));
    const approve = await f.request(shop.owner, 'POST', `/posts/${post}/approve`);
    const schedule = await f.request(shop.owner, 'POST', `/posts/${post}/schedule`, {
      nextSlot: true,
    });
    for (const reply of [approve, schedule]) {
      expect(reply.statusCode, reply.body).toBe(400);
      expect(reply.json().error.code).toBe('POST_CONTENT_REQUIRED');
    }
    expect(await f.row('posts', post)).toMatchObject({ approved_at: null });
  });

  it('uses a saved account slot when adding a draft to the queue', async () => {
    const shop = await f.shop();
    const channelConnectionId = await seedChannel(shop);
    const minute = 60_000;
    const scheduledFor = Math.ceil((Date.now() + 45 * minute) / minute) * minute;
    const local = new Date(scheduledFor + 360 * minute);
    await success(shop, 'PUT', '/posts/queue-slots', 200, {
      channelConnectionId,
      slots: [{ weekday: local.getUTCDay(), time: local.toISOString().slice(11, 16) }],
    });
    const post = await postDraft(shop, channelConnectionId, null);
    const queued = await success(shop, 'POST', `/posts/${post}/schedule`, 200, { nextSlot: true });
    expect(queued.json().targets).toMatchObject([
      { scheduledFor: new Date(scheduledFor).toISOString() },
    ]);
  });

  it('reserves the next free local posting time when two drafts use the same account', async () => {
    const shop = await f.shop();
    await f.admin.pool.query("update stores set time_zone='Asia/Kathmandu' where id=$1", [shop.id]);
    const connection = await seedChannel(shop);
    const first = await postDraft(shop, connection, null);
    const second = await postDraft(shop, connection, null);
    const cutoff = 15 * 60_000;
    const started = Date.now();
    const scheduled = await Promise.all(
      [first, second].map((id) =>
        success(shop, 'POST', `/posts/${id}/schedule`, 200, { nextSlot: true }),
      ),
    );
    const [earlier, later] = scheduled
      .map((reply) => Date.parse(reply.json().targets[0].scheduledFor))
      .sort((left, right) => left - right);
    const localTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kathmandu',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const earlierTime = localTime.format(earlier);
    const laterTime = localTime.format(later);
    expect([earlierTime, laterTime].sort()).toEqual(['12:30', '20:30']);
    const hour = 60 * 60_000;
    expect(earlier).toBeGreaterThanOrEqual(started + cutoff);
    expect(earlier! - (earlierTime === '12:30' ? 16 : 8) * hour).toBeLessThan(Date.now() + cutoff);
    expect(later! - earlier!).toBe((earlierTime === '12:30' ? 8 : 16) * hour);
  });

  it.each(['admin', 'marketer'] as const)('lets a %s approve their own AI draft', async (role) => {
    const shop = await f.shop();
    await f.admin.pool.query('update memberships set built_in_role=$1 where id=$2', [
      role,
      shop.membership,
    ]);
    const id = await aiPostDraft(shop, shop.member);
    const approved = await f.request(shop.member, 'POST', `/posts/${id}/approve`);
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json()).toMatchObject({ approvedByUserId: shop.member.id });
  });

  it('refuses AI approval from a custom social editor and a support agent', async () => {
    const shop = await f.shop();
    const roleId = (
      await success(shop, 'POST', '/roles', 201, {
        name: 'পোস্ট সম্পাদক',
        permissions: { ...permissions, areas: { social: 'edit' } },
      })
    ).json().id;
    await f.admin.pool.query('update memberships set built_in_role=null, role_id=$1 where id=$2', [
      roleId,
      shop.membership,
    ]);
    const id = await aiPostDraft(shop, shop.member);
    const rejected = await f.request(shop.member, 'POST', `/posts/${id}/approve`);
    expect(rejected.statusCode, rejected.body).toBe(403);
    expect(rejected.json().error.code).toBe('POST_APPROVAL_REQUIRED');
    const schedule = await f.request(shop.member, 'POST', `/posts/${id}/schedule`, {
      scheduledFor: '2099-11-20T20:30:00+06:00',
    });
    expect(schedule.statusCode, schedule.body).toBe(403);
    expect(schedule.json().error.code).toBe('POST_APPROVAL_REQUIRED');
    await f.admin.pool.query(
      "update memberships set built_in_role='support_agent', role_id=null where id=$1",
      [shop.membership],
    );
    expect((await f.request(shop.member, 'POST', `/posts/${id}/approve`)).statusCode).toBe(403);
    expect(await f.row('posts', id)).toMatchObject({ approved_at: null });
  });

  for (const [route, run] of fixtures) it(route, run);
});
