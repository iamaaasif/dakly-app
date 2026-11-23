import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';

import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { KhataModelOutput } from '@dakly/contracts/khata-scans';
import { createDatabase } from '@dakly/db/client';
import { S3FileStorageDriver } from '@dakly/providers/file-storage/s3/s3-file-storage-driver';
import { FakeLlmDriver } from '@dakly/providers/llm/fake-llm-driver';
import { LlmError } from '@dakly/providers/llm/llm-driver';

import { DatabaseModule } from '../platform/database/database.module';
import { KhataImportsService } from './khata-imports.service';
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
let imports: KhataImportsService;

afterEach(() => vi.restoreAllMocks());
beforeAll(async () => {
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  service = app.get(KhataScansService);
  imports = app.get(KhataImportsService);
});
afterAll(async () => {
  try {
    await app?.close();
    for (const table of [
      'outbox_events',
      'ai_runs',
      'usage_events',
      'khata_rows',
      'khata_imports',
      'khata_pages',
      'orders',
      'due_entries',
      'consents',
      'contacts',
      'files',
      'subscriptions',
    ])
      await admin.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [storeIds]);
    await admin.pool.query('delete from store_counters where store_id = any($1::uuid[])', [
      storeIds,
    ]);
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
  await admin.pool.query('insert into store_counters(store_id) values($1)', [storeId]);
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
const pagePhoto = new Uint8Array(
  await sharp({ create: { width: 40, height: 60, channels: 3, background: '#ffffff' } })
    .jpeg()
    .toBuffer(),
);

function storeObject(bytes = pagePhoto) {
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
      turnClockwiseDegrees: 0,
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
    const read = modelReads({ pageReadable: true, turnClockwiseDegrees: 0, rows: [baki()] });
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

  it('turns a sideways page and reads it again, keeping only the second read and charging once', async () => {
    const { storeId, userId } = await shop(5);
    storeObject();
    const read = vi
      .spyOn(FakeLlmDriver.prototype, 'respond')
      .mockResolvedValueOnce({
        kind: 'output',
        output: {
          pageReadable: true,
          turnClockwiseDegrees: 90,
          rows: [baki({ nameText: 'মাসের', amountText: '৬০০', confidence: 35 })],
        },
        usage,
        model: 'test-vision',
        responseId: 'r1',
      })
      .mockResolvedValueOnce({
        kind: 'output',
        output: { pageReadable: true, turnClockwiseDegrees: 0, rows: [baki()] },
        usage,
        model: 'test-vision',
        responseId: 'r2',
      });
    const pageId = await uploadedPage(storeId, userId);
    await service.requestRead(storeId, pageId);

    await service.readPage(storeId, pageId, true);

    expect(read).toHaveBeenCalledTimes(2);
    const { rows } = await service.getPage(storeId, pageId);
    expect(rows.map((row) => row.name)).toEqual(['রহিম উদ্দিন']);
    const used = await admin.pool.query(
      'select count(*)::int as n from usage_events where store_id=$1',
      [storeId],
    );
    expect(used.rows[0].n).toBe(1);
  });

  it('marks a blurry page unreadable and does not charge for it', async () => {
    const { storeId, userId } = await shop(5);
    storeObject();
    modelReads({ pageReadable: false, turnClockwiseDegrees: 0, rows: [] });
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

    modelReads({ pageReadable: true, turnClockwiseDegrees: 0, rows: [baki()] });
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
        output: { pageReadable: true, turnClockwiseDegrees: 0, rows: [baki()] },
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

describe('KhataImportsService (Postgres)', () => {
  async function readPageOf(storeId: string, userId: string, rows: KhataModelOutput['rows']) {
    storeObject();
    modelReads({ pageReadable: true, turnClockwiseDegrees: 0, rows });
    const pageId = await uploadedPage(storeId, userId);
    await service.requestRead(storeId, pageId);
    await service.readPage(storeId, pageId, true);
    return service.getPage(storeId, pageId);
  }

  const importAll = (page: { rows: { id: string }[] }, extra: Record<string, object> = {}) => ({
    rows: page.rows.map((row) => ({ rowId: row.id, action: 'import' as const, ...extra[row.id] })),
  });

  const balanceOf = async (storeId: string, phone: string) =>
    (
      await admin.pool.query(
        `select coalesce(sum(case when e.kind = 'baki' then e.amount_poisha else -e.amount_poisha end), 0)::int as balance
         from due_entries e join contacts c on c.id = e.contact_id and c.store_id = e.store_id
         where e.store_id = $1 and c.phone = $2`,
        [storeId, phone],
      )
    ).rows[0].balance;

  it('imports customers without consent, baki and payments dated from the page', async () => {
    const { storeId, userId } = await shop(5);
    const regularId = randomUUID();
    await admin.pool.query(
      "insert into contacts(id,store_id,name,phone,source,kind) values($1,$2,'Rahim Uddin','01712345678','manual','customer')",
      [regularId, storeId],
    );
    const page = await readPageOf(storeId, userId, [
      baki(),
      baki({ nameText: 'Shila', phoneText: '01911223344', amountText: '500', kind: 'baki' }),
      baki({ nameText: 'Shila', phoneText: '01911223344', amountText: '200', kind: 'payment' }),
      baki({ nameText: 'অজানা', phoneText: null, amountText: '90' }),
    ]);
    const skipUnknown = { [page.rows[3]!.id]: { action: 'skip' } };

    const result = await imports.importPage(storeId, userId, page.id, importAll(page, skipUnknown));

    expect(result).toMatchObject({
      status: 'done',
      rowsRead: 4,
      rowsImported: 3,
      rowsSkipped: 1,
      customersCreated: 1,
    });
    expect(await balanceOf(storeId, '01712345678')).toBe(125_000);
    expect(await balanceOf(storeId, '01911223344')).toBe(30_000);
    const created = await admin.pool.query(
      "select name, source, kind from contacts where store_id=$1 and phone='01911223344'",
      [storeId],
    );
    expect(created.rows).toEqual([{ name: 'Shila', source: 'khata_import', kind: 'customer' }]);
    const consents = await admin.pool.query(
      'select count(*)::int as n from consents where store_id=$1',
      [storeId],
    );
    expect(consents.rows[0].n).toBe(0);
    const dated = await admin.pool.query(
      "select to_char(occurred_at at time zone 'Asia/Dhaka', 'YYYY-MM-DD') as day, source from due_entries where store_id=$1 and amount_poisha = 125000",
      [storeId],
    );
    expect(dated.rows).toEqual([{ day: '2026-11-12', source: 'khata_import' }]);
  });

  it('refuses a second import of the same page and a decision list that misses a row', async () => {
    const { storeId, userId } = await shop(5);
    const page = await readPageOf(storeId, userId, [baki(), baki({ phoneText: '01811111111' })]);

    await expect(
      imports.importPage(storeId, userId, page.id, {
        rows: [{ rowId: page.rows[0]!.id, action: 'import' }],
      }),
    ).rejects.toMatchObject({ code: 'KHATA_IMPORT_ROWS_MISMATCH' });
    await imports.importPage(storeId, userId, page.id, importAll(page));
    await expect(
      imports.importPage(storeId, userId, page.id, importAll(page)),
    ).rejects.toMatchObject({ code: 'KHATA_PAGE_ALREADY_IMPORTED' });
  });

  it('keeps a row under 85% out until it is checked and saves nothing when one row is refused', async () => {
    const { storeId, userId } = await shop(5);
    const page = await readPageOf(storeId, userId, [
      baki(),
      baki({ nameText: 'শিলা', phoneText: '01811111111', confidence: 60 }),
    ]);
    const yellow = page.rows[1]!;
    expect(yellow.needsCheck).toBe(true);

    await expect(
      imports.importPage(storeId, userId, page.id, importAll(page)),
    ).rejects.toMatchObject({ code: 'KHATA_ROW_NEEDS_CHECK' });
    expect(await balanceOf(storeId, '01712345678')).toBe(0);

    const result = await imports.importPage(
      storeId,
      userId,
      page.id,
      importAll(page, { [yellow.id]: { isChecked: true } }),
    );
    expect(result.rowsImported).toBe(2);
  });

  it('adds baki to a similar-phone customer only when the owner chooses the merge', async () => {
    const { storeId, userId } = await shop(5);
    const mituId = randomUUID();
    await admin.pool.query(
      "insert into contacts(id,store_id,name,phone,source,kind) values($1,$2,'Mitu Akter','01556781230','manual','customer')",
      [mituId, storeId],
    );
    const page = await readPageOf(storeId, userId, [
      baki({ nameText: 'Mitu', phoneText: '01556 781231', amountText: '950' }),
    ]);
    expect(page.rows[0]!.match).toEqual({ contactId: mituId, kind: 'similar_phone' });

    const result = await imports.importPage(
      storeId,
      userId,
      page.id,
      importAll(page, { [page.rows[0]!.id]: { mergeContactId: mituId } }),
    );

    expect(result.customersCreated).toBe(0);
    expect(await balanceOf(storeId, '01556781230')).toBe(95_000);
    expect(await balanceOf(storeId, '01556781231')).toBe(0);
  });

  it('refuses a baki with no phone and no chosen customer', async () => {
    const { storeId, userId } = await shop(5);
    const page = await readPageOf(storeId, userId, [baki({ phoneText: null })]);
    await expect(
      imports.importPage(storeId, userId, page.id, importAll(page)),
    ).rejects.toMatchObject({ code: 'KHATA_ROW_NEEDS_PHONE' });
  });

  it('undoes an import: removes its baki and the customers it added that nobody changed', async () => {
    const { storeId, userId } = await shop(5);
    await admin.pool.query(
      "insert into contacts(id,store_id,name,phone,source,kind) values(gen_random_uuid(),$1,'Rahim Uddin','01712345678','manual','customer')",
      [storeId],
    );
    const page = await readPageOf(storeId, userId, [
      baki(),
      baki({ nameText: 'Shila', phoneText: '01911223344' }),
      baki({ nameText: 'Jabed', phoneText: '01822334455' }),
    ]);
    const result = await imports.importPage(storeId, userId, page.id, importAll(page));
    await admin.pool.query(
      "update contacts set notes='VIP', updated_at = now() + interval '1 minute' where store_id=$1 and phone='01822334455'",
      [storeId],
    );

    const undone = await imports.undo(storeId, result.id);

    expect(undone.status).toBe('undone');
    const left = await admin.pool.query(
      'select phone, deleted_at is not null as deleted from contacts where store_id=$1 order by phone',
      [storeId],
    );
    expect(left.rows).toEqual([
      { phone: '01712345678', deleted: false },
      { phone: '01822334455', deleted: false },
      { phone: '01911223344', deleted: true },
    ]);
    const entries = await admin.pool.query(
      'select count(*)::int as n from due_entries where store_id=$1',
      [storeId],
    );
    expect(entries.rows[0].n).toBe(0);
    const again = await service.getPage(storeId, page.id);
    expect(again.status).toBe('read');
    await imports.importPage(storeId, userId, page.id, importAll(again));
  });

  it('imports a sale as a delivered order and a sale with no phone as a walk-in sale', async () => {
    const { storeId, userId } = await shop(5);
    const page = await readPageOf(storeId, userId, [
      baki({ kind: 'sale', amountText: '৳১,২০০' }),
      baki({ kind: 'sale', nameText: 'Walk in', phoneText: null, amountText: '300' }),
    ]);

    const result = await imports.importPage(storeId, userId, page.id, importAll(page));

    expect(result).toMatchObject({ rowsImported: 2, customersCreated: 1 });
    const sales = await admin.pool.query(
      `select o.source, o.stage, o.payment_status, o.items_subtotal_poisha::int as items_subtotal_poisha, o.cod_amount_poisha::int as cod_amount_poisha,
              o.recipient_phone, o.buyer_contact_id is not null as linked,
              to_char(o.created_at at time zone 'Asia/Dhaka', 'YYYY-MM-DD') as day
       from orders o where o.store_id=$1 order by o.items_subtotal_poisha desc`,
      [storeId],
    );
    expect(sales.rows).toEqual([
      {
        source: 'khata_import',
        stage: 'delivered',
        payment_status: 'paid',
        items_subtotal_poisha: 120_000,
        cod_amount_poisha: 0,
        recipient_phone: null,
        linked: true,
        day: '2026-11-12',
      },
      expect.objectContaining({ items_subtotal_poisha: 30_000, linked: false }),
    ]);
    const events = await admin.pool.query(
      "select type from outbox_events where store_id=$1 and type like 'order.%' order by type",
      [storeId],
    );
    expect(events.rows.map((row) => row.type)).toEqual(['order.imported', 'order.imported']);
  });

  it('undoes imported sales that were not changed and keeps one that was', async () => {
    const { storeId, userId } = await shop(5);
    const page = await readPageOf(storeId, userId, [
      baki({ kind: 'sale', amountText: '1200' }),
      baki({ kind: 'sale', nameText: 'Walk in', phoneText: null, amountText: '300' }),
    ]);
    const result = await imports.importPage(storeId, userId, page.id, importAll(page));
    await admin.pool.query(
      'update orders set updated_at = now() where store_id=$1 and items_subtotal_poisha = 30000',
      [storeId],
    );

    await imports.undo(storeId, result.id);

    const left = await admin.pool.query(
      'select items_subtotal_poisha::int as items_subtotal_poisha from orders where store_id=$1',
      [storeId],
    );
    expect(left.rows).toEqual([{ items_subtotal_poisha: 30_000 }]);
  });

  it('lets only a khata import order go without a recipient phone, address and district', async () => {
    const { storeId } = await shop(5);
    const insert = (source: string) =>
      admin.pool.query(
        `insert into orders(id,store_id,number,source,created_by_type,recipient_name,items_subtotal_poisha,cod_amount_poisha)
         values(gen_random_uuid(),$1,$3,$2,'user','Rahim',100,100)`,
        [storeId, source, source === 'manual' ? 5001 : 5002],
      );
    await expect(insert('manual')).rejects.toThrow(/orders_recipient_required/);
    await expect(insert('khata_import')).resolves.toBeDefined();
  });

  it('does not undo an import after 7 days', async () => {
    const { storeId, userId } = await shop(5);
    const page = await readPageOf(storeId, userId, [baki()]);
    const result = await imports.importPage(storeId, userId, page.id, importAll(page));
    await admin.pool.query(
      "update khata_imports set created_at = now() - interval '8 days' where id=$1",
      [result.id],
    );
    await expect(imports.undo(storeId, result.id)).rejects.toMatchObject({
      code: 'KHATA_IMPORT_UNDO_EXPIRED',
    });
  });

  it('lists the latest imports of one shop, newest first, with undone ones marked', async () => {
    const { storeId, userId } = await shop(5);
    const other = await shop(5);
    const first = await readPageOf(storeId, userId, [baki()]);
    const older = await imports.importPage(storeId, userId, first.id, importAll(first));
    await admin.pool.query(
      "update khata_imports set created_at = now() - interval '1 day' where id=$1",
      [older.id],
    );
    const second = await readPageOf(storeId, userId, [baki({ phoneText: '01911223344' })]);
    const newer = await imports.importPage(storeId, userId, second.id, importAll(second));
    await imports.undo(storeId, older.id);
    const elsewhere = await readPageOf(other.storeId, other.userId, [baki()]);
    await imports.importPage(other.storeId, other.userId, elsewhere.id, importAll(elsewhere));

    const listed = await imports.listImports(storeId);

    expect(listed.map((item) => [item.id, item.status])).toEqual([
      [newer.id, 'done'],
      [older.id, 'undone'],
    ]);
  });
});
