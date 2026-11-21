import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import type { AiService } from '../ai/ai.service';
import { TenantDatabase } from '../platform/database/tenant-database';
import { ProductSearchSourceService } from '../products/product-search-source.service';
import { ProductSearchRepository } from '../products/product-search.repository';
import { ProductSearchIndexService } from './product-search-index.service';

const vector = (value: number) => Array.from({ length: 512 }, () => value);

describe('ProductSearchIndexService with Postgres', () => {
  const f = new OwnerIsolationFixture();
  const app = createDatabase(process.env.DATABASE_URL!);
  const source = new ProductSearchSourceService(
    new ProductSearchRepository(new TenantDatabase(app.db)),
  );
  let productId = '';

  const storedModel = async () =>
    (
      await f.connection.pool.query(
        'select embedding_model as model, search_text_hash as hash from products where id=$1',
        [productId],
      )
    ).rows[0] as { model: string | null; hash: string | null };

  beforeAll(async () => {
    await f.setup();
    productId = (
      await f.connection.pool.query(
        "insert into products(store_id,name,aliases) values($1,'Cotton Kurti','{কুর্তি}') returning id",
        [f.a],
      )
    ).rows[0].id;
  });
  afterAll(async () => {
    await f.connection.pool.query('delete from products where store_id=any($1::uuid[])', [
      [f.a, f.b],
    ]);
    await app.pool.end();
    await f.close();
  });

  it('keeps the embedding of the text it embedded when the product changes mid-call', async () => {
    const ai = {
      embed: async () => {
        await f.connection.pool.query("update products set name='Silk Kurti' where id=$1", [
          productId,
        ]);
        return { embeddings: [vector(0.1)], model: 'test-model' };
      },
    } as unknown as AiService;
    await new ProductSearchIndexService(source, ai).index(f.a, productId);
    expect(await storedModel()).toEqual({ model: null, hash: null });
  });

  it('saves the embedding when the text is unchanged', async () => {
    const ai = {
      embed: async () => ({ embeddings: [vector(0.2)], model: 'test-model' }),
    } as unknown as AiService;
    await new ProductSearchIndexService(source, ai).index(f.a, productId);
    expect(await storedModel()).toMatchObject({ model: 'test-model' });
  });

  it("does not read another store's product", async () => {
    expect(await source.findSearchSource(f.b, productId)).toBeUndefined();
  });
});
