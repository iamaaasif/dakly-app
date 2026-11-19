import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import type { MetaTokenHealthDriver } from '@dakly/providers/channel/channel-driver';

import { Clock } from '../platform/clock';
import { loadEnv, resetEnvForTests } from '../platform/config/env';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { DatabaseModule } from '../platform/database/database.module';
import { jobLogBindings, runWithJobContext } from '../platform/logging/job-context';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { DAY_MS } from '../platform/time';
import { ChannelTokenHealthModule } from './channel-token-health.module';
import { META_TOKEN_HEALTH_DRIVER } from './channel-token-health.service';
import { CheckChannelTokenJob } from './jobs/check-channel-token.job';
import { QueueChannelTokenChecksJob } from './jobs/queue-channel-token-checks.job';

const now = new Date('2026-11-19T00:00:00Z');
const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const userId = randomUUID();
let app: INestApplicationContext;
let queue: Queue;

beforeAll(async () => {
  vi.stubEnv('META_CHANNEL_DRIVER', 'fake');
  vi.stubEnv('META_OAUTH_REDIRECT_URI', 'http://localhost:3000/integrations/meta');
  resetEnvForTests();
  class TestModule {}
  Module({
    imports: [
      DatabaseModule,
      BullModule.forRoot({
        connection: toRedisConnection(loadEnv().REDIS_URL),
        prefix: `chn4-test-${storeId}`,
      }),
      ChannelTokenHealthModule,
    ],
  })(TestModule);
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  queue = app.get(getQueueToken(QUEUES.sync));
  vi.spyOn(app.get(Clock), 'now').mockReturnValue(now);
  await admin.pool.query('insert into stores (id, name) values ($1, $2)', [
    storeId,
    'Channel health test',
  ]);
  await admin.pool.query(
    'insert into users (id, name, phone, phone_verified_at) values ($1, $2, $3, now())',
    [userId, 'Shop owner', `017${randomInt(10000000, 99999999)}`],
  );
  await admin.pool.query(
    `insert into memberships (id, store_id, user_id, built_in_role, status)
    values (gen_random_uuid(), $1, $2, 'owner', 'active')`,
    [storeId, userId],
  );
});

afterAll(async () => {
  try {
    await queue?.obliterate({ force: true });
    await app?.close();
    for (const table of ['outbox_events', 'notifications', 'channel_connections', 'memberships'])
      await admin.pool.query(`delete from ${table} where store_id = $1`, [storeId]);
    await admin.pool.query('delete from stores where id = $1', [storeId]);
    await admin.pool.query('delete from users where id = $1', [userId]);
  } finally {
    await admin.pool.end();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetEnvForTests();
  }
});

async function connection(token: string, days: number | null) {
  const id = randomUUID();
  const secret = app
    .get(EnvelopeEncryption)
    .encrypt({ owner: 'store', storeId, purpose: 'channel-access-token' }, Buffer.from(token));
  await admin.pool.query(
    `insert into channel_connections
    (id, store_id, kind, external_account_id, display_name, access_token_ciphertext, key_version, token_expires_at)
    values ($1, $2, 'facebook_page', $3, 'Channel health test', $4, $5, $6)`,
    [
      id,
      storeId,
      id,
      secret.ciphertext,
      secret.keyVersion,
      days === null ? null : new Date(now.getTime() + days * DAY_MS),
    ],
  );
  return id;
}

it('queues only due tokens once a day and warns or reconnects once', async () => {
  const expiring = await connection('fake-rina-page-credential', 6);
  const revoked = await connection('revoked-test-token', 6);
  await connection('fake-karim-page-credential', 10);
  await connection('fake-karim-page-credential', null);
  const sweep = app.get(QueueChannelTokenChecksJob);
  await sweep.handle({});
  await sweep.handle({});
  const checks = (await queue.getWaiting()).filter((job) => job.data.storeId === storeId);
  expect(checks.map((job) => job.data.channelConnectionId).sort()).toEqual(
    [expiring, revoked].sort(),
  );
  const check = app.get(CheckChannelTokenJob);
  await check.handle({ storeId: randomUUID(), channelConnectionId: revoked });
  for (const job of checks) {
    await check.handle(job.data);
    await check.handle(job.data);
  }
  const states = await admin.pool.query(
    'select id, status from channel_connections where id = any($1::uuid[])',
    [[expiring, revoked]],
  );
  expect(states.rows).toEqual(
    expect.arrayContaining([
      { id: expiring, status: 'active' },
      { id: revoked, status: 'needs_reconnect' },
    ]),
  );
  const notices = await admin.pool.query(
    'select type, user_id from notifications where store_id = $1 order by type',
    [storeId],
  );
  expect(notices.rows).toEqual([
    { type: 'channel.needs_reconnect', user_id: userId },
    { type: 'channel.token_expiring', user_id: userId },
  ]);
  const lifecycle = await admin.pool.query(
    "select payload from outbox_events where store_id = $1 and type = 'channel.needs_reconnect'",
    [storeId],
  );
  expect(lifecycle.rows).toEqual([{ payload: { channelConnectionId: revoked } }]);
});

it('discards an invalid-token result after the store rotates that credential', async () => {
  const id = await connection('revoked-test-token', 6);
  const driver = app.get<MetaTokenHealthDriver>(META_TOKEN_HEALTH_DRIVER);
  const observed = vi.spyOn(driver, 'isTokenValid').mockImplementationOnce(async () => {
    expect(jobLogBindings()).toMatchObject({ storeId, jobId: 'rotation-check' });
    const secret = app
      .get(EnvelopeEncryption)
      .encrypt(
        { owner: 'store', storeId, purpose: 'channel-access-token' },
        Buffer.from('fake-rina-page-credential'),
      );
    await admin.pool.query(
      'update channel_connections set access_token_ciphertext = $1, key_version = $2 where id = $3',
      [secret.ciphertext, secret.keyVersion, id],
    );
    return false;
  });
  try {
    await runWithJobContext(
      () => app.get(CheckChannelTokenJob).handle({ storeId, channelConnectionId: id }),
      'rotation-check',
    );
    const { rows } = await admin.pool.query(
      'select status from channel_connections where id = $1',
      [id],
    );
    expect(rows).toEqual([{ status: 'active' }]);
    const lifecycle = await admin.pool.query(
      "select id from outbox_events where store_id = $1 and type = 'channel.needs_reconnect' and payload->>'channelConnectionId' = $2",
      [storeId, id],
    );
    expect(lifecycle.rows).toEqual([]);
  } finally {
    observed.mockRestore();
  }
});

it('notifies again when a reconnected credential later becomes invalid', async () => {
  const channelConnectionId = await connection('revoked-test-token', 6);
  const check = app.get(CheckChannelTokenJob);
  await check.handle({ storeId, channelConnectionId });
  const secret = app
    .get(EnvelopeEncryption)
    .encrypt(
      { owner: 'store', storeId, purpose: 'channel-access-token' },
      Buffer.from('second-revoked-test-token'),
    );
  await admin.pool.query(
    "update channel_connections set status = 'active', access_token_ciphertext = $1, key_version = $2 where id = $3",
    [secret.ciphertext, secret.keyVersion, channelConnectionId],
  );
  await check.handle({ storeId, channelConnectionId });
  await check.handle({ storeId, channelConnectionId });
  const { rows } = await admin.pool.query(
    'select id from notifications where store_id = $1 and dedupe_key like $2',
    [storeId, `channel.needs_reconnect:${channelConnectionId}:%`],
  );
  expect(rows).toHaveLength(2);
});
