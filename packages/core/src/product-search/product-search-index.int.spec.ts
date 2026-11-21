import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule } from '@nestjs/bullmq';
import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { AiService } from '../ai/ai.service';
import { ClockModule } from '../platform/clock.module';
import { loadEnv } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { ProductSearchSourceService } from '../products/product-search-source.service';
import { ProductSearchIndexService } from './product-search-index.service';
import { ProductSearchModule } from './product-search.module';

const vector = (value: number) => Array.from({ length: 512 }, () => value);

class TestModule {}
Module({
  imports: [
    DatabaseModule,
    ClockModule,
    ProductSearchModule,
    BullModule.forRoot({
      connection: toRedisConnection(loadEnv().REDIS_URL),
      prefix: `product-search-int-${randomUUID()}`,
    }),
  ],
})(TestModule);

describe('ProductSearchIndexService with Postgres', () => {
  const f = new OwnerIsolationFixture();
  let app: INestApplicationContext;
  let productId = '';

  const stored = async () =>
    (
      await f.connection.pool.query(
        'select embedding_model as model, search_text_hash as hash from products where id=$1',
        [productId],
      )
    ).rows[0] as { model: string | null; hash: string | null };

  beforeAll(async () => {
    await f.setup();
    app = await NestFactory.createApplicationContext(TestModule, { logger: ['error'] });
    productId = (
      await f.connection.pool.query(
        "insert into products(store_id,name,aliases) values($1,'Cotton Kurti','{কুর্তি}') returning id",
        [f.a],
      )
    ).rows[0].id;
  });
  afterAll(async () => {
    await app?.close();
    await f.connection.pool.query('delete from products where store_id=any($1::uuid[])', [
      [f.a, f.b],
    ]);
    await f.close();
  });

  it('keeps no embedding when the product changes during the embed call', async () => {
    const ai = app.get(AiService);
    ai.embed = (async () => {
      await f.connection.pool.query("update products set name='Silk Kurti' where id=$1", [
        productId,
      ]);
      return { embeddings: [vector(0.1)], model: 'test-model' };
    }) as typeof ai.embed;
    await app.get(ProductSearchIndexService).index(f.a, productId);
    expect(await stored()).toEqual({ model: null, hash: null });
  });

  it('saves the embedding when the text is unchanged', async () => {
    const ai = app.get(AiService);
    ai.embed = (async () => ({
      embeddings: [vector(0.2)],
      model: 'test-model',
    })) as typeof ai.embed;
    await app.get(ProductSearchIndexService).index(f.a, productId);
    expect(await stored()).toMatchObject({ model: 'test-model' });
  });

  it("does not read another store's product", async () => {
    expect(
      await app.get(ProductSearchSourceService).findSearchSource(f.b, productId),
    ).toBeUndefined();
  });
});
