import 'reflect-metadata';
import { createHash, createHmac, randomUUID } from 'node:crypto';

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
import { MetaWebhooksModule } from './meta-webhooks.module';

class TestModule {}
Module({ imports: [DatabaseModule, SessionsModule, MetaWebhooksModule] })(TestModule);

const appSecret = 'local-meta-signing-material';
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

function post(payload: string, signed = signature(payload)) {
  deliveryKeys.add(createHash('sha256').update(payload).digest('hex'));
  return app.inject({
    url: webhookPath,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signed,
      cookie: 'dakly_session=untrusted-cookie',
    },
    payload,
  });
}

async function stored(payload: string) {
  const externalId = createHash('sha256').update(payload).digest('hex');
  const result = await admin.pool.query<{ id: string; payload: object; status: string }>(
    "select id, payload, status from webhook_events where provider = 'meta' and external_id = $1",
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
      { id: expect.any(String), payload: JSON.parse(payload), status: 'received' },
    ]);
    const job = await queue.getJob(rows[0]!.id);
    expect(job?.name).toBe('process-webhook-event');
    expect(job?.data).toEqual({ webhookEventId: rows[0]!.id });
    expect(await job?.getState()).toBe('waiting');
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

  it('checks the signature before decoding malformed JSON', async () => {
    const malformed = '{"object":';
    expect((await post(malformed, 'sha256=invalid')).statusCode).toBe(401);
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

  it('returns a retryable response if the queue does not respond', async () => {
    const payload = delivery();
    const enqueue = vi.spyOn(queue, 'add').mockImplementationOnce(() => new Promise(() => {}));
    try {
      expect((await post(payload)).statusCode).toBe(503);
      expect(await stored(payload)).toHaveLength(1);
      expect((await post(payload)).statusCode).toBe(200);
      const [event] = await stored(payload);
      expect((await queue.getJob(event!.id))?.data).toEqual({ webhookEventId: event!.id });
    } finally {
      enqueue.mockRestore();
    }
  });

  it('refuses a 2 MiB delivery before saving it', async () => {
    const payload = `{"object":"page","entry":[{"text":"${'a'.repeat(2 * 1024 * 1024)}"}]}`;
    expect((await post(payload)).statusCode).toBe(413);
    expect(await stored(payload)).toEqual([]);
  });

  it('queues the saved row on a retry after enqueue fails', async () => {
    const payload = delivery();
    const enqueue = vi.spyOn(queue, 'add').mockRejectedValueOnce(new Error('Queue unavailable'));
    try {
      expect((await post(payload)).statusCode).toBe(500);
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
