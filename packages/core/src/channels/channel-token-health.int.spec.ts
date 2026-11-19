import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import {
  MetaRequestError,
  type MetaTokenHealthDriver,
} from '@dakly/providers/channel/channel-driver';

import { Clock } from '../platform/clock';
import { loadEnv, resetEnvForTests } from '../platform/config/env';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { DatabaseModule } from '../platform/database/database.module';
import { StoreTransaction } from '../platform/database/store-transaction';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { DAY_MS } from '../platform/time';
import { ChannelConnectionsService } from './channel-connections.service';
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

async function connection(token: string, days: number | null, ownerStoreId = storeId) {
  const id = randomUUID();
  const secret = app
    .get(EnvelopeEncryption)
    .encrypt(
      { owner: 'store', storeId: ownerStoreId, purpose: 'channel-access-token' },
      Buffer.from(token),
    );
  await admin.pool.query(
    `insert into channel_connections
    (id, store_id, kind, external_account_id, display_name, access_token_ciphertext, key_version, token_expires_at)
    values ($1, $2, 'facebook_page', $3, 'Channel health test', $4, $5, $6)`,
    [
      id,
      ownerStoreId,
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
  const expiresLater = await connection('invalid-but-not-due', 10);
  const noExpiry = await connection('fake-karim-page-credential', null);
  const revokedWithoutExpiry = await connection('revoked-without-expiry', null);
  const sweep = app.get(QueueChannelTokenChecksJob);
  await sweep.handle({});
  await sweep.handle({});
  const checks = (await queue.getWaiting()).filter((job) => job.data.storeId === storeId);
  expect(checks.map((job) => job.data)).toEqual([{ storeId }]);
  const check = app.get(CheckChannelTokenJob);
  await check.handle({ storeId: randomUUID() });
  for (const job of checks) {
    await check.handle(job.data);
    await check.handle(job.data);
  }
  const states = await admin.pool.query(
    'select id, status from channel_connections where id = any($1::uuid[])',
    [[expiring, revoked, noExpiry, revokedWithoutExpiry, expiresLater]],
  );
  expect(states.rows).toEqual(
    expect.arrayContaining([
      { id: expiring, status: 'active' },
      { id: revoked, status: 'needs_reconnect' },
      { id: noExpiry, status: 'active' },
      { id: revokedWithoutExpiry, status: 'needs_reconnect' },
      { id: expiresLater, status: 'active' },
    ]),
  );
  const notices = await admin.pool.query(
    'select type, user_id from notifications where store_id = $1 order by type',
    [storeId],
  );
  expect(notices.rows).toEqual([
    { type: 'channel.needs_reconnect', user_id: userId },
    { type: 'channel.needs_reconnect', user_id: userId },
    { type: 'channel.token_expiring', user_id: userId },
  ]);
  const lifecycle = await admin.pool.query(
    "select payload from outbox_events where store_id = $1 and type = 'channel.needs_reconnect' order by payload->>'channelConnectionId'",
    [storeId],
  );
  expect(lifecycle.rows).toEqual(
    [revoked, revokedWithoutExpiry]
      .sort()
      .map((channelConnectionId) => ({ payload: { channelConnectionId } })),
  );
});

it('discards an invalid-token result after the store rotates that credential', async () => {
  const id = await connection('revoked-during-rotation', 6);
  const driver = app.get<MetaTokenHealthDriver>(META_TOKEN_HEALTH_DRIVER);
  const isTokenValid = driver.isTokenValid.bind(driver);
  const observed = vi.spyOn(driver, 'isTokenValid').mockImplementation(async (token) => {
    if (token !== 'revoked-during-rotation') return isTokenValid(token);
    expect(app.get(StoreTransaction).isOpen()).toBe(false);
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
    await app.get(CheckChannelTokenJob).handle({ storeId });
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
  await check.handle({ storeId });
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
  await check.handle({ storeId });
  await check.handle({ storeId });
  const { rows: today } = await admin.pool.query(
    'select dedupe_key from notifications where store_id = $1 and dedupe_key like $2',
    [storeId, `channel.needs_reconnect:${channelConnectionId}:%`],
  );
  expect(today).toEqual([
    { dedupe_key: `channel.needs_reconnect:${channelConnectionId}:2026-11-19` },
  ]);
  expect(
    (
      await admin.pool.query('select status from channel_connections where id = $1', [
        channelConnectionId,
      ])
    ).rows,
  ).toEqual([{ status: 'needs_reconnect' }]);
  const sameDayEvents = await admin.pool.query(
    "select id from outbox_events where store_id = $1 and type = 'channel.needs_reconnect' and payload->>'channelConnectionId' = $2",
    [storeId, channelConnectionId],
  );
  expect(sameDayEvents.rows).toHaveLength(2);
  await admin.pool.query("update channel_connections set status = 'active' where id = $1", [
    channelConnectionId,
  ]);
  const clock = vi.mocked(app.get(Clock).now);
  clock.mockReturnValue(new Date(now.getTime() + DAY_MS));
  try {
    await check.handle({ storeId });
    const { rows: both } = await admin.pool.query(
      'select dedupe_key from notifications where store_id = $1 and dedupe_key like $2 order by dedupe_key',
      [storeId, `channel.needs_reconnect:${channelConnectionId}:%`],
    );
    expect(both).toEqual([
      { dedupe_key: `channel.needs_reconnect:${channelConnectionId}:2026-11-19` },
      { dedupe_key: `channel.needs_reconnect:${channelConnectionId}:2026-11-20` },
    ]);
  } finally {
    clock.mockReturnValue(now);
  }
});

it('continues with other credentials when Meta is temporarily unavailable', async () => {
  const unavailable = await connection('temporarily-unavailable', null);
  const revoked = await connection('another-revoked-token', null);
  const driver = app.get<MetaTokenHealthDriver>(META_TOKEN_HEALTH_DRIVER);
  const isTokenValid = driver.isTokenValid.bind(driver);
  const observed = vi.spyOn(driver, 'isTokenValid').mockImplementation(async (token) => {
    if (token === 'temporarily-unavailable') throw new MetaRequestError('unavailable');
    return isTokenValid(token);
  });
  try {
    await expect(app.get(CheckChannelTokenJob).handle({ storeId })).rejects.toMatchObject({
      code: 'unavailable',
    });
    const { rows } = await admin.pool.query(
      'select id, status from channel_connections where id = any($1::uuid[])',
      [[unavailable, revoked]],
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: unavailable, status: 'active' },
        { id: revoked, status: 'needs_reconnect' },
      ]),
    );
  } finally {
    observed.mockRestore();
  }
});

it('queues stores beyond the first bounded lookup page', async () => {
  const original = await connection('fake-rina-page-credential', null);
  const { rows } = await admin.pool.query<{ id: string }>(
    `insert into stores (id, name)
     select gen_random_uuid(), 'Sweep fixture' from generate_series(1, 101) returning id`,
  );
  const ids = rows.map(({ id }) => id).sort();
  const notDue = randomUUID();
  const fixtureStores = [...ids, notDue];
  try {
    await admin.pool.query('insert into stores (id, name) values ($1, $2)', [
      notDue,
      'Later expiry',
    ]);
    await connection('invalid-but-not-due', 10, notDue);
    await admin.pool.query(
      `insert into channel_connections
        (id, store_id, kind, external_account_id, display_name, access_token_ciphertext, key_version)
       select gen_random_uuid(), stores.id, kind, gen_random_uuid()::text, 'Sweep fixture', access_token_ciphertext, key_version
       from channel_connections cross join unnest($1::uuid[]) as stores(id) where channel_connections.id = $2`,
      [ids, original],
    );
    const sweep = app.get(QueueChannelTokenChecksJob);
    await sweep.handle({});
    await sweep.handle({});
    const queued = (await queue.getWaiting())
      .map(({ data }) => data.storeId as string)
      .filter((id) => fixtureStores.includes(id));
    expect(queued.sort()).toEqual(ids);
  } finally {
    await admin.pool.query('delete from channel_connections where store_id = any($1::uuid[])', [
      fixtureStores,
    ]);
    await admin.pool.query('delete from stores where id = any($1::uuid[])', [fixtureStores]);
  }
});

it('marks a rejected send credential and tells the owner', async () => {
  const connectionId = await connection('revoked-send-token', null);
  const connections = app.get(ChannelConnectionsService);
  const prepared = (await connections.prepareMetaSend(storeId, connectionId, 'messenger'))!;
  const message = {
    channel: 'messenger',
    externalConversationId: 'recipient-test',
    text: 'Fixture reply',
    operationKey: randomUUID(),
  } as const;
  await expect(
    app
      .get(StoreTransaction)
      .run(storeId, () => connections.sendMetaMessage(storeId, connectionId, message, prepared)),
  ).rejects.toMatchObject({ code: 'CHANNEL_SEND_INSIDE_TRANSACTION' });
  const failedRecord = vi
    .spyOn(connections, 'recordRejectedToken')
    .mockRejectedValueOnce(new Error('Database connection lost'));
  try {
    await expect(
      connections.sendMetaMessage(storeId, connectionId, message, prepared),
    ).rejects.toMatchObject({
      code: 'auth_error',
    });
  } finally {
    failedRecord.mockRestore();
  }
  const rejectedSend = connections.sendMetaMessage(storeId, connectionId, message, prepared);
  await expect(rejectedSend).rejects.toMatchObject({ code: 'auth_error' });
  await expect(rejectedSend).rejects.toBeInstanceOf(MetaRequestError);
  const status = await admin.pool.query('select status from channel_connections where id = $1', [
    connectionId,
  ]);
  expect(status.rows).toEqual([{ status: 'needs_reconnect' }]);
  const notice = await admin.pool.query(
    'select type, user_id from notifications where store_id = $1 and dedupe_key like $2',
    [storeId, `channel.needs_reconnect:${connectionId}:%`],
  );
  expect(notice.rows).toEqual([{ type: 'channel.needs_reconnect', user_id: userId }]);
});
