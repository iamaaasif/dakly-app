import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { StartImportInput } from '@dakly/contracts/contacts';
import { createDatabase } from '@dakly/db/client';

import { DatabaseModule } from '../platform/database/database.module';
import { ImportsModule } from './imports.module';
import { ImportsService } from './imports.service';

class TestModule {}
Module({ imports: [DatabaseModule, ImportsModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const userId = randomUUID();
const owner = { kind: 'user', userId } as const;
const mapping = { name: 0, phone: 1, email: 2, tags: 3 };
const evidence = { sms: 'দোকানের খাতায় সই করেছেন', whatsapp: 'চেকআউটে রাজি হয়েছেন' };
let app: INestApplicationContext;
let service: ImportsService;
let phoneNumber = 10_000_000;

const phone = () => `016${phoneNumber++}`;

async function prepareImport(file: string, start: Partial<StartImportInput> = {}) {
  const body = new TextEncoder().encode(file);
  const { importId, uploadUrl } = await service.createCustomerImport(
    storeId,
    { sizeBytes: body.length },
    owner,
  );
  const upload = await fetch(uploadUrl, {
    method: 'PUT',
    body,
    headers: { 'content-type': 'text/csv' },
  });
  expect(upload.status).toBe(200);
  await service.start(
    storeId,
    importId,
    { mapping, duplicateMode: 'update', consentEvidence: evidence, ...start },
    owner,
  );
  return importId;
}

async function report(url: string | null) {
  expect(url).not.toBeNull();
  return (await fetch(url!)).text();
}

describe('ImportsService imports (Postgres and SeaweedFS)', () => {
  beforeAll(async () => {
    await admin.pool.query("insert into stores(id,name) values($1,'শাহনাজের দোকান')", [storeId]);
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'শাহনাজ',$1::text || '@example.test')",
      [userId],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(ImportsService);
  });

  afterAll(async () => {
    try {
      await app?.close();
      for (const table of ['outbox_events', 'contacts', 'imports', 'files'])
        await admin.pool.query(`delete from ${table} where store_id=$1`, [storeId]);
      await admin.pool.query('delete from stores where id=$1', [storeId]);
      await admin.pool.query('delete from users where id=$1', [userId]);
    } finally {
      await admin.pool.end();
    }
  });

  it('fails an import whose run stopped an hour ago and leaves a running one alone', async () => {
    const stopped = await prepareImport(`Name,Mobile,Email,Tags\nনাসরিন,${phone()},,`);
    const running = await prepareImport(`Name,Mobile,Email,Tags\nশিরিন,${phone()},,`);
    // The app writes leases from its clock, in whole milliseconds.
    await admin.pool.query(
      "update imports set started_at=now() - interval '2 hours', claimed_at=date_trunc('milliseconds', now() - interval '61 minutes') where id=$1",
      [stopped],
    );

    await service.failStuckImports();

    const result = await service.get(storeId, stopped);
    expect(result.status).toBe('failed');
    expect(await report(result.reportUrl)).toContain('The import stopped before it finished');
    expect((await service.get(storeId, running)).status).toBe('importing');
  });
});
