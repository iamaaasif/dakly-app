import 'reflect-metadata';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type AddressInfo, type Socket } from 'node:net';

import { getQueueToken } from '@nestjs/bullmq';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { resetEnvForTests } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { createHttpServer } from '../platform/http/http-server';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { SessionsModule } from '../sessions/sessions.module';
import { SessionsService } from '../sessions/sessions.service';
import { ProcessWebhookEventJob } from './jobs/process-webhook-event.job';
import { MetaWebhookRoutingModule } from './meta-webhook-routing.module';
import { MetaWebhooksModule } from './meta-webhooks.module';

class TestModule {}
Module({ imports: [DatabaseModule, SessionsModule, MetaWebhooksModule, MetaWebhookRoutingModule] })(
  TestModule,
);

const appSecret = 'local-meta-signing-material';
const appId = '104404';
const verifyToken = 'local-meta-verification-material';
const webhookPath = '/webhooks/meta';
const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const deliveryKeys = new Set<string>();
let app: NestFastifyApplication;
let queue: Queue;

const delivery = (object = 'page') =>
  `{ "object": "${object}", "entry": [{ "id": "123456", "messaging": [{ "message": { "mid": "${randomUUID()}", "text": "দাম কত?" } }] }] }`;

const signature = (payload: string) =>
  `sha256=${createHmac('sha256', appSecret).update(payload).digest('hex')}`;

function post(payload: string, signed = signature(payload), contentType = 'application/json') {
  deliveryKeys.add(createHash('sha256').update(payload).digest('hex'));
  return app.inject({
    url: webhookPath,
    method: 'POST',
    headers: {
      'content-type': contentType,
      'x-hub-signature-256': signed,
      cookie: 'dakly_session=untrusted-cookie',
    },
    payload,
  });
}

async function stored(payload: string) {
  const externalId = createHash('sha256').update(payload).digest('hex');
  const result = await admin.pool.query<{
    id: string;
    payload: object | null;
    status: string;
    error: string | null;
    processedAt: Date | null;
  }>(
    `select id, payload, status, error, processed_at as "processedAt"
     from webhook_events where provider = 'meta' and external_id = $1`,
    [externalId],
  );
  return result.rows;
}

function verify(mode: string, token: string) {
  const query = new URLSearchParams({
    'hub.mode': mode,
    'hub.verify_token': token,
    'hub.challenge': '001158201444',
  });
  return app.inject({
    url: `${webhookPath}?${query}`,
    headers: { cookie: 'dakly_session=untrusted-cookie' },
  });
}

describe('Meta webhook intake', () => {
  beforeAll(async () => {
    vi.stubEnv('META_APP_SECRET', appSecret);
    vi.stubEnv('META_APP_ID', appId);
    vi.stubEnv('META_WEBHOOK_VERIFY_TOKEN', verifyToken);
    resetEnvForTests();
    app = await NestFactory.create<NestFastifyApplication>(
      TestModule,
      new FastifyAdapter(createHttpServer([])),
      {
        rawBody: true,
        logger: false,
      },
    );
    await registerSessionCookies(app);
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    queue = app.get(getQueueToken('inbound'));
    const client = await queue.waitUntilReady();
    if (client.status !== 'ready')
      await new Promise<void>((resolve) => client.once('ready', resolve));
  });

  afterAll(async () => {
    try {
      await app?.close();
      await admin.pool.query(
        "delete from webhook_events where provider = 'meta' and external_id = any($1::text[])",
        [[...deliveryKeys]],
      );
    } finally {
      await admin.pool.end();
      vi.unstubAllEnvs();
      resetEnvForTests();
    }
  });

  it('echoes the challenge only for a valid subscription request', async () => {
    const response = await verify('subscribe', verifyToken);
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('001158201444');
    expect(response.headers['content-type']).toMatch(/^text\/plain/);
    expect((await verify('subscribe', 'wrong-token')).statusCode).toBe(403);
    expect((await verify('unsubscribe', verifyToken)).statusCode).toBe(400);
  });

  it('stores a concurrent duplicate once and answers while its single job waits', async () => {
    const payload = delivery();
    const [first, second] = await Promise.all([post(payload), post(payload)]);
    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);

    const rows = await stored(payload);
    expect(rows).toEqual([
      {
        id: expect.any(String),
        payload: JSON.parse(payload),
        status: 'received',
        error: null,
        processedAt: null,
      },
    ]);
    const job = await queue.getJob(rows[0]!.id);
    expect(job?.name).toBe('process-webhook-event');
    expect(job?.data).toEqual({ webhookEventId: rows[0]!.id });
    expect(await job?.getState()).toBe('waiting');
  });

  it.each(['unknown', 'disconnected', 'active'] as const)(
    'routes a signed delivery for an %s account and clears its payload',
    async (status) => {
      const storeId = randomUUID();
      const accountId = randomUUID();
      const payload = JSON.stringify({
        object: 'page',
        entry: [
          {
            id: accountId,
            messaging: [
              {
                sender: { id: '987' },
                recipient: { id: accountId },
                timestamp: 1795053600000,
                message: { mid: 'mid.001', text: 'দাম কত?' },
              },
              {
                sender: { id: '987' },
                recipient: { id: accountId },
                timestamp: 8.64e15,
                message: { mid: 'mid.invalid', text: 'Invalid timestamp' },
              },
            ],
          },
        ],
      });
      await admin.pool.query('insert into stores (id, name) values ($1, $2)', [
        storeId,
        'Routing test',
      ]);
      try {
        if (status !== 'unknown')
          await admin.pool.query(
            `insert into channel_connections (id, store_id, kind, external_account_id, display_name, status, connected_at)
           values ($1, $2, 'facebook_page', $3, 'Routing test', $4, $5)`,
            [randomUUID(), storeId, accountId, status, new Date(1795053480000)],
          );
        expect((await post(payload)).statusCode).toBe(200);
        const [received] = await stored(payload);
        expect(received?.status).toBe('received');
        const handler = app.get(ProcessWebhookEventJob);
        await handler.handle({ webhookEventId: received?.id }, true);
        const [ignored] = await stored(payload);
        expect(ignored).toMatchObject({
          status: status === 'active' ? 'processed' : 'ignored',
          payload: null,
          processedAt: expect.any(Date),
          error: status === 'active' ? null : 'unknown_account',
        });
        const messages = await admin.pool.query('select body from messages where store_id = $1', [
          storeId,
        ]);
        expect(messages.rows).toEqual(status === 'active' ? [{ body: 'দাম কত?' }] : []);
        await handler.handle({ webhookEventId: received?.id }, true);
        expect(await stored(payload)).toEqual([ignored]);
      } finally {
        for (const table of [
          'outbox_events',
          'messages',
          'conversations',
          'contact_identities',
          'contacts',
          'channel_connections',
        ])
          await admin.pool.query(`delete from ${table} where store_id = $1`, [storeId]);
        await admin.pool.query('delete from stores where id = $1', [storeId]);
      }
    },
  );

  it.each(['before', 'after'] as const)(
    'keeps a delayed delivery arriving %s transfer from reaching the next shop',
    async (arrival) => {
      const firstStore = randomUUID();
      const secondStore = randomUUID();
      const accountId = randomUUID();
      const transferAt = Date.now() - 1000;
      const providerTime = transferAt + 30_000;
      const payload = JSON.stringify({
        object: 'page',
        entry: [
          {
            id: accountId,
            messaging: [
              {
                sender: { id: '987' },
                recipient: { id: accountId },
                timestamp: providerTime,
                message: { mid: 'mid.001', text: 'আগের দোকানের বার্তা' },
              },
            ],
          },
        ],
      });
      await admin.pool.query(
        "insert into stores (id, name) values ($1, 'Old shop'), ($2, 'New shop')",
        [firstStore, secondStore],
      );
      try {
        await admin.pool.query(
          `insert into channel_connections (id, store_id, kind, external_account_id, display_name, connected_at)
        values ($1, $2, 'facebook_page', $3, 'Old Page', $4)`,
          [randomUUID(), firstStore, accountId, new Date(transferAt - 120_000)],
        );
        if (arrival === 'before') expect((await post(payload)).statusCode).toBe(200);
        await admin.pool.query(
          "update channel_connections set status = 'disconnected' where store_id = $1",
          [firstStore],
        );
        await admin.pool.query(
          `insert into channel_connections (id, store_id, kind, external_account_id, display_name, connected_at)
        values ($1, $2, 'facebook_page', $3, 'Transferred Page', $4)`,
          [randomUUID(), secondStore, accountId, new Date(transferAt)],
        );
        if (arrival === 'after') expect((await post(payload)).statusCode).toBe(200);
        const [received] = await stored(payload);
        if (arrival === 'before')
          await admin.pool.query('update webhook_events set received_at = $1 where id = $2', [
            new Date(transferAt - 500),
            received?.id,
          ]);
        await app.get(ProcessWebhookEventJob).handle({ webhookEventId: received?.id }, true);
        expect(await stored(payload)).toEqual([
          expect.objectContaining({ status: 'ignored', error: 'stale_delivery', payload: null }),
        ]);
        for (const table of ['contacts', 'messages']) {
          const result = await admin.pool.query(`select id from ${table} where store_id = $1`, [
            secondStore,
          ]);
          expect(result.rows).toEqual([]);
        }
      } finally {
        const stores = [firstStore, secondStore];
        for (const table of [
          'outbox_events',
          'messages',
          'conversations',
          'contact_identities',
          'contacts',
          'channel_connections',
        ])
          await admin.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [stores]);
        await admin.pool.query('delete from stores where id = any($1::uuid[])', [stores]);
      }
    },
  );

  it('records signed receipts in order and reconciles only echoes from our app', async () => {
    const storeId = randomUUID();
    const account = randomUUID();
    const sent = randomUUID();
    const pending = randomUUID();
    const eventTime = Date.now() - 30_000;
    const sender = { id: 'customer-receipt-fixture' };
    const recipient = { id: account };
    const handler = app.get(ProcessWebhookEventJob);
    async function enqueueEvent(data: Record<string, unknown>) {
      const body = JSON.stringify({ object: 'page', entry: [{ id: account, messaging: [data] }] });
      expect((await post(body)).statusCode).toBe(200);
      const [received] = await stored(body);
      return received!.id;
    }
    async function processEvent(data: Record<string, unknown>) {
      await handler.handle({ webhookEventId: await enqueueEvent(data) }, true);
    }

    await admin.pool.query('insert into stores (id, name) values ($1, $2)', [
      storeId,
      'Receipt shop',
    ]);
    try {
      await admin.pool.query(
        `insert into channel_connections (id, store_id, kind, external_account_id, display_name, connected_at)
         values ($1::uuid, $2, 'facebook_page', $1::text, 'Receipts', $3)`,
        [account, storeId, new Date(eventTime - 120_000)],
      );
      await processEvent({
        sender,
        recipient,
        timestamp: eventTime - 1000,
        message: { mid: 'mid.inbound', text: 'দাম কত?' },
      });
      await admin.pool.query(
        `insert into messages (id, store_id, conversation_id, direction, author_type, kind, body,
            status, external_id, sent_at, error_code, send_category, recipient_identity_id, created_at)
         select requested.id, c.store_id, c.id, 'out', 'system', 'text', 'জি, পণ্যটি আছে।',
            requested.status, requested.external_id, requested.sent_at, requested.error_code,
            'staff_reply', i.id, $4::timestamptz
         from conversations c join contact_identities i
           on i.store_id = c.store_id and i.contact_id = c.contact_id
         cross join lateral (values
           ($2::uuid, 'sent', 'mid.sent', $4::timestamptz, null),
           ($3::uuid, 'queued', null, null, 'send_unconfirmed')
         ) requested(id,status,external_id,sent_at,error_code)
         where c.store_id = $1 and c.channel_connection_id = $5`,
        [storeId, sent, pending, new Date(eventTime), account],
      );

      const read = {
        sender,
        recipient,
        timestamp: eventTime + 300,
        read: { watermark: eventTime + 200 },
      };
      await processEvent({ ...read, sender: { id: 'different-customer' } });
      await processEvent(read);
      await processEvent(read);
      await processEvent({
        sender,
        recipient,
        timestamp: eventTime + 500,
        delivery: { mids: ['mid.sent'], watermark: eventTime + 100 },
      });
      const echo = {
        sender: recipient,
        recipient: sender,
        timestamp: eventTime + 600,
        message: { mid: 'mid.reconciled', is_echo: true, metadata: pending, app_id: 'another-app' },
      };
      await processEvent(echo);
      const before = await admin.pool.query('select status from messages where id = $1', [pending]);
      expect(before.rows).toEqual([{ status: 'queued' }]);
      const earlyReceipt = {
        sender,
        recipient,
        timestamp: eventTime + 800,
        delivery: { mids: ['mid.reconciled'] },
      };
      const earlyReceiptId = await enqueueEvent(earlyReceipt);
      await expect(handler.handle({ webhookEventId: earlyReceiptId }, false)).rejects.toThrow(
        'Meta receipt is awaiting a send result',
      );
      await processEvent({ ...echo, message: { ...echo.message, app_id: appId } });
      await handler.handle({ webhookEventId: earlyReceiptId }, false);

      const results = await admin.pool.query(
        'select id, status, external_id, error_code from messages where store_id = $1 and direction = $2',
        [storeId, 'out'],
      );
      expect(results.rows).toHaveLength(2);
      expect(results.rows).toEqual(
        expect.arrayContaining([
          { id: sent, status: 'read', external_id: 'mid.sent', error_code: null },
          { id: pending, status: 'delivered', external_id: 'mid.reconciled', error_code: null },
        ]),
      );
      const events = await admin.pool.query(
        "select type, payload->>'messageId' as message_id from outbox_events where store_id = $1 and type in ('message.read','message.sent','message.delivered') order by type",
        [storeId],
      );
      expect(events.rows).toEqual([
        { type: 'message.delivered', message_id: pending },
        { type: 'message.read', message_id: sent },
        { type: 'message.sent', message_id: pending },
      ]);
    } finally {
      for (const table of [
        'outbox_events',
        'messages',
        'conversations',
        'contact_identities',
        'contacts',
        'channel_connections',
      ])
        await admin.pool.query(`delete from ${table} where store_id = $1`, [storeId]);
      await admin.pool.query('delete from stores where id = $1', [storeId]);
    }
  });

  it('rejects a signature for different bytes and logs the rejection without the payload', async () => {
    const payload = delivery('instagram');
    const log = vi.spyOn(Logger.prototype, 'warn');
    try {
      const signed = signature(JSON.stringify(JSON.parse(payload)));
      const response = await post(payload, signed);
      expect(response.statusCode).toBe(401);
      expect(await stored(payload)).toEqual([]);
      expect(log).toHaveBeenCalledWith(
        { event: 'security', provider: 'meta' },
        'Meta webhook signature rejected',
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(signed);
      expect(JSON.stringify(log.mock.calls)).not.toContain('দাম কত?');
    } finally {
      log.mockRestore();
    }
  });

  it('validates the delivery envelope after checking the signature', async () => {
    const payload = '{"object":"page","entry":false}';
    expect((await post(payload, 'sha256=invalid')).statusCode).toBe(401);
    expect((await post(payload)).statusCode).toBe(400);
    expect(await stored(payload)).toEqual([]);
  });

  it('refuses a signed JSON payload labeled as form data', async () => {
    const payload = delivery();
    const response = await post(payload, signature(payload), 'application/x-www-form-urlencoded');
    expect(response.statusCode).toBe(415);
    expect(await stored(payload)).toEqual([]);
  });

  it('refuses malformed JSON at the transport boundary', async () => {
    const malformed = '{"object":';
    expect((await post(malformed, 'sha256=invalid')).statusCode).toBe(400);
    expect((await post(malformed)).statusCode).toBe(400);
    expect(await stored(malformed)).toEqual([]);
  });

  it('ignores browser sessions on both provider routes', async () => {
    const lookup = vi
      .spyOn(app.get(SessionsService), 'resolve')
      .mockRejectedValue(new Error('Provider intake must not resolve shop sessions'));
    try {
      for (const response of [await verify('subscribe', verifyToken), await post(delivery())]) {
        expect(response.statusCode).toBe(200);
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(response.headers['x-session-context']).toBeUndefined();
      }
    } finally {
      lookup.mockRestore();
    }
  });

  it('leaves the row ready to retry while the queue is disconnected', async () => {
    const payload = delivery();
    const client = await queue.waitUntilReady();
    await new Promise<void>((resolve) => {
      client.once('end', resolve);
      client.disconnect();
    });

    expect((await post(payload)).statusCode).toBe(503);
    const rows = await stored(payload);
    expect(rows).toHaveLength(1);

    await client.connect();
    expect((await post(payload)).statusCode).toBe(200);
    expect(await stored(payload)).toEqual(rows);
    expect((await queue.getJob(rows[0]!.id))?.data).toEqual({ webhookEventId: rows[0]!.id });
  });

  it('returns a retryable response if the queue connection stops responding', async () => {
    const payload = delivery();
    const client = await queue.waitUntilReady();
    const reconnected = new Promise<void>((resolve) => client.once('ready', resolve));
    // BLPOP blocks only this connection, so other test traffic can keep using Valkey.
    const blocked = client
      .runCommand('blpop', [queue.toKey('blocked-test'), 3])
      .catch(() => undefined);

    expect((await post(payload)).statusCode).toBe(503);
    const rows = await stored(payload);
    expect(rows).toHaveLength(1);

    await blocked;
    await reconnected;
    expect((await post(payload)).statusCode).toBe(200);
    expect(await stored(payload)).toEqual(rows);
    expect((await queue.getJob(rows[0]!.id))?.data).toEqual({ webhookEventId: rows[0]!.id });
  });

  it('refuses a 2 MiB delivery before saving it', async () => {
    const payload = `{"object":"page","entry":[{"text":"${'a'.repeat(2 * 1024 * 1024)}"}]}`;
    expect((await post(payload)).statusCode).toBe(413);
    expect(await stored(payload)).toEqual([]);
  });

  it('closes cleanly when the inbound producer has not reached Valkey readiness', async () => {
    const connections = new Set<Socket>();
    const server = createServer((socket) => connections.add(socket));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    const redisUrl = process.env.REDIS_URL;
    vi.stubEnv('REDIS_URL', `redis://127.0.0.1:${port}`);
    resetEnvForTests();

    class ColdStartModule {}
    Module({ imports: [DatabaseModule, MetaWebhooksModule] })(ColdStartModule);
    let producer: Queue | undefined;
    try {
      const coldApp = await NestFactory.createApplicationContext(ColdStartModule, {
        logger: false,
      });
      producer = coldApp.get<Queue>(getQueueToken('inbound'));
      expect((await producer.waitUntilReady()).status).not.toBe('ready');
      await expect(coldApp.close()).resolves.toBeUndefined();
    } finally {
      await producer?.disconnect();
      for (const socket of connections) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      vi.stubEnv('REDIS_URL', redisUrl);
      resetEnvForTests();
    }
  });

  it('queues the saved row on a retry after enqueue fails', async () => {
    const payload = delivery();
    const enqueue = vi.spyOn(queue, 'add').mockRejectedValueOnce(new Error('Queue unavailable'));
    try {
      expect((await post(payload)).statusCode).toBe(503);
      const rows = await stored(payload);
      expect(rows).toHaveLength(1);
      expect(await queue.getJob(rows[0]!.id)).toBeUndefined();
      expect((await post(payload)).statusCode).toBe(200);
      expect(await stored(payload)).toEqual(rows);
      expect((await queue.getJob(rows[0]!.id))?.data).toEqual({ webhookEventId: rows[0]!.id });
    } finally {
      enqueue.mockRestore();
    }
  });
});
