import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { DatabaseModule } from '../platform/database/database.module';
import { AdLinksModule } from './ad-links.module';
import { AdLinksService } from './ad-links.service';
import { AdSourcesRepository } from './ad-sources.repository';

class TestModule {}
Module({ imports: [DatabaseModule, AdLinksModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const fixtures: string[] = [];
let app: INestApplicationContext;
let links: AdLinksService;

beforeAll(async () => {
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  links = app.get(AdLinksService);
});

afterAll(async () => {
  try {
    await app?.close();
    for (const table of ['ad_product_suggestions', 'ad_sources', 'ad_product_links', 'products'])
      await admin.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [fixtures]);
    await admin.pool.query('delete from stores where id = any($1::uuid[])', [fixtures]);
  } finally {
    await admin.pool.end();
  }
});

async function store() {
  const storeId = randomUUID();
  await admin.pool.query('insert into stores (id, name, extensions) values ($1, $2, $3)', [
    storeId,
    'Ad links test',
    [],
  ]);
  fixtures.push(storeId);
  return storeId;
}

async function product(storeId: string, name: string, status = 'active') {
  const id = randomUUID();
  await admin.pool.query(
    'insert into products (id, store_id, name, status, price_poisha) values ($1, $2, $3, $4, 145000)',
    [id, storeId, name, status],
  );
  return id;
}

const ad = { source: 'ad', externalId: '120000000001' } as const;
const post = { source: 'post', externalId: '55555_66666' } as const;

it('replaces the products of an ad and keeps their order', async () => {
  const storeId = await store();
  const [red, blue, green] = await Promise.all(
    ['Red kurti', 'Blue kurti', 'Green kurti'].map((name) => product(storeId, name)),
  );

  const first = await links.replace(storeId, ad, [red!, blue!]);
  const second = await links.replace(storeId, ad, [green!, red!]);

  expect(first.products.map(({ name }) => name)).toEqual(['Red kurti', 'Blue kurti']);
  expect(second.products.map(({ name }) => name)).toEqual(['Green kurti', 'Red kurti']);
  expect(await links.productIdsFor(storeId, { adId: ad.externalId, postId: null })).toEqual([
    green,
    red,
  ]);
});

it('refuses a product that is archived or belongs to another shop, and changes nothing', async () => {
  const storeId = await store();
  const otherStore = await store();
  const kept = await product(storeId, 'Kept');
  const archived = await product(storeId, 'Archived', 'archived');
  const foreign = await product(otherStore, 'Foreign');
  await links.replace(storeId, ad, [kept]);

  await expect(links.replace(storeId, ad, [kept, archived])).rejects.toMatchObject({
    code: 'AD_LINK_PRODUCT_NOT_FOUND',
  });
  await expect(links.replace(storeId, ad, [foreign])).rejects.toMatchObject({
    code: 'AD_LINK_PRODUCT_NOT_FOUND',
  });

  expect((await links.get(storeId, ad)).products.map(({ productId }) => productId)).toEqual([kept]);
});

it('never shows one shop the links of another', async () => {
  const storeId = await store();
  const otherStore = await store();
  await links.replace(storeId, ad, [await product(storeId, 'Mine')]);

  expect(await links.productIdsFor(otherStore, { adId: ad.externalId, postId: null })).toEqual([]);
  await expect(links.get(otherStore, ad)).rejects.toMatchObject({ code: 'AD_LINK_NOT_FOUND' });
  await expect(links.remove(otherStore, ad)).rejects.toMatchObject({ code: 'AD_LINK_NOT_FOUND' });
});

it('uses the ad’s products first, then the post’s, and guesses nothing', async () => {
  const storeId = await store();
  const fromAd = await product(storeId, 'From ad');
  const fromPost = await product(storeId, 'From post');
  await links.replace(storeId, post, [fromPost]);

  expect(
    await links.productIdsFor(storeId, { adId: ad.externalId, postId: post.externalId }),
  ).toEqual([fromPost]);
  await links.replace(storeId, ad, [fromAd]);
  expect(
    await links.productIdsFor(storeId, { adId: ad.externalId, postId: post.externalId }),
  ).toEqual([fromAd]);
  expect(await links.productIdsFor(storeId, { adId: '999999999', postId: null })).toEqual([]);
  expect(await links.productIdsFor(storeId, { adId: null, postId: null })).toEqual([]);
});

it('removes an ad’s links', async () => {
  const storeId = await store();
  await links.replace(storeId, ad, [await product(storeId, 'Only')]);

  await links.remove(storeId, ad);

  await expect(links.get(storeId, ad)).rejects.toMatchObject({ code: 'AD_LINK_NOT_FOUND' });
});

it('keeps suggestions apart from links and from other shops, and replaces them on a new reading', async () => {
  const storeId = await store();
  const otherStore = await store();
  const sources = app.get(AdSourcesRepository);
  const [first, second] = await Promise.all(
    ['Blue kurti', 'Red kurti'].map((name) => product(storeId, name)),
  );
  const shown = { title: 'Eid kurti', photoUrl: null };

  expect((await sources.noteSeen(storeId, ad, shown)).readState).toBe('pending');
  await sources.finishReading(storeId, ad, {
    readState: 'read',
    origin: 'photo',
    productIds: [first!, second!],
  });
  expect((await sources.noteSeen(storeId, ad, { title: null, photoUrl: null })).title).toBe(
    'Eid kurti',
  );
  expect(await sources.listSuggestedProductIds(storeId, ad)).toEqual([first, second]);
  // The reply reads links only, so a suggestion the owner has not confirmed is never used.
  expect(await links.productIdsFor(storeId, { adId: ad.externalId, postId: null })).toEqual([]);
  expect(await sources.listSuggestedProductIds(otherStore, ad)).toEqual([]);
  expect((await sources.noteSeen(otherStore, ad, shown)).readState).toBe('pending');

  await sources.finishReading(storeId, ad, {
    readState: 'read',
    origin: 'photo',
    productIds: [second!],
  });
  expect(await sources.listSuggestedProductIds(storeId, ad)).toEqual([second]);
});
