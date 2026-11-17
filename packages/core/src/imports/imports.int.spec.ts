import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { FILE_STORAGE_DRIVER } from '../platform/file-storage/file-storage.provider';
import { DatabaseModule } from '../platform/database/database.module';
import { ImportsModule } from './imports.module';
import { ImportsService } from './imports.service';

class TestModule {}
Module({ imports: [DatabaseModule, ImportsModule, FileStorageModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const stores = [storeId];
const userId = randomUUID();
const starterId = randomUUID();
const owner = { kind: 'user', userId } as const;
const start = {
  mapping: { name: 0, phone: 1 },
  duplicateMode: 'update',
  consentEvidence: { sms: 'দোকানের খাতায় সই করেছেন' },
} as const;
let app: INestApplicationContext;
let service: ImportsService;

describe('ImportsService upload and start (Postgres and SeaweedFS)', () => {
  beforeAll(async () => {
    await admin.pool.query("insert into stores(id,name) values($1,'শাহনাজের দোকান')", [storeId]);
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'শাহনাজ',$1::text || '@example.test')",
      [userId],
    );
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'নাসরিন',$1::text || '@example.test')",
      [starterId],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(ImportsService);
  });

  afterAll(async () => {
    try {
      await app?.close();
      for (const table of ['outbox_events', 'imports', 'files'])
        await admin.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [stores]);
      await admin.pool.query('delete from stores where id=any($1::uuid[])', [stores]);
      await admin.pool.query('delete from users where id=any($1::uuid[])', [[userId, starterId]]);
    } finally {
      await admin.pool.end();
    }
  });

  it('takes the file through its upload URL and queues the import when it starts', async () => {
    const body = new TextEncoder().encode('Name,Mobile\nরাবেয়া খাতুন,01712345678\n');
    const { importId, uploadUrl } = await service.createCustomerImport(
      storeId,
      { sizeBytes: body.length },
      owner,
    );
    expect(new URL(uploadUrl).pathname).toMatch(
      new RegExp(`^/dakly-local/imports/${storeId}/[0-9a-f-]+\\.csv$`),
    );
    const upload = (contentType: string) =>
      fetch(uploadUrl, { method: 'PUT', body, headers: { 'content-type': contentType } });
    expect((await upload('text/plain')).status).toBe(403);
    expect((await upload('text/csv')).status).toBe(200);

    const started = await service.start(storeId, importId, start, owner);

    expect(started).toEqual({
      id: importId,
      status: 'importing',
      rowsTotal: null,
      rowsAdded: null,
      rowsUpdated: null,
      rowsSkipped: null,
      rowsFailed: null,
      reportUrl: null,
    });
    const saved = await admin.pool.query(
      'select column_mapping,consent_evidence,has_consent_confirmation,created_by_user_id from imports where id=$1',
      [importId],
    );
    expect(saved.rows[0]).toEqual({
      column_mapping: start.mapping,
      consent_evidence: start.consentEvidence,
      has_consent_confirmation: true,
      created_by_user_id: userId,
    });
    const events = await admin.pool.query(
      "select payload from outbox_events where type='import.started' and store_id=$1",
      [storeId],
    );
    expect(events.rows).toEqual([{ payload: { importId } }]);
  });

  it('keeps the uploader and the person confirming consent as separate actors', async () => {
    const { importId } = await service.createCustomerImport(storeId, { sizeBytes: 40 }, owner);
    await service.start(storeId, importId, start, { kind: 'user', userId: starterId });
    const saved = await admin.pool.query(
      `select i.created_by_user_id, to_jsonb(i)->>'started_by_user_id' as started_by_user_id,
        f.uploaded_by_user_id from imports i join files f on f.id=i.file_id where i.id=$1`,
      [importId],
    );
    expect(saved.rows[0]).toEqual({
      created_by_user_id: userId,
      uploaded_by_user_id: userId,
      started_by_user_id: starterId,
    });
  });

  it('uses the shared storage driver for its upload URL', async () => {
    const storage = app.get<FileStorageDriver>(FILE_STORAGE_DRIVER);
    const uploadUrl = 'https://files.example.test/import.csv';
    const signed = vi.spyOn(storage, 'createUploadUrl').mockReturnValue(uploadUrl);
    try {
      const result = await service.createCustomerImport(storeId, { sizeBytes: 40 }, owner);
      expect(result.uploadUrl).toBe(uploadUrl);
    } finally {
      signed.mockRestore();
    }
  });

  it('refuses to start an import twice and answers a missing one with not found', async () => {
    const { importId } = await service.createCustomerImport(storeId, { sizeBytes: 40 }, owner);
    await service.start(storeId, importId, start, owner);

    await expect(service.start(storeId, importId, start, owner)).rejects.toMatchObject({
      code: 'IMPORT_ALREADY_STARTED',
    });
    await expect(service.start(storeId, randomUUID(), start, owner)).rejects.toMatchObject({
      code: 'IMPORT_NOT_FOUND',
    });
  });

  it('lets a store start at most 20 imports an hour', async () => {
    const otherStore = randomUUID();
    await admin.pool.query("insert into stores(id,name) values($1,'করিমের দোকান')", [otherStore]);
    stores.push(otherStore);
    for (let count = 0; count < 20; count += 1)
      await service.createCustomerImport(otherStore, { sizeBytes: 40 }, owner);

    await expect(
      service.createCustomerImport(otherStore, { sizeBytes: 40 }, owner),
    ).rejects.toMatchObject({ code: 'IMPORT_RATE_LIMITED', status: 429 });
  });
});
