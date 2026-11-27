import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { StartProductImportInput } from '@dakly/contracts/product-imports';
import { createDatabase } from '@dakly/db/client';

import { DatabaseModule } from '../platform/database/database.module';
import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { ImportsModule } from './imports.module';
import { ProductImportsService } from './product-imports.service';

class TestModule {}
Module({ imports: [DatabaseModule, ImportsModule, FileStorageModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const userId = randomUUID();
const owner = { kind: 'user', userId } as const;
const mapping = {
  name: 0,
  price: 1,
  sku: 2,
  onHand: 3,
  options: [{ name: 'Size', column: 4 }],
};
let app: INestApplicationContext;
let service: ProductImportsService;

async function runImport(file: string, start: Partial<StartProductImportInput> = {}) {
  const body = new TextEncoder().encode(file);
  const { importId, uploadUrl } = await service.create(storeId, { sizeBytes: body.length }, owner);
  const upload = await fetch(uploadUrl, {
    method: 'PUT',
    body,
    headers: { 'content-type': 'text/csv' },
  });
  expect(upload.status).toBe(200);
  await service.start(storeId, importId, { mapping, duplicateMode: 'update', ...start }, owner);
  await service.run(storeId, importId);
  return { importId, result: await service.get(storeId, importId) };
}

async function onHand(sku: string) {
  const result = await admin.pool.query<{ onHand: number }>(
    'select on_hand as "onHand" from product_variants where store_id=$1 and sku=$2',
    [storeId, sku],
  );
  return result.rows[0]?.onHand;
}

describe('ProductImportsService (Postgres and SeaweedFS)', () => {
  beforeAll(async () => {
    await admin.pool.query("insert into stores(id,name) values($1,'শাহনাজের দোকান')", [storeId]);
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'শাহনাজ',$1::text || '@example.test')",
      [userId],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(ProductImportsService);
  });

  afterAll(async () => {
    try {
      await app?.close();
      for (const table of [
        'outbox_events',
        'stock_movements',
        'product_variants',
        'products',
        'product_brands',
        'imports',
        'files',
      ])
        await admin.pool.query(`delete from ${table} where store_id=$1`, [storeId]);
      await admin.pool.query('delete from stores where id=$1', [storeId]);
      await admin.pool.query('delete from users where id=$1', [userId]);
    } finally {
      await admin.pool.end();
    }
  });

  it('adds products with their variants and stock, then reports a bad row', async () => {
    const { result } = await runImport(
      [
        'Name,Price,SKU,On hand,Size',
        'শার্ট,500,SHIRT-M,4,M',
        'শার্ট,500,SHIRT-L,6,L',
        'ব্যাগ,abc,BAG-1,1,',
      ].join('\n'),
    );
    expect(result).toMatchObject({
      status: 'done',
      rowsTotal: 3,
      rowsAdded: 2,
      rowsFailed: 1,
    });
    expect(await onHand('SHIRT-M')).toBe(4);
    expect(await onHand('SHIRT-L')).toBe(6);
    expect(await onHand('BAG-1')).toBeUndefined();
    expect(await (await fetch(result.reportUrl!)).text()).toContain('Price');
  });

  it('sets the count of a known SKU in update mode and leaves it alone in skip mode', async () => {
    async function version() {
      const { rows } = await admin.pool.query<{ version: number }>(
        `select p.version from products p join product_variants v
          on v.store_id=p.store_id and v.product_id=p.id where p.store_id=$1 and v.sku=$2`,
        [storeId, 'SHIRT-M'],
      );
      return rows[0]?.version;
    }
    expect(await version()).toBe(1);
    const file = 'Name,Price,SKU,On hand,Size\nশার্ট,500,SHIRT-M,9,M\n';
    const skipped = await runImport(file, { duplicateMode: 'skip' });
    expect(skipped.result).toMatchObject({ rowsSkipped: 1, rowsUpdated: 0 });
    expect(await onHand('SHIRT-M')).toBe(4);
    expect(await version()).toBe(1);

    const updated = await runImport(file);
    expect(updated.result).toMatchObject({ rowsUpdated: 1, rowsSkipped: 0 });
    expect(await onHand('SHIRT-M')).toBe(9);
    expect(await version()).toBe(2);
  });

  it('does not apply a count twice when the job runs again', async () => {
    const { importId } = await runImport('Name,Price,SKU,On hand,Size\nটুপি,200,CAP-1,5,M\n');
    await service.run(storeId, importId);
    expect(await onHand('CAP-1')).toBe(5);
    const moves = await admin.pool.query(
      'select count(*)::int as moves from stock_movements m join product_variants v on v.id=m.variant_id where v.sku=$1',
      ['CAP-1'],
    );
    expect(moves.rows[0].moves).toBe(1);
  });

  it('uses the shop spelling for a brand, adds new brands, and keeps a brand when omitted', async () => {
    const brandId = randomUUID();
    await admin.pool.query('insert into product_brands(id,store_id,name) values($1,$2,$3)', [
      brandId,
      storeId,
      'Aarong',
    ]);
    const oldMapping = { name: 0, price: 1, sku: 2, options: [] };
    const withBrand = { ...oldMapping, brand: 3 };
    const header = 'Name,Price,SKU,Brand\n';
    const brandFor = async (sku: string) => {
      const { rows } = await admin.pool.query<{ id: string; name: string }>(
        `select b.id, b.name from product_variants v
         join products p on p.store_id=v.store_id and p.id=v.product_id
         join product_brands b on b.store_id=p.store_id and b.id=p.brand_id
         where v.store_id=$1 and v.sku=$2`,
        [storeId, sku],
      );
      return rows[0];
    };

    await runImport(`${header}Panjabi,900,BRAND-1,  aarong  \nScarf,450,BRAND-2,Nakshi\n`, {
      mapping: withBrand,
    });
    expect(await brandFor('BRAND-1')).toEqual({ id: brandId, name: 'Aarong' });
    expect(await brandFor('BRAND-2')).toMatchObject({ name: 'Nakshi' });

    const renamed = await runImport(`${header}Panjabi,900,BRAND-1,NAKSHI\n`, {
      mapping: withBrand,
    });
    expect(renamed.result).toMatchObject({ rowsUpdated: 1 });
    const saved = await brandFor('BRAND-2');
    expect(await brandFor('BRAND-1')).toEqual(saved);
    await runImport(`${header}Panjabi,900,BRAND-1, \n`, { mapping: withBrand });
    expect(await brandFor('BRAND-1')).toEqual(saved);

    const old = await runImport('Name,Price,SKU\nPanjabi,950,BRAND-1\nShirt,700,BRAND-3\n', {
      mapping: oldMapping,
    });
    expect(old.result).toMatchObject({ rowsUpdated: 1, rowsAdded: 1 });
    expect(await brandFor('BRAND-1')).toEqual(saved);
    expect(await brandFor('BRAND-3')).toBeUndefined();
  });
});
