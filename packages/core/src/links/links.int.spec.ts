import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { ConsentService } from '../consents/consent.service';
import { DatabaseModule } from '../platform/database/database.module';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { SessionsModule } from '../sessions/sessions.module';
import { LinksModule } from './links.module';
import { LinksService } from './links.service';

class TestModule {}
Module({ imports: [DatabaseModule, SessionsModule, LinksModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeA = randomUUID();
const storeB = randomUUID();
const campaignId = randomUUID();
const system = { kind: 'system' } as const;
const userAgent = 'Mozilla/5.0 (Linux; Android 14; SM-A155F) Chrome/131.0 Mobile';
const target = 'https://rinar-dokan.example.test/products/jamdani-saree';
let app: NestFastifyApplication;
let links: LinksService;
let consent: ConsentService;

// A fresh address per test keeps the per-IP limit from carrying over between tests.
const newIp = () => `2001:db8::${randomInt(1, 65535).toString(16)}`;
const code = (url: string) => url.split('/').at(-1)!;
const path = (url: string) => new URL(url).pathname;
const tap = (url: string, ip = newIp(), agent = userAgent) =>
  app.inject({
    method: 'GET',
    url: path(url),
    headers: { 'user-agent': agent },
    remoteAddress: ip,
  });
const optOut = (url: string, origin = new URL(url).origin) =>
  app.inject({
    method: 'POST',
    url: path(url),
    headers: { origin, 'content-type': 'text/plain' },
    payload: '',
    remoteAddress: newIp(),
  });

async function contact(storeId: string) {
  const id = randomUUID();
  await admin.pool.query(
    "insert into contacts(id,store_id,name,source,kind) values($1,$2,'নুসরাত জাহান','manual','customer')",
    [id, storeId],
  );
  return id;
}

async function redirectLink(storeId: string, contactId: string) {
  const [link] = await links.create(
    storeId,
    [
      {
        kind: 'redirect',
        targetUrl: target,
        sourceType: 'campaign',
        sourceId: campaignId,
        contactId,
      },
    ],
    system,
  );
  return link!;
}

async function optOutLink(storeId: string, contactId: string) {
  const [link] = await links.create(
    storeId,
    [{ kind: 'sms_opt_out', sourceType: 'campaign', sourceId: campaignId, contactId }],
    system,
  );
  return link!;
}

async function events(type: string, trackedLinkId: string) {
  const result = await admin.pool.query<{ store_id: string; payload: object }>(
    "select store_id, payload from outbox_events where type=$1 and payload->>'trackedLinkId'=$2",
    [type, trackedLinkId],
  );
  return result.rows;
}

async function visits(trackedLinkId: string) {
  const result = await admin.pool.query<{ row: Record<string, unknown>; hash: Buffer }>(
    'select to_jsonb(v) as row, visitor_hash as hash from tracked_link_visits v where tracked_link_id=$1 order by occurred_at',
    [trackedLinkId],
  );
  return result.rows;
}

describe('tracked links over Fastify', () => {
  beforeAll(async () => {
    await admin.pool.query(
      "insert into stores(id,name) values($1,'রিনার দোকান'),($2,'করিমের দোকান')",
      [storeA, storeB],
    );
    app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter(), {
      logger: false,
    });
    await registerSessionCookies(app);
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    links = app.get(LinksService);
    consent = app.get(ConsentService);
  });

  afterAll(async () => {
    try {
      await app?.close();
      for (const table of ['outbox_events', 'tracked_links', 'contacts'])
        await admin.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
          [storeA, storeB],
        ]);
      await admin.pool.query('delete from stores where id=any($1::uuid[])', [[storeA, storeB]]);
    } finally {
      await admin.pool.end();
    }
  });

  it('redirects to the stored URL and keeps no IP or user agent', async () => {
    const link = await redirectLink(storeA, await contact(storeA));
    const ip = newIp();

    const response = await tap(link.url, ip);

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(target);
    const [visit] = await visits(link.id);
    expect(visit!.hash).toHaveLength(32);
    const stored = JSON.stringify(visit!.row);
    expect(stored).not.toContain(ip);
    expect(stored).not.toContain('Android');
    expect(Object.keys(visit!.row).sort()).toEqual(
      ['event_key', 'id', 'occurred_at', 'store_id', 'tracked_link_id', 'visitor_hash'].sort(),
    );
  });

  it('counts every tap as a visit but emits the first tap once', async () => {
    const contactId = await contact(storeA);
    const link = await redirectLink(storeA, contactId);
    const ip = newIp();

    await tap(link.url, ip);
    await tap(link.url, ip);
    await tap(link.url, ip, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1) Safari/604.1');

    const rows = await visits(link.id);
    expect(rows).toHaveLength(3);
    // One visitor hashes the same within a day; another browser is another visitor.
    expect(rows[0]!.hash.equals(rows[1]!.hash)).toBe(true);
    expect(rows[0]!.hash.equals(rows[2]!.hash)).toBe(false);
    const counts = await admin.pool.query(
      'select tap_count, first_tapped_at <= last_tapped_at as ordered from tracked_links where id=$1',
      [link.id],
    );
    expect(counts.rows).toEqual([{ tap_count: 3, ordered: true }]);
    expect((await events('message.tapped', link.id)).map((event) => event.payload)).toEqual([
      { trackedLinkId: link.id, contactId, sourceType: 'campaign', sourceId: campaignId },
    ]);
  });

  it('answers an unknown code exactly as a deleted link', async () => {
    const link = await redirectLink(storeA, await contact(storeA));
    await admin.pool.query('delete from tracked_links where id=$1', [link.id]);

    const deleted = await tap(link.url);
    const unknown = await tap(link.url.replace(code(link.url), 'Zz0Zz0Zz'));

    expect(deleted.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(deleted.statusCode);
    expect(unknown.body).toBe(deleted.body);
    expect(unknown.headers['content-type']).toBe(deleted.headers['content-type']);
    expect(unknown.headers.location).toBeUndefined();
  });

  it('serves a code only on the path of its kind', async () => {
    const contactId = await contact(storeA);
    const redirect = await redirectLink(storeA, contactId);
    const stop = await optOutLink(storeA, contactId);

    expect((await tap(stop.url.replace('/s/', '/'))).statusCode).toBe(404);
    expect(
      (await tap(redirect.url.replace(code(redirect.url), `s/${code(redirect.url)}`))).statusCode,
    ).toBe(404);
    expect(await visits(stop.id)).toEqual([]);
  });

  it('withdraws SMS consent once when the opt-out is tapped twice', async () => {
    const contactId = await contact(storeA);
    await consent.record(
      storeA,
      { contactId, channel: 'sms', status: 'granted', source: 'manual', evidence: 'দোকানে রাজি' },
      { kind: 'system' },
    );
    const link = await optOutLink(storeA, contactId);

    const page = await tap(link.url);
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('Stop offers');
    expect(await consent.current(storeA, [contactId], 'sms')).toEqual([
      expect.objectContaining({ status: 'granted' }),
    ]);

    const [first, second] = await Promise.all([optOut(link.url), optOut(link.url)]);
    expect([first!.statusCode, second!.statusCode]).toEqual([200, 200]);

    // The marketing send gate reads this same current row.
    expect(await consent.current(storeA, [contactId], 'sms')).toEqual([
      expect.objectContaining({ status: 'withdrawn', source: 'opt_out_link' }),
    ]);
    const withdrawals = await admin.pool.query(
      "select count(*)::int as count from consents where contact_id=$1 and status='withdrawn'",
      [contactId],
    );
    expect(withdrawals.rows).toEqual([{ count: 1 }]);
    expect((await events('message.opted_out', link.id)).map((event) => event.payload)).toEqual([
      { trackedLinkId: link.id, contactId, sourceType: 'campaign', sourceId: campaignId },
    ]);
  });

  it('refuses an opt-out posted from another site', async () => {
    const contactId = await contact(storeA);
    const link = await optOutLink(storeA, contactId);

    const response = await optOut(link.url, 'https://evil.example.test');

    expect(response.statusCode).toBe(403);
    expect(await consent.current(storeA, [contactId], 'sms')).toEqual([]);
  });

  it('limits taps from one address', async () => {
    const ip = newIp();
    const unknown = 'http://localhost:4000/l/Zz9Zz9Zz';
    for (let request = 0; request < 120; request++)
      expect((await tap(unknown, ip)).statusCode).toBe(404);

    expect((await tap(unknown, ip)).statusCode).toBe(429);
  });

  it('records a tap and its event in the link store only', async () => {
    const link = await redirectLink(storeB, await contact(storeB));

    await tap(link.url);

    expect((await visits(link.id)).map((visit) => visit.row.store_id)).toEqual([storeB]);
    expect((await events('message.tapped', link.id)).map((event) => event.store_id)).toEqual([
      storeB,
    ]);
  });

  it('refuses a link for a contact of another store', async () => {
    await expect(redirectLink(storeA, await contact(storeB))).rejects.toThrow();
  });
});
