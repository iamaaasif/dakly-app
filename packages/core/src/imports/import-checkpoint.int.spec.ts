import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { StartImportInput } from '@dakly/contracts/contacts';
import { createDatabase } from '@dakly/db/client';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { ContactsService } from '../contacts/contacts.service';
import { DatabaseModule } from '../platform/database/database.module';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { ImportsModule } from './imports.module';
import { ImportsRepository } from './imports.repository';
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

async function committedCount(importId: string) {
  const result = await admin.pool.query<{ added: number | null; contacts: number }>(
    'select rows_added as added, (select count(*)::int from contacts where import_id=$1) as contacts from imports where id=$1',
    [importId],
  );
  return result.rows[0];
}

async function contactByPhone(value: string) {
  const result = await admin.pool.query(
    'select id,name,email,whatsapp_phone,kind,source,tags,import_id from contacts where store_id=$1 and phone=$2',
    [storeId, value],
  );
  return result.rows[0];
}

async function existingLead(value: string) {
  const id = randomUUID();
  await admin.pool.query(
    "insert into contacts(id,store_id,name,phone,email,source,kind,tags) values($1,$2,'পুরনো নাম',$3,'old@example.com','messenger','lead','{পুরনো}')",
    [id, storeId, value],
  );
  return id;
}

async function report(url: string | null) {
  expect(url).not.toBeNull();
  return (await fetch(url!)).text();
}

describe('Import checkpoints (Postgres and SeaweedFS)', () => {
  beforeAll(async () => {
    await admin.pool.query("insert into stores(id,name) values($1,'শাহনাজের দোকান')", [storeId]);
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'শাহনাজ',$1::text || '@example.test')",
      [userId],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(ImportsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('resumes committed batches without replacing a later edit or losing report entries', async () => {
    const value = phone();
    const id = await existingLead(value);
    await admin.pool.query('update contacts set tags=$2 where id=$1', [
      id,
      Array.from({ length: 50 }, (_, index) => `ট্যাগ ${index}`),
    ]);
    const rows = Array.from({ length: 500 }, () => `ক্রেতা,${phone()},,`);
    const importId = await prepareImport(
      `Name,Mobile,Email,Tags\nফাইলের নাম,${value},,নতুন\n${rows.join('\n')}\nভুল,0171,,`,
      { consentEvidence: {} },
    );
    const repository = app.get(ImportsRepository);
    const beforeRun = await repository.findById(storeId, importId);
    const contacts = app.get(ContactsService);
    const save = contacts.saveImportedRows.bind(contacts);
    let calls = 0;
    vi.spyOn(contacts, 'saveImportedRows').mockImplementation(async (...args) => {
      if (++calls === 2) throw new Error('Database connection lost');
      return save(...args);
    });
    await expect(service.runCustomerImport(storeId, importId)).rejects.toThrow();
    expect((await contactByPhone(value)).name).toBe('ফাইলের নাম');
    await admin.pool.query('update contacts set name=$2, updated_at=now() where id=$1', [
      id,
      'সংশোধিত নাম',
    ]);

    // The eligibility read can race the prior run's last committed batch.
    vi.spyOn(repository, 'findById').mockResolvedValueOnce(beforeRun);
    await service.runCustomerImport(storeId, importId);

    const result = await service.get(storeId, importId);
    expect((await contactByPhone(value)).name).toBe('সংশোধিত নাম');
    expect(result).toMatchObject({
      status: 'done',
      rowsTotal: 502,
      rowsAdded: 500,
      rowsUpdated: 1,
      rowsFailed: 1,
    });
    const lines = await report(result.reportUrl);
    expect(lines).toContain('1 tags not added: a customer has at most 50');
    expect(lines).toContain('"503","Phone",');
  });

  it('refuses a changed upload before resuming a saved batch position', async () => {
    const rows = Array.from({ length: 501 }, () => `ক্রেতা,${phone()},,`);
    const importId = await prepareImport(`Name,Mobile,Email,Tags\n${rows.join('\n')}`, {
      consentEvidence: {},
    });
    const contacts = app.get(ContactsService);
    const save = contacts.saveImportedRows.bind(contacts);
    let calls = 0;
    vi.spyOn(contacts, 'saveImportedRows').mockImplementation(async (...args) => {
      if (++calls === 2) throw new Error('Database connection lost');
      return save(...args);
    });
    await expect(service.runCustomerImport(storeId, importId)).rejects.toThrow();
    const found = await app.get(ImportsRepository).findById(storeId, importId);
    await app
      .get<FileStorageDriver>(FILE_STORAGE_DRIVER)
      .writeText(found!.uploadKey, `Name,Mobile,Email,Tags\nবদলানো,${phone()},,`, 'text/csv');

    await service.runCustomerImport(storeId, importId);

    const result = await service.get(storeId, importId);
    expect(result).toMatchObject({ status: 'failed', rowsAdded: 500 });
    expect(await committedCount(importId)).toEqual({ added: 500, contacts: 500 });
    expect(await report(result.reportUrl)).toContain('The uploaded file changed');
  });
  it('keeps checkpointed row errors and warnings when the sweep exhausts retries', async () => {
    const value = phone();
    const id = await existingLead(value);
    await admin.pool.query('update contacts set tags=$2 where id=$1', [
      id,
      Array.from({ length: 50 }, (_, index) => `ট্যাগ ${index}`),
    ]);
    const rows = Array.from({ length: 500 }, () => `ক্রেতা,${phone()},,`);
    const importId = await prepareImport(
      `Name,Mobile,Email,Tags\nফাইলের নাম,${value},,নতুন\n${rows.join('\n')}\nভুল,0171,,`,
      { consentEvidence: {} },
    );
    const contacts = app.get(ContactsService);
    const save = contacts.saveImportedRows.bind(contacts);
    let calls = 0;
    vi.spyOn(contacts, 'saveImportedRows').mockImplementation(async (...args) => {
      if (++calls === 2) throw new Error('Database connection lost');
      return save(...args);
    });
    await expect(service.runCustomerImport(storeId, importId)).rejects.toThrow();
    expect(await committedCount(importId)).toEqual({ added: 499, contacts: 499 });
    await admin.pool.query(
      "update imports set last_progress_at=now() - interval '20 minutes', requeue_count=4 where id=$1",
      [importId],
    );

    await service.sweepStuckImports();

    const result = await service.get(storeId, importId);
    expect(result).toMatchObject({
      status: 'failed',
      rowsTotal: 502,
      rowsAdded: 499,
      rowsUpdated: 1,
      rowsFailed: 1,
    });
    const lines = await report(result.reportUrl);
    expect(lines).toContain('1 tags not added: a customer has at most 50');
    expect(lines).toContain('"503","Phone",');
    expect(lines).toContain('The import stopped before it finished');
  });
});
