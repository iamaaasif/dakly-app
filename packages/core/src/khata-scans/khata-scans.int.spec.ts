import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';

import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { KhataModelOutput } from '@dakly/contracts/khata-scans';
import { createDatabase } from '@dakly/db/client';
import { S3FileStorageDriver } from '@dakly/providers/file-storage/s3/s3-file-storage-driver';
import { FakeLlmDriver } from '@dakly/providers/llm/fake-llm-driver';
import { LlmError } from '@dakly/providers/llm/llm-driver';

import { DatabaseModule } from '../platform/database/database.module';
import { KhataScansModule } from './khata-scans.module';
import { KhataScansService } from './khata-scans.service';

class TestModule {}
Module({ imports: [DatabaseModule, KhataScansModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeIds: string[] = [];
const userIds: string[] = [];
const planIds: string[] = [];
const usage = { inputTokens: 100, cachedInputTokens: 0, outputTokens: 50 };
let app: INestApplicationContext;
let service: KhataScansService;

afterEach(() => vi.restoreAllMocks());
beforeAll(async () => {
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  service = app.get(KhataScansService);
});
afterAll(async () => {
  try {
    await app?.close();
    for (const table of [
      'outbox_events',
      'ai_runs',
      'usage_events',
      'khata_rows',
      'khata_pages',
      'contacts',
      'files',
      'subscriptions',
    ])
      await admin.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [storeIds]);
    await admin.pool.query('delete from stores where id = any($1::uuid[])', [storeIds]);
    await admin.pool.query('delete from plans where id = any($1::uuid[])', [planIds]);
    await admin.pool.query('delete from users where id = any($1::uuid[])', [userIds]);
  } finally {
    await admin.pool.end();
  }
});

async function shop(pagesAllowed: number) {
  const storeId = randomUUID();
  const planId = randomUUID();
  const userId = randomUUID();
  storeIds.push(storeId);
  planIds.push(planId);
  userIds.push(userId);
  await admin.pool.query('insert into stores(id,name) values($1,$2)', [storeId, 'রিনার দোকান']);
  await admin.pool.query(
    'insert into users(id,name,phone,phone_verified_at) values($1,$2,$3,now())',
    [userId, 'রিনা', `018${randomInt(10000000, 99999999)}`],
  );
  await admin.pool.query(
    "insert into plans(id,code,name,monthly_price_poisha,yearly_price_poisha,limits,is_public) values($1::uuid,$1::text,'Khata fixture',0,0,$2,false)",
    [planId, { ai_scan: pagesAllowed }],
  );
  await admin.pool.query(
    "insert into subscriptions(id,store_id,plan_id,status,current_period_price_poisha,current_period_start,current_period_end) values(gen_random_uuid(),$1,$2,'active',0,now() - interval '1 day',now() + interval '29 days')",
    [storeId, planId],
  );
  return { storeId, userId };
}

// The page is "uploaded" by stubbing the object store the way a browser PUT would leave it.
function storeObject(bytes = new Uint8Array([1, 2, 3])) {
  vi.spyOn(S3FileStorageDriver.prototype, 'getObjectMetadata').mockImplementation(async () => ({
    contentType: 'image/jpeg',
    sizeBytes: 3_000_000,
  }));
  vi.spyOn(S3FileStorageDriver.prototype, 'readBytes').mockResolvedValue({
    kind: 'found',
    bytes,
  });
}

function modelReads(output: KhataModelOutput) {
  return vi
    .spyOn(FakeLlmDriver.prototype, 'respond')
    .mockResolvedValue({ kind: 'output', output, usage, model: 'test-vision', responseId: 'r1' });
}

async function uploadedPage(storeId: string, userId: string) {
  const { pageId } = await service.createPage(storeId, userId, {
    contentType: 'image/jpeg',
    sizeBytes: 3_000_000,
  });
  return pageId;
}

const baki = (fields: Partial<KhataModelOutput['rows'][number]> = {}) => ({
  dateText: '১২/১১/২৬',
  nameText: 'রহিম উদ্দিন',
  phoneText: '০১৭১২-৩৪৫৬৭৮',
  itemText: 'চাল ২ বস্তা',
  amountText: '১,২৫০/-',
  kind: 'baki' as const,
  confidence: 92,
  ...fields,
});

describe('KhataScansService (Postgres)', () => {
  it('reads a page into rows, suggests customers and charges one scan', async () => {
    const { storeId, userId } = await shop(5);
    const exactId = randomUUID();
    const nearId = randomUUID();
    await admin.pool.query(
      "insert into contacts(id,store_id,name,phone,source,kind) values($1,$2,'Rahim Uddin','01712345678','manual','customer'),($3,$2,'Mitu Akter','01556781230','manual','customer')",
      [exactId, storeId, nearId],
    );
    storeObject();
    modelReads({
      pageReadable: true,
      rows: [
        baki(),
        baki({ nameText: 'Mitu', phoneText: '01556 781231', amountText: 'Tk 950' }),
        baki({ nameText: 'শিলা', phoneText: null, confidence: 60, amountText: '৫০০' }),
      ],
    });
    const pageId = await uploadedPage(storeId, userId);

    const queued = await service.requestRead(storeId, pageId);
    expect(queued.status).toBe('reading');
    await service.readPage(storeId, pageId, true);

    const page = await service.getPage(storeId, pageId);
    expect(page.status).toBe('read');
    expect(page.rows.map((row) => [row.name, row.amountPoisha, row.needsCheck, row.match])).toEqual(
      [
        ['রহিম উদ্দিন', 125_000, false, { contactId: exactId, kind: 'phone' }],
        ['Mitu', 95_000, false, { contactId: nearId, kind: 'similar_phone' }],
        ['শিলা', 50_000, true, null],
      ],
    );
    expect(page.rows[0]).toMatchObject({ phone: '01712345678', entryDate: '2026-11-12' });
    const used = await admin.pool.query(
      'select quantity, unit, reference from usage_events where store_id=$1',
      [storeId],
    );
    expect(used.rows).toEqual([{ quantity: 1, unit: 'ai_scan', reference: pageId }]);
  });

  it('does not read or charge a page twice when the job runs again', async () => {
    const { storeId, userId } = await shop(5);
    storeObject();
    const read = modelReads({ pageReadable: true, rows: [baki()] });
    const pageId = await uploadedPage(storeId, userId);
    await service.requestRead(storeId, pageId);

    await service.readPage(storeId, pageId, true);
    await service.readPage(storeId, pageId, true);

    expect(read).toHaveBeenCalledTimes(1);
    expect((await service.getPage(storeId, pageId)).rows).toHaveLength(1);
    const used = await admin.pool.query(
      'select count(*)::int as n from usage_events where store_id=$1',
      [storeId],
    );
    expect(used.rows[0].n).toBe(1);
  });

  it('marks a blurry page unreadable and does not charge for it', async () => {
    const { storeId, userId } = await shop(5);
    storeObject();
    modelReads({ pageReadable: false, rows: [] });
    const pageId = await uploadedPage(storeId, userId);
    await service.requestRead(storeId, pageId);

    await service.readPage(storeId, pageId, true);

    expect((await service.getPage(storeId, pageId)).status).toBe('unreadable');
    const used = await admin.pool.query(
      'select count(*)::int as n from usage_events where store_id=$1',
      [storeId],
    );
    expect(used.rows[0].n).toBe(0);
  });

  it('refuses to queue a page when the plan has no pages left', async () => {
    const { storeId, userId } = await shop(0);
    storeObject();
    const pageId = await uploadedPage(storeId, userId);
    await expect(service.requestRead(storeId, pageId)).rejects.toMatchObject({
      code: 'KHATA_SCAN_ALLOWANCE_EXCEEDED',
    });
  });

  it('refuses a page whose photo was never uploaded', async () => {
    const { storeId, userId } = await shop(5);
    vi.spyOn(S3FileStorageDriver.prototype, 'getObjectMetadata').mockResolvedValue(null);
    const pageId = await uploadedPage(storeId, userId);
    await expect(service.requestRead(storeId, pageId)).rejects.toMatchObject({
      code: 'KHATA_PAGE_NOT_UPLOADED',
    });
  });

  it('fails a page the model could not answer and lets the owner try it again', async () => {
    const { storeId, userId } = await shop(5);
    storeObject();
    vi.spyOn(FakeLlmDriver.prototype, 'respond').mockRejectedValueOnce(
      new LlmError('LLM_UNAVAILABLE'),
    );
    const pageId = await uploadedPage(storeId, userId);
    await service.requestRead(storeId, pageId);
    await service.readPage(storeId, pageId, true);
    expect(await service.getPage(storeId, pageId)).toMatchObject({
      status: 'failed',
      failureCode: 'model',
    });

    modelReads({ pageReadable: true, rows: [baki()] });
    await service.requestRead(storeId, pageId);
    await service.readPage(storeId, pageId, true);
    expect((await service.getPage(storeId, pageId)).status).toBe('read');
  });

  it('tries a page again after a model timeout and charges it once', async () => {
    const { storeId, userId } = await shop(5);
    storeObject();
    const respond = vi
      .spyOn(FakeLlmDriver.prototype, 'respond')
      .mockRejectedValueOnce(new LlmError('LLM_TIMEOUT'))
      .mockResolvedValueOnce({
        kind: 'output',
        output: { pageReadable: true, rows: [baki()] },
        usage,
        model: 'test-vision',
        responseId: 'r2',
      });
    const pageId = await uploadedPage(storeId, userId);
    await service.requestRead(storeId, pageId);

    await expect(service.readPage(storeId, pageId, false)).rejects.toThrow('tried again');
    expect((await service.getPage(storeId, pageId)).status).toBe('reading');
    await service.readPage(storeId, pageId, true);

    expect(respond).toHaveBeenCalledTimes(2);
    expect((await service.getPage(storeId, pageId)).status).toBe('read');
    const used = await admin.pool.query(
      'select count(*)::int as n from usage_events where store_id=$1',
      [storeId],
    );
    expect(used.rows[0].n).toBe(1);
  });

  it('fails a page at once when the model gives an answer that will not change', async () => {
    const { storeId, userId } = await shop(5);
    storeObject();
    vi.spyOn(FakeLlmDriver.prototype, 'respond').mockRejectedValueOnce(new LlmError('LLM_REFUSED'));
    const pageId = await uploadedPage(storeId, userId);
    await service.requestRead(storeId, pageId);

    await service.readPage(storeId, pageId, false);

    expect(await service.getPage(storeId, pageId)).toMatchObject({
      status: 'failed',
      failureCode: 'model',
    });
  });
});
