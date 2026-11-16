import 'reflect-metadata';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { DatabaseModule } from '../platform/database/database.module';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { SessionsModule } from '../sessions/sessions.module';
import { SessionsService } from '../sessions/sessions.service';
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

describe('NotificationsService and its routes', () => {
  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter(), {
      logger: false,
    });
    await registerSessionCookies(app);
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    service = app.get(NotificationsService);
  });
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
});
