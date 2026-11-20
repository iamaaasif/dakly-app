import 'reflect-metadata';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { ValkeyClient } from '../platform/cache/valkey-client';
import { DatabaseModule } from '../platform/database/database.module';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { SessionsModule } from '../sessions/sessions.module';
import { SessionsService } from '../sessions/sessions.service';
import { StreamNotificationOnCreated } from './jobs/stream-notification-on-created.job';
import { WakeSnoozedNotificationsJob } from './jobs/wake-snoozed-notifications.job';
import { NotificationStreamService, STREAM_HEARTBEAT_MS } from './notification-stream.service';
import { NotificationsModule } from './notifications.module';
import { type NotifyInput, NotificationsService } from './notifications.service';

class TestModule {}
Module({ imports: [DatabaseModule, SessionsModule, NotificationsModule] })(TestModule);

type Member = { userId: string; sessionId: string; cookie: string };
type Shop = { id: string; owner: Member; agent: Member; marketer: Member; chatRole: Member };

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeIds: string[] = [];
const userIds: string[] = [];
let app: NestFastifyApplication;
let service: NotificationsService;
let job: StreamNotificationOnCreated;
let baseUrl: string;

const handedOver = (dedupeKey = randomUUID()): NotifyInput => ({
  type: 'conversation.handed_over',
  category: 'fix_now',
  dedupeKey,
  recipientPermission: 'chats.view',
  title: 'A chat needs a person',
  body: 'রিনা asked about delivery charge',
  actionUrl: '/chats',
});

async function member(storeId: string, role: string | { roleId: string }): Promise<Member> {
  const userId = randomUUID();
  userIds.push(userId);
  await admin.pool.query(
    'insert into users(id,name,phone,phone_verified_at) values($1,$2,$3,now())',
    [userId, 'করিম', `017${randomInt(10000000, 99999999)}`],
  );
  await admin.pool.query(
    "insert into memberships(id,store_id,user_id,built_in_role,role_id,status) values(gen_random_uuid(),$1,$2,$3,$4,'active')",
    [
      storeId,
      userId,
      typeof role === 'string' ? role : null,
      typeof role === 'string' ? null : role.roleId,
    ],
  );
  const sessions = app.get(SessionsService);
  const { token, session } = await sessions.create(userId, { isRemembered: false });
  await sessions.setActiveStore(userId, session.id, storeId);
  return { userId, sessionId: session.id, cookie: `dakly_session=${token}` };
}

async function shop(): Promise<Shop> {
  const id = randomUUID();
  storeIds.push(id);
  await admin.pool.query('insert into stores(id,name) values($1,$2)', [id, 'রিনার দোকান']);
  const [roleId, packerId] = [randomUUID(), randomUUID()];
  await admin.pool.query(
    'insert into roles(id,store_id,name,permissions) values($1,$2,$3,$4),($5,$2,$6,$7)',
    [roleId, id, 'Chat helper', { chats: 'view' }, packerId, 'Packer', { orders: 'edit' }],
  );
  const [owner, agent, marketer, chatRole] = await Promise.all([
    member(id, 'owner'),
    member(id, 'support_agent'),
    member(id, 'marketer'),
    member(id, { roleId }),
  ]);
  await member(id, { roleId: packerId });
  return { id, owner, agent, marketer, chatRole };
}

async function rows(storeId: string) {
  const result = await admin.pool.query<{ id: string; user_id: string }>(
    'select id, user_id from notifications where store_id=$1',
    [storeId],
  );
  return result.rows;
}

async function events(storeId: string) {
  const result = await admin.pool.query<{
    id: string;
    type: string;
    payload: { notificationId: string; userId: string; category: string };
    occurred_at: Date;
  }>(
    "select id, type, payload, occurred_at from outbox_events where store_id=$1 and type='notification.created'",
    [storeId],
  );
  return result.rows;
}

// Runs the subscriber job the outbox relay would queue for each event.
async function relay(storeId: string, except: string[] = []) {
  for (const event of await events(storeId))
    if (!except.includes(event.payload.notificationId))
      await job.handle({
        id: event.id,
        storeId,
        type: event.type,
        payload: event.payload,
        occurredAt: event.occurred_at.toISOString(),
      });
}

async function until(condition: () => boolean | Promise<boolean>) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await condition()) return;
    await setTimeout(25);
  }
  throw new Error('Condition not reached');
}

async function subscribers(storeId: string) {
  const reply = await app.get(ValkeyClient).connection.pubsub('NUMSUB', `notifications:${storeId}`);
  return (reply as [string, number])[1];
}

// light-my-request's mock socket lacks the socket methods Nest's SSE stream calls, so streams
// go over a real loopback connection.
async function openStream(viewer: Member, storeId: string, lastEventId?: string) {
  const abort = new AbortController();
  const response = await fetch(`${baseUrl}/events/stream`, {
    headers: { cookie: viewer.cookie, ...(lastEventId && { 'last-event-id': lastEventId }) },
    signal: abort.signal,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('text/event-stream');
  let text = '';
  let isEnded = false;
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  void (async () => {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
      text += chunk.value;
    isEnded = true;
  })().catch(() => (isEnded = true));
  // The server sends this comment once this stream has joined its channel.
  await until(() => text.includes(': ready'));
  return {
    ids: () => [...text.matchAll(/^id: (.+)$/gm)].map((match) => match[1]),
    text: () => text,
    isEnded: () => isEnded,
    close: () => abort.abort(),
  };
}

describe('NotificationsService and its routes', () => {
  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter(), {
      logger: false,
    });
    await registerSessionCookies(app);
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    service = app.get(NotificationsService);
    job = new StreamNotificationOnCreated(app.get(NotificationStreamService));
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      for (const table of ['notifications', 'outbox_events', 'memberships', 'roles'])
        await admin.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [storeIds]);
      await admin.pool.query('delete from account_security_events where user_id=any($1::uuid[])', [
        userIds,
      ]);
      await admin.pool.query('delete from sessions where user_id=any($1::uuid[])', [userIds]);
      await admin.pool.query('delete from stores where id=any($1::uuid[])', [storeIds]);
      await admin.pool.query('delete from users where id=any($1::uuid[])', [userIds]);
      await admin.pool.end();
    }
  });

  it('makes one row per permitted member and one event per row when the same rule fires twice', async () => {
    const a = await shop();
    const input = handedOver();
    await service.notify(a.id, input);
    await service.notify(a.id, input);
    const recipients = [a.owner, a.agent, a.chatRole].map((viewer) => viewer.userId).sort();
    const created = await rows(a.id);
    expect(created.map((row) => row.user_id).sort()).toEqual(recipients);
    const published = await events(a.id);
    expect(published.map((event) => event.payload.notificationId).sort()).toEqual(
      created.map((row) => row.id).sort(),
    );
    expect(published.map((event) => event.payload.userId).sort()).toEqual(recipients);
  });

  it('gives no row to an invited or removed member whose role would grant the permission', async () => {
    const a = await shop();
    await admin.pool.query(
      "insert into memberships(id,store_id,built_in_role,status,invite_phone,invite_token_hash,invite_expires_at) values(gen_random_uuid(),$1,'admin','invited',$2,$3,now()+interval '1 day')",
      [a.id, `018${randomInt(10000000, 99999999)}`, randomBytes(32)],
    );
    const removed = await member(a.id, 'admin');
    await admin.pool.query(
      "update memberships set status='removed' where store_id=$1 and user_id=$2",
      [a.id, removed.userId],
    );
    await service.notify(a.id, handedOver());
    const users = (await rows(a.id)).map((row) => row.user_id).sort();
    expect(users).toEqual([a.owner.userId, a.agent.userId, a.chatRole.userId].sort());
  });

  it('lists, marks and snoozes only the signed-in member’s own rows', async () => {
    const a = await shop();
    await service.notify(a.id, handedOver());
    await service.notify(a.id, { ...handedOver(), category: 'billing', title: 'Renew soon' });
    const request = (viewer: Member, method: 'GET' | 'POST', url: string, payload?: object) =>
      app.inject({
        method,
        url,
        payload,
        headers: { cookie: viewer.cookie, origin: 'http://localhost:3000' },
      });
    const list = await request(a.owner, 'GET', '/notifications?limit=1');
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().items).toHaveLength(1);
    const first = list.json().items[0];
    expect(first.title).toBe('Renew soon');
    const next = await request(
      a.owner,
      'GET',
      `/notifications?limit=1&cursor=${list.json().nextCursor}`,
    );
    expect(next.json()).toMatchObject({
      items: [{ title: 'A chat needs a person' }],
      nextCursor: null,
    });
    const billing = await request(a.owner, 'GET', '/notifications?category=billing');
    expect(billing.json().items.map((item: { id: string }) => item.id)).toEqual([first.id]);

    expect((await request(a.owner, 'POST', `/notifications/${first.id}/seen`)).statusCode).toBe(
      204,
    );
    const snoozeUntil = new Date(Date.now() + 3_600_000).toISOString();
    expect(
      (await request(a.owner, 'POST', `/notifications/${first.id}/snooze`, { until: snoozeUntil }))
        .statusCode,
    ).toBe(204);
    expect((await request(a.owner, 'POST', `/notifications/${first.id}/seen`)).statusCode).toBe(
      204,
    );
    const snoozed = await request(a.owner, 'GET', '/notifications?status=snoozed');
    expect(snoozed.json().items).toMatchObject([
      { id: first.id, status: 'snoozed', snoozedUntil: snoozeUntil },
    ]);
    expect((await request(a.owner, 'POST', `/notifications/${first.id}/done`)).statusCode).toBe(
      204,
    );
    const done = await request(a.owner, 'POST', `/notifications/${first.id}/snooze`, {
      until: snoozeUntil,
    });
    expect(done.json().error.code).toBe('NOTIFICATION_DONE');
    const past = await request(a.owner, 'POST', `/notifications/${first.id}/snooze`, {
      until: new Date(Date.now() - 1000).toISOString(),
    });
    expect(past.json().error.code).toBe('SNOOZE_NOT_IN_FUTURE');

    const foreign = await request(a.agent, 'POST', `/notifications/${first.id}/done`);
    const missing = await request(a.agent, 'POST', `/notifications/${randomUUID()}/done`);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual(missing.json());
    const agentRows = (await request(a.agent, 'GET', '/notifications')).json().items;
    expect(agentRows.map((item: { status: string }) => item.status)).toEqual(['new', 'new']);
    expect(agentRows.map((item: { id: string }) => item.id)).not.toContain(first.id);
  });

  it('answers two changes made at once on one card consistently', async () => {
    const a = await shop();
    await service.notify(a.id, handedOver());
    const [card] = (await rows(a.id)).filter((row) => row.user_id === a.owner.userId);
    const until = new Date(Date.now() + 3_600_000).toISOString();
    for (let round = 0; round < 5; round += 1) {
      await admin.pool.query(
        "update notifications set status='new', snoozed_until=null where id=$1",
        [card!.id],
      );
      const [done, snoozed] = await Promise.allSettled([
        service.markDone(a.id, a.owner.userId, card!.id),
        service.snooze(a.id, a.owner.userId, card!.id, { until }),
      ]);
      expect(done.status).toBe('fulfilled');
      const final = await admin.pool.query('select status from notifications where id=$1', [
        card!.id,
      ]);
      expect(final.rows[0].status).toBe('done');
      if (snoozed.status === 'rejected')
        expect((snoozed.reason as { code: string }).code).toBe('NOTIFICATION_DONE');
    }
  });

  it('wakes a card whose snooze has passed and leaves one snoozed until later', async () => {
    const a = await shop();
    await service.notify(a.id, handedOver());
    const [due, later] = (await rows(a.id)).filter((row) => row.user_id !== a.chatRole.userId);
    await admin.pool.query(
      "update notifications set status='snoozed', snoozed_until=now()-interval '1 minute' where id=$1",
      [due!.id],
    );
    await service.snooze(a.id, later!.user_id, later!.id, {
      until: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const wake = new WakeSnoozedNotificationsJob(service);
    const states = async () =>
      (
        await admin.pool.query<{ id: string; status: string; snoozed_until: Date | null }>(
          'select id, status, snoozed_until from notifications where id=any($1::uuid[]) order by id',
          [[due!.id, later!.id]],
        )
      ).rows;
    await wake.handle({});
    const woken = await states();
    expect(woken.find((row) => row.id === due!.id)).toMatchObject({
      status: 'new',
      snoozed_until: null,
    });
    expect(woken.find((row) => row.id === later!.id)?.status).toBe('snoozed');
    await wake.handle({});
    expect(await states()).toEqual(woken);
  });

  it('streams a notification only to its own user in its own store', async () => {
    const [a, b] = [await shop(), await shop()];
    const ownerA = await openStream(a.owner, a.id);
    const agentA = await openStream(a.agent, a.id);
    const marketerA = await openStream(a.marketer, a.id);
    const ownerB = await openStream(b.owner, b.id);
    await service.notify(a.id, handedOver());
    await relay(a.id);
    const created = await rows(a.id);
    const ownRow = (viewer: Member) => created.find((row) => row.user_id === viewer.userId)!.id;
    await until(() => ownerA.ids().length === 1 && agentA.ids().length === 1);
    await setTimeout(100);
    expect(ownerA.ids()).toEqual([ownRow(a.owner)]);
    expect(agentA.ids()).toEqual([ownRow(a.agent)]);
    expect(ownerA.text()).toContain('"title":"A chat needs a person"');
    expect(ownerA.text()).not.toContain(a.owner.userId);
    expect(marketerA.ids()).toEqual([]);
    expect(ownerB.ids()).toEqual([]);
  });

  it('sends the rows created while disconnected once each, then live ones', async () => {
    const a = await shop();
    await service.notify(a.id, handedOver());
    const [seen] = (await rows(a.id)).filter((row) => row.user_id === a.owner.userId);
    await service.notify(a.id, handedOver());
    await service.notify(a.id, handedOver());
    const missed = (await rows(a.id))
      .filter((row) => row.user_id === a.owner.userId && row.id !== seen!.id)
      .map((row) => row.id)
      .sort();
    const stream = await openStream(a.owner, a.id, seen!.id);
    await until(() => stream.ids().length === 2);
    await relay(a.id, [seen!.id]);
    await service.notify(a.id, handedOver());
    await relay(a.id, [seen!.id]);
    await until(() => stream.ids().length === 3);
    await setTimeout(100);
    const ids = stream.ids();
    expect(ids.slice(0, 2)).toEqual(missed);
    expect(new Set(ids).size).toBe(3);
    expect(ids).not.toContain(seen!.id);
  });

  it('closes a stream at the next heartbeat once its session is revoked or its membership ends', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const a = await shop();
    const revoked = await openStream(a.owner, a.id);
    const removed = await openStream(a.agent, a.id);
    const active = await openStream(a.chatRole, a.id);
    await app.get(SessionsService).revoke(a.owner.userId, a.owner.sessionId);
    await admin.pool.query(
      "update memberships set status='removed' where store_id=$1 and user_id=$2",
      [a.id, a.agent.userId],
    );
    await vi.advanceTimersByTimeAsync(STREAM_HEARTBEAT_MS);
    await until(
      () => revoked.isEnded() && removed.isEnded() && active.text().includes(': heartbeat'),
    );
    expect(active.isEnded()).toBe(false);
    for (const stream of [revoked, removed, active]) expect(stream.text()).not.toContain('error');
  });

  it('sends one Cache-Control header on the stream', async () => {
    const a = await shop();
    const abort = new AbortController();
    const response = await fetch(`${baseUrl}/events/stream`, {
      headers: { cookie: a.owner.cookie },
      signal: abort.signal,
    });
    // fetch joins repeated headers with a comma, so a second copy would change this value.
    expect(response.headers.get('cache-control')).toBe(
      'private, no-cache, no-store, must-revalidate, max-age=0, no-transform',
    );
    expect(response.headers.get('x-session-context')).toBeTruthy();
    abort.abort();
  });

  it('rejects a stream without a session or with a malformed Last-Event-ID', async () => {
    const a = await shop();
    const anonymous = await fetch(`${baseUrl}/events/stream`);
    expect(anonymous.status).toBe(401);
    const malformed = await fetch(`${baseUrl}/events/stream`, {
      headers: { cookie: a.owner.cookie, 'last-event-id': '42' },
    });
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe('VALIDATION_FAILED');
  });

  it('leaves the store channel once the last stream of that store closes', async () => {
    const a = await shop();
    const first = await openStream(a.owner, a.id);
    const second = await openStream(a.agent, a.id);
    first.close();
    await setTimeout(100);
    expect(await subscribers(a.id)).toBe(1);
    second.close();
    await until(async () => (await subscribers(a.id)) === 0);
  });
});
