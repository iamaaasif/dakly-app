import 'reflect-metadata';
import { randomBytes, randomUUID, randomInt } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
const dhaka = {
  match: 'all',
  conditions: [{ field: 'district', operator: 'is_any_of', values: ['ঢাকা'] }],
};
async function dhakaContact(shop: Shop) {
  const id = await contact(shop);
  await f.admin.pool.query("update contacts set district='ঢাকা' where id=$1", [id]);
}
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
      ['ownership_transfers', 'id', await f.transfer(a), await f.transfer(b)],
      ['support_grants', 'id', (await f.grant(a, false)).id, (await f.grant(b, false)).id],
      ['staff_recovery_history', 'audit_id', await f.recovery(a), await f.recovery(b)],
      ['wallet_ledger', 'id', await smsCredits(a, 10), await smsCredits(b, 20)],
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
