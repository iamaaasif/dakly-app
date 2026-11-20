import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';

import type { StoreAccess } from '@dakly/contracts/team';
import { createDatabase } from '@dakly/db/client';
import {
  MetaRequestError,
  type MetaAuthorizationDriver,
} from '@dakly/providers/channel/channel-driver';

import { Clock } from '../platform/clock';
import { resetEnvForTests } from '../platform/config/env';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { DatabaseModule } from '../platform/database/database.module';
import { HOUR_MS } from '../platform/time';
import { ChannelConnectionsService } from './channel-connections.service';
import { ReconcileMetaPageSubscriptionsJob } from './jobs/reconcile-meta-page-subscriptions.job';
import { META_CHANNEL_DRIVER } from './meta-channel-driver';
import { MetaPageReconciliationModule } from './meta-page-reconciliation.module';
import { MetaPageSubscriptionsRepository } from './meta-page-subscriptions.repository';
import { MetaPageSubscriptionsService } from './meta-page-subscriptions.service';

const now = new Date('2026-11-19T12:00:00Z');
const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const otherStoreId = randomUUID();
const owner: StoreAccess = {
  role: 'owner',
  areas: {},
  seeFullPhone: true,
  exportLists: true,
  refund: true,
};
let app: INestApplicationContext;
let unsubscribe: ReturnType<typeof vi.fn<MetaAuthorizationDriver['unsubscribePage']>>;

beforeAll(async () => {
  vi.stubEnv('META_CHANNEL_DRIVER', 'fake');
  vi.stubEnv('META_OAUTH_REDIRECT_URI', 'http://localhost:3000/integrations/meta');
  resetEnvForTests();
  class TestModule {}
  Module({ imports: [DatabaseModule, MetaPageReconciliationModule] })(TestModule);
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  vi.spyOn(app.get(Clock), 'now').mockReturnValue(now);
  for (const id of [storeId, otherStoreId])
    await admin.pool.query('insert into stores (id, name) values ($1, $2)', [id, 'Subscriptions']);
});

afterEach(async () => {
  unsubscribe?.mockRestore();
  for (const table of ['meta_page_subscriptions', 'outbox_events', 'channel_connections'])
    await admin.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [
      [storeId, otherStoreId],
    ]);
});

afterAll(async () => {
  try {
    await app?.close();
    await admin.pool.query('delete from stores where id = any($1::uuid[])', [
      [storeId, otherStoreId],
    ]);
  } finally {
    await admin.pool.end();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetEnvForTests();
  }
});

function stubMeta(result?: MetaRequestError) {
  const driver = app.get<MetaAuthorizationDriver>(META_CHANNEL_DRIVER);
  unsubscribe = vi.spyOn(driver, 'unsubscribePage').mockImplementation(async () => {
    if (result) throw result;
  });
}

async function pending(pageId: string, token: string, ageMs: number, owningStoreId = storeId) {
  const secret = app
    .get(EnvelopeEncryption)
    .encrypt(
      { owner: 'store', storeId: owningStoreId, purpose: 'channel-access-token' },
      Buffer.from(token),
    );
  await admin.pool.query(
    `insert into meta_page_subscriptions
    (id, store_id, page_external_id, access_token_ciphertext, key_version, created_at)
    values ($1, $2, $3, $4, $5, $6)`,
    [
      randomUUID(),
      owningStoreId,
      pageId,
      secret.ciphertext,
      secret.keyVersion,
      new Date(now.getTime() - ageMs),
    ],
  );
}

async function pendingPages() {
  const { rows } = await admin.pool.query<{ page_external_id: string }>(
    'select page_external_id from meta_page_subscriptions where store_id = $1 order by 1',
    [storeId],
  );
  return rows.map((row) => row.page_external_id);
}

async function connectPage(pageId: string) {
  const id = randomUUID();
  const secret = app
    .get(EnvelopeEncryption)
    .encrypt(
      { owner: 'store', storeId, purpose: 'channel-access-token' },
      Buffer.from(`token-${pageId}`),
    );
  await admin.pool.query(
    `insert into channel_connections
    (id, store_id, kind, external_account_id, display_name, access_token_ciphertext, key_version)
    values ($1, $2, 'facebook_page', $3, 'Test Page', $4, $5)`,
    [id, storeId, pageId, secret.ciphertext, secret.keyVersion],
  );
  return id;
}

const runDaily = () => app.get(ReconcileMetaPageSubscriptionsJob).handle({});

it('unsubscribes a Page that no connection backs and forgets it', async () => {
  stubMeta();
  const pageId = randomUUID();
  await pending(pageId, 'orphan-token', 2 * HOUR_MS);
  await runDaily();
  expect(unsubscribe).toHaveBeenCalledWith(pageId, 'orphan-token');
  expect(await pendingPages()).toEqual([]);
});

it('keeps a Page that an active connection backs and drops its record', async () => {
  stubMeta();
  const pageId = randomUUID();
  await connectPage(pageId);
  await pending(pageId, 'saved-before-crash', 2 * HOUR_MS);
  await runDaily();
  expect(unsubscribe).not.toHaveBeenCalled();
  expect(await pendingPages()).toEqual([]);
});

it('leaves a Page that another store has connected subscribed', async () => {
  stubMeta();
  const pageId = randomUUID();
  const secret = app
    .get(EnvelopeEncryption)
    .encrypt(
      { owner: 'store', storeId: otherStoreId, purpose: 'channel-access-token' },
      Buffer.from('other'),
    );
  await admin.pool.query(
    `insert into channel_connections
    (id, store_id, kind, external_account_id, display_name, access_token_ciphertext, key_version)
    values ($1, $2, 'facebook_page', $3, 'Other', $4, $5)`,
    [randomUUID(), otherStoreId, pageId, secret.ciphertext, secret.keyVersion],
  );
  await pending(pageId, 'old-owner-token', 2 * HOUR_MS);
  await runDaily();
  expect(unsubscribe).not.toHaveBeenCalled();
  expect(await pendingPages()).toEqual([]);
});

it('leaves a record for the next run when Meta fails, then removes it', async () => {
  const pageId = randomUUID();
  await pending(pageId, 'retry-token', 2 * HOUR_MS);
  stubMeta(new MetaRequestError('unavailable'));
  await runDaily();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(await pendingPages()).toEqual([pageId]);
  unsubscribe.mockRestore();
  stubMeta();
  await runDaily();
  expect(unsubscribe).toHaveBeenCalledWith(pageId, 'retry-token');
  expect(await pendingPages()).toEqual([]);
});

it('does not touch a Page whose selection may still be running', async () => {
  stubMeta();
  const pageId = randomUUID();
  await pending(pageId, 'in-flight-token', 5 * 60 * 1000);
  await runDaily();
  expect(unsubscribe).not.toHaveBeenCalled();
  expect(await pendingPages()).toEqual([pageId]);
});

it('unsubscribes a Messenger Page when it is disconnected and clears the token', async () => {
  stubMeta();
  const pageId = randomUUID();
  const id = await connectPage(pageId);
  await app.get(ChannelConnectionsService).disconnect(storeId, id, owner);
  expect(unsubscribe).toHaveBeenCalledWith(pageId, `token-${pageId}`);
  expect(await pendingPages()).toEqual([]);
  const { rows } = await admin.pool.query(
    'select status, access_token_ciphertext from channel_connections where id = $1',
    [id],
  );
  expect(rows).toEqual([{ status: 'disconnected', access_token_ciphertext: null }]);
});

it('keeps the Page for the daily run when Meta fails during disconnect', async () => {
  stubMeta(new MetaRequestError('unavailable'));
  const pageId = randomUUID();
  const id = await connectPage(pageId);
  await app.get(ChannelConnectionsService).disconnect(storeId, id, owner);
  const { rows } = await admin.pool.query('select status from channel_connections where id = $1', [
    id,
  ]);
  expect(rows).toEqual([{ status: 'disconnected' }]);
  expect(await pendingPages()).toEqual([pageId]);
  unsubscribe.mockRestore();
  stubMeta();
  vi.mocked(app.get(Clock).now).mockReturnValue(new Date(now.getTime() + 2 * HOUR_MS));
  try {
    await runDaily();
  } finally {
    vi.mocked(app.get(Clock).now).mockReturnValue(now);
  }
  expect(unsubscribe).toHaveBeenCalledWith(pageId, `token-${pageId}`);
  expect(await pendingPages()).toEqual([]);
});

it('does not unsubscribe when an Instagram account is disconnected', async () => {
  stubMeta();
  const id = randomUUID();
  const secret = app
    .get(EnvelopeEncryption)
    .encrypt(
      { owner: 'store', storeId, purpose: 'channel-access-token' },
      Buffer.from('instagram-token'),
    );
  await admin.pool.query(
    `insert into channel_connections
    (id, store_id, kind, external_account_id, display_name, access_token_ciphertext, key_version)
    values ($1, $2, 'instagram', $3, 'Shop', $4, $5)`,
    [id, storeId, randomUUID(), secret.ciphertext, secret.keyVersion],
  );
  await app.get(ChannelConnectionsService).disconnect(storeId, id, owner);
  expect(unsubscribe).not.toHaveBeenCalled();
  expect(await pendingPages()).toEqual([]);
});

it('records a Page for its own store only', async () => {
  const pageId = randomUUID();
  await app.get(MetaPageSubscriptionsService).recordPending(storeId, pageId, 'page-token');
  const repository = app.get(MetaPageSubscriptionsRepository);
  expect(await repository.findPage(storeId, pageId)).toMatchObject({ pageExternalId: pageId });
  expect(await repository.findPage(otherStoreId, pageId)).toBeUndefined();
  expect(
    await repository.listCreatedBefore(otherStoreId, new Date(now.getTime() + HOUR_MS)),
  ).toEqual([]);
});
