import 'reflect-metadata';
import { randomBytes, randomUUID, randomInt } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeliveryService } from '@dakly/core/delivery/delivery.service';
import { NotificationStreamService } from '@dakly/core/notifications/notification-stream.service';
import { NotificationsService } from '@dakly/core/notifications/notifications.service';
import { ValkeyClient } from '@dakly/core/platform/cache/valkey-client';
import { loadEnv } from '@dakly/core/platform/config/env';
import { DATABASE_CONNECTION } from '@dakly/core/platform/database/database.tokens';
import { createHttpServer } from '@dakly/core/platform/http/http-server';
import { registerSessionCookies } from '@dakly/core/platform/http/session-cookie';
import { SmsService } from '@dakly/core/sms/sms.service';

import { AppModule } from '../src/app.module';
import { isolationBoundaries } from './isolation-boundaries';
import { IsolationFixture, type Shop } from './isolation-fixture';
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
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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
  await f.admin.pool.query(
    `update orders set stage='delivered', source='whatsapp', courier='pathao',
      created_at=case when id=$1 then '2026-11-16T18:00:00Z'::timestamptz
                      else '2026-11-17T17:59:59Z'::timestamptz end
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
  for (const unmatched of [
    filtered.replace('source=whatsapp', 'source=manual'),
    filtered.replace('courier=pathao', 'courier=redx'),
    filtered.replaceAll('2026-11-17', '2026-11-18'),
  ]) {
    expect((await success(a, 'GET', unmatched, 200)).json().items).toEqual([]);
  }
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
  expect((await success(a, 'GET', '/automations', 200)).json().items[0].id).toBe(aId);
});
fixture('POST /automations', async () => {
  const { a, b } = await pair(),
    id = await automation(a),
    before = await f.row('automations', id);
  const own = await automation(b);
  expect((await f.row('automations', own)).store_id).toBe(b.id);
  expect(await f.row('automations', id)).toEqual(before);
});
fixture('GET /automations/:automationId', async () => {
  const { a, b } = await pair(),
    { id, versionId } = await publishedAutomation(a);
  const own = (await success(a, 'GET', `/automations/${id}`, 200)).json();
  expect(own.versions.map((version: { id: string }) => version.id)).toEqual([versionId]);
  await hidden(b, 'GET', (value) => `/automations/${value}`, id);
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
  for (const shop of [a, b])
    await vi.waitFor(async () => {
      const reply = await app
        .get(ValkeyClient)
        .connection.pubsub('NUMSUB', `notifications:${shop.id}`);
      expect((reply as [string, number])[1]).toBe(1);
    });
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

describe('every production shop route isolates its data', () => {
  let logs: ReturnType<typeof captureRequestLogs>;
  beforeEach(() => logs.beginTest());
  beforeAll(async () => {
    vi.stubEnv('STAFF_SESSION_SIGNING_KEY', randomBytes(32).toString('base64'));
    const adapter = new FastifyAdapter(createHttpServer(loadEnv().API_TRUSTED_PROXIES));
    adapter.getInstance().addHook('onRoute', (route) => {
      inventory.record(route);
    });
    app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      logger: false,
      abortOnError: false,
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
    }
  });
  it('requires an executable fixture or a named boundary proof for every actual Fastify route', () => {
    inventory.assertCovered([...fixtures.keys(), ...isolationBoundaries.keys()]);
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
  for (const [route, run] of fixtures) it(route, run);
});
