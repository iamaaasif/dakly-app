import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StartImportInput } from '@dakly/contracts/contacts';
import { createDatabase } from '@dakly/db/client';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { ConsentService } from '../consents/consent.service';
import { ContactsService } from '../contacts/contacts.service';
import { ValkeyClient } from '../platform/cache/valkey-client';
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

async function runImport(file: string, start: Partial<StartImportInput> = {}) {
  const importId = await prepareImport(file, start);
  await service.runCustomerImport(storeId, importId);
  return { importId, result: await service.get(storeId, importId) };
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

async function consentRows(contactId: string) {
  const result = await admin.pool.query(
    'select channel,status,source,evidence,captured_by_user_id from consents where contact_id=$1 order by captured_at,channel',
    [contactId],
  );
  return result.rows;
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

describe('ImportsService.runCustomerImport (Postgres and SeaweedFS)', () => {
  beforeAll(async () => {
    await admin.pool.query("insert into stores(id,name) values($1,'শাহনাজের দোকান')", [storeId]);
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'শাহনাজ',$1::text || '@example.test')",
      [userId],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(ImportsService);
  });

  // Each test starts several imports, more than a store may start in an hour.
  beforeEach(async () => {
    await app.get(ValkeyClient).connection.del(`customer-import:${storeId}`);
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

  it('adds new customers with consent, updates an existing phone by D42 and reports bad rows', async () => {
    const fresh = phone();
    const known = phone();
    const leadId = await existingLead(known);
    await admin.pool.query(
      "insert into consents(id,store_id,contact_id,channel,status,source) values(gen_random_uuid(),$1,$2,'sms','withdrawn','opt_out_link')",
      [storeId, leadId],
    );
    const file = [
      'Name,Mobile,Email,Tags',
      `রাবেয়া খাতুন,${fresh},,ঈদ`,
      `,${known},rabeya@example.com,"ঈদ, পুরনো"`,
      'করিম উদ্দিন,01212345678,,',
    ].join('\n');

    const { importId, result } = await runImport(file);

    expect(result).toMatchObject({
      status: 'done',
      rowsTotal: 3,
      rowsAdded: 1,
      rowsUpdated: 1,
      rowsSkipped: 0,
      rowsFailed: 1,
    });
    const added = await contactByPhone(fresh);
    expect(added).toMatchObject({ name: 'রাবেয়া খাতুন', kind: 'customer', source: 'import' });
    expect(added.import_id).toBe(importId);
    expect(await contactByPhone(known)).toMatchObject({
      name: 'পুরনো নাম',
      email: 'rabeya@example.com',
      kind: 'lead',
      source: 'messenger',
      tags: ['পুরনো', 'ঈদ'],
      import_id: null,
    });
    expect(await consentRows(added.id)).toEqual([
      expect.objectContaining({ channel: 'sms', status: 'granted', evidence: evidence.sms }),
      expect.objectContaining({
        channel: 'whatsapp',
        source: 'import',
        captured_by_user_id: userId,
      }),
    ]);
    expect((await consentRows(leadId)).map((row) => [row.channel, row.status])).toEqual([
      ['sms', 'withdrawn'],
      ['whatsapp', 'granted'],
    ]);
    const lines = (await report(result.reportUrl)).trim().split('\r\n');
    expect(lines).toEqual([
      'Row,Field,Problem',
      expect.stringMatching(/^"3","SMS","This customer said no to SMS messages/),
      expect.stringMatching(/^"4","Phone",/),
    ]);
    expect(lines.join()).not.toContain('01212345678');
  });

  it('leaves an existing customer and its consent as they are in skip mode', async () => {
    const known = phone();
    const leadId = await existingLead(known);

    const { result } = await runImport(
      `Name,Mobile,Email,Tags\nনতুন নাম,${known},new@example.com,ঈদ`,
      {
        duplicateMode: 'skip',
      },
    );

    expect(result).toMatchObject({ status: 'done', rowsSkipped: 1, reportUrl: null });
    expect(await contactByPhone(known)).toMatchObject({
      name: 'পুরনো নাম',
      email: 'old@example.com',
      tags: ['পুরনো'],
    });
    expect(await consentRows(leadId)).toEqual([]);
  });

  it('records consent on a second import only for a channel whose answer changes', async () => {
    const value = phone();
    const file = `Name,Mobile,Email,Tags\nসুমাইয়া,${value},,`;
    await runImport(file, { consentEvidence: { sms: evidence.sms } });

    const { result } = await runImport(file);

    expect(result).toMatchObject({ rowsUpdated: 1 });
    const contact = await contactByPhone(value);
    expect((await consentRows(contact.id)).map((row) => row.channel)).toEqual(['sms', 'whatsapp']);
  });

  it('adds nothing twice when the job runs again for the same import', async () => {
    const value = phone();
    const { importId } = await runImport(`Name,Mobile,Email,Tags\nনাসরিন,${value},,`);
    await admin.pool.query("update imports set status='importing' where id=$1", [importId]);

    await service.runCustomerImport(storeId, importId);

    expect(await service.get(storeId, importId)).toMatchObject({ status: 'done', rowsAdded: 1 });
    const contact = await contactByPhone(value);
    expect(contact.import_id).toBe(importId);
    expect(await consentRows(contact.id)).toHaveLength(2);
  });

  it('commits each batch of a 10,000-row file before the next one starts', async () => {
    const rows = Array.from({ length: 10_000 }, (_, index) => `ক্রেতা ${index},${phone()},,`);
    const importId = await prepareImport(`Name,Mobile,Email,Tags\n${rows.join('\n')}`, {
      consentEvidence: {},
    });
    const contacts = app.get(ContactsService);
    const save = contacts.saveImportedRows.bind(contacts);
    const seen: { added: number | null; contacts: number }[] = [];
    vi.spyOn(contacts, 'saveImportedRows').mockImplementation(async (...args) => {
      seen.push((await committedCount(importId))!);
      return save(...args);
    });

    await service.runCustomerImport(storeId, importId);

    expect(seen.map((count) => count.contacts)).toEqual(
      Array.from({ length: 20 }, (_, batch) => batch * 500),
    );
    expect(seen.slice(1).map((count) => count.added)).toEqual(
      Array.from({ length: 19 }, (_, batch) => (batch + 1) * 500),
    );
    expect(await service.get(storeId, importId)).toMatchObject({
      status: 'done',
      rowsTotal: 10_000,
      rowsAdded: 10_000,
    });
  });

  it('finishes a run that failed mid-file on its retry, adding nothing twice', async () => {
    const rows = Array.from({ length: 1_000 }, (_, index) => `ক্রেতা ${index},${phone()},,`);
    const importId = await prepareImport(`Name,Mobile,Email,Tags\n${rows.join('\n')}`);
    const contacts = app.get(ContactsService);
    const save = contacts.saveImportedRows.bind(contacts);
    let calls = 0;
    vi.spyOn(contacts, 'saveImportedRows').mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 2) throw new Error('Database connection lost');
      return save(...args);
    });

    await expect(service.runCustomerImport(storeId, importId)).rejects.toThrow();
    expect(await committedCount(importId)).toEqual({ added: 500, contacts: 500 });
    await service.runCustomerImport(storeId, importId);

    expect(await service.get(storeId, importId)).toMatchObject({
      status: 'done',
      rowsAdded: 1_000,
    });
    expect((await committedCount(importId))!.contacts).toBe(1_000);
    const consents = await admin.pool.query(
      'select count(*)::int from consents c join contacts k on k.id=c.contact_id where k.import_id=$1',
      [importId],
    );
    expect(consents.rows[0].count).toBe(2_000);
    const upload = await admin.pool.query(
      'select f.status from files f join imports i on i.file_id=f.id where i.id=$1',
      [importId],
    );
    expect(upload.rows[0].status).toBe('ready');
  });

  it('skips a WhatsApp grant for a different saved number while granting SMS', async () => {
    const value = phone();
    const id = await existingLead(value);
    await admin.pool.query('update contacts set whatsapp_phone=$2 where id=$1', [
      id,
      '01912345678',
    ]);
    const { result } = await runImport(`Name,Mobile,WhatsApp\nনাসরিন,${value},01812345678`, {
      mapping: { name: 0, phone: 1, whatsappPhone: 2 },
    });
    expect(result).toMatchObject({ status: 'done', rowsUpdated: 1 });
    expect((await contactByPhone(value)).whatsapp_phone).toBe('01912345678');
    expect((await consentRows(id)).map((row) => [row.channel, row.status])).toEqual([
      ['sms', 'granted'],
    ]);
    expect(await report(result.reportUrl)).toContain('WhatsApp consent skipped: number differs');
  });

  it('fills WhatsApp and grants channels whose earlier import answer was undone', async () => {
    const value = phone();
    const contactId = await existingLead(value);
    await admin.pool.query(
      "insert into consents(id,store_id,contact_id,channel,status,source) values(gen_random_uuid(),$1,$2,'sms','not_answered','import'),(gen_random_uuid(),$1,$2,'whatsapp','not_answered','import')",
      [storeId, contactId],
    );
    const whatsapp = phone();
    const { result } = await runImport(`Name,Phone,WhatsApp\nরাবেয়া,${value},${whatsapp}`, {
      mapping: { name: 0, phone: 1, whatsappPhone: 2 },
    });
    expect((await contactByPhone(value)).whatsapp_phone).toBe(whatsapp);
    const current = await admin.pool.query(
      'select channel,status from contact_consent_current where contact_id=$1 order by channel',
      [contactId],
    );
    expect(current.rows).toEqual([
      { channel: 'sms', status: 'granted' },
      { channel: 'whatsapp', status: 'granted' },
    ]);
    expect(result.reportUrl).toBeNull();
  });

  it('attributes imported consent to the member who started the import', async () => {
    const value = phone();
    const importId = await prepareImport(`Name,Mobile,Email,Tags\nনাসরিন,${value},,`);
    await admin.pool.query('update imports set created_by_user_id=null where id=$1', [importId]);
    await service.runCustomerImport(storeId, importId);
    const contact = await contactByPhone(value);
    expect((await consentRows(contact.id)).map((row) => row.captured_by_user_id)).toEqual([
      userId,
      userId,
    ]);
  });

  it('keeps the WhatsApp destination when another answer commits while the import waits', async () => {
    const value = phone();
    const id = await existingLead(value);
    const importId = await prepareImport(`Name,Mobile,WhatsApp\nনাসরিন,${value},01912345678`, {
      mapping: { name: 0, phone: 1, whatsappPhone: 2 },
      consentEvidence: {},
    });
    const held = await admin.pool.connect();
    await held.query('begin');
    await held.query('select id from contacts where id=$1 for no key update', [id]);
    const pending = service.runCustomerImport(storeId, importId);
    void pending.catch(() => undefined);
    try {
      await expect
        .poll(async () => {
          const rows = await admin.pool.query(
            "select count(*)::int as count from pg_stat_activity where datname=current_database() and usename='dakly_app' and wait_event_type='Lock'",
          );
          return rows.rows[0].count;
        })
        .toBeGreaterThan(0);
      await held.query(
        "insert into consents(id,store_id,contact_id,channel,status,source) values(gen_random_uuid(),$1,$2,'whatsapp','granted','chat_opt_in')",
        [storeId, id],
      );
      await held.query('commit');
      await pending;
      expect((await contactByPhone(value)).whatsapp_phone).toBeNull();
      expect(await report((await service.get(storeId, importId)).reportUrl)).toContain(
        'WhatsApp number differs, not changed',
      );
    } finally {
      await held.query('rollback');
      await pending.catch(() => undefined);
      held.release();
    }
  });

  it('retries a contact created after matching before reading its consent', async () => {
    const value = phone();
    const importId = await prepareImport(`Name,Mobile,WhatsApp\nনাসরিন,${value},01912345678`, {
      mapping: { name: 0, phone: 1, whatsappPhone: 2 },
      consentEvidence: {},
    });
    const contacts = app.get(ContactsService);
    const find = contacts.findImportMatches.bind(contacts);
    vi.spyOn(contacts, 'findImportMatches').mockImplementationOnce(async (...args) => {
      const matches = await find(...args);
      const id = await existingLead(value);
      await admin.pool.query(
        "insert into consents(id,store_id,contact_id,channel,status,source) values(gen_random_uuid(),$1,$2,'whatsapp','granted','chat_opt_in')",
        [storeId, id],
      );
      return matches;
    });

    await expect(service.runCustomerImport(storeId, importId)).rejects.toThrow();
    await service.runCustomerImport(storeId, importId);

    expect((await service.get(storeId, importId)).status).toBe('done');
    expect((await contactByPhone(value)).whatsapp_phone).toBeNull();
  });

  it('keeps a saved WhatsApp number and fills an empty one', async () => {
    const [differs, same, empty] = [phone(), phone(), phone()];
    const [saved, sameNumber, filled] = ['01912345678', '01912345679', '01912345670'];
    for (const [value, whatsapp] of [
      [differs, saved],
      [same, sameNumber],
      [empty, null],
    ] as const) {
      const id = await existingLead(value);
      await admin.pool.query('update contacts set whatsapp_phone=$2 where id=$1', [id, whatsapp]);
    }
    const file = [
      'Name,Mobile,WhatsApp',
      `,${differs},01812345678`,
      `,${same},${sameNumber}`,
      `,${empty},${filled}`,
    ].join('\n');

    const { result } = await runImport(file, {
      mapping: { name: 0, phone: 1, whatsappPhone: 2 },
      consentEvidence: {},
    });

    expect((await contactByPhone(differs)).whatsapp_phone).toBe(saved);
    expect((await contactByPhone(same)).whatsapp_phone).toBe(sameNumber);
    expect((await contactByPhone(empty)).whatsapp_phone).toBe(filled);
    expect((await report(result.reportUrl)).trim().split('\r\n')).toEqual([
      'Row,Field,Problem',
      '"2","WhatsApp number","WhatsApp number differs, not changed"',
    ]);
  });

  it('does not fill an empty WhatsApp number on a contact that has a WhatsApp answer', async () => {
    const [answered, unanswered] = [phone(), phone()];
    const answeredId = await existingLead(answered);
    await existingLead(unanswered);
    await admin.pool.query(
      "insert into consents(id,store_id,contact_id,channel,status,source) values(gen_random_uuid(),$1,$2,'whatsapp','granted','manual')",
      [storeId, answeredId],
    );
    const file = ['Name,Mobile,WhatsApp', `,${answered},01912345678`, `,${unanswered},01912345679`];

    const { result } = await runImport(file.join('\n'), {
      mapping: { name: 0, phone: 1, whatsappPhone: 2 },
      consentEvidence: {},
    });

    expect((await contactByPhone(answered)).whatsapp_phone).toBeNull();
    expect((await contactByPhone(unanswered)).whatsapp_phone).toBe('01912345679');
    expect((await report(result.reportUrl)).trim().split('\r\n')).toEqual([
      'Row,Field,Problem',
      '"2","WhatsApp number","WhatsApp number differs, not changed"',
    ]);
  });

  it('completes an import whose run was killed once its lease is stale, and refuses it while fresh', async () => {
    const value = phone();
    const importId = await prepareImport(`Name,Mobile,Email,Tags\nনাসরিন,${value},,`);
    const hold = (age: string) =>
      admin.pool.query(
        `update imports set claimed_at=date_trunc('milliseconds', now() - interval '${age}'), last_progress_at=now() - interval '${age}' where id=$1`,
        [importId],
      );
    await hold('1 minute');

    await expect(service.runCustomerImport(storeId, importId)).rejects.toMatchObject({
      code: 'IMPORT_BEING_RUN',
    });
    expect((await service.get(storeId, importId)).status).toBe('importing');
    await hold('6 minutes');

    await service.runCustomerImport(storeId, importId);

    expect(await service.get(storeId, importId)).toMatchObject({ status: 'done', rowsAdded: 1 });
  });

  it('adds tags up to 50 and reports the ones left out', async () => {
    const value = phone();
    const id = await existingLead(value);
    const tags = Array.from({ length: 49 }, (_, index) => `ট্যাগ ${index}`);
    await admin.pool.query('update contacts set tags=$2 where id=$1', [id, tags]);
    const file = `Name,Mobile,Email,Tags\n,${value},,"ঈদ, পূজা, ট্যাগ 3, বৈশাখ"`;

    const { result } = await runImport(file, { consentEvidence: {} });

    expect((await contactByPhone(value)).tags).toEqual([...tags, 'ঈদ']);
    expect(await report(result.reportUrl)).toContain('"2","Tags","2 tags not added');
  });

  it('keeps a resumed import alive and removes the report from a lost sweep race', async () => {
    const importId = await prepareImport(`Name,Mobile,Email,Tags\nনাসরিন,${phone()},,`);
    await admin.pool.query(
      "update imports set started_at=now() - interval '2 hours', last_progress_at=now() - interval '20 minutes' where id=$1",
      [importId],
    );
    const repository = app.get(ImportsRepository);
    const storage = app.get<FileStorageDriver>(FILE_STORAGE_DRIVER);
    const requeue = repository.requeue.bind(repository);
    const write = storage.writeText.bind(storage);
    const objects: string[] = [];
    const writeSpy = vi.spyOn(storage, 'writeText').mockImplementation(async (key, body, type) => {
      objects.push(key);
      await write(key, body, type);
    });
    const requeueSpy = vi.spyOn(repository, 'requeue').mockImplementationOnce(async (...args) => {
      await admin.pool.query('update imports set last_progress_at=now() where id=$1', [importId]);
      return requeue(...args);
    });
    try {
      await service.sweepStuckImports();
      expect((await service.get(storeId, importId)).status).toBe('importing');
      for (const key of objects) expect(await storage.getObjectMetadata(key)).toBeNull();
      expect((await service.get(storeId, importId)).reportUrl).toBeNull();
    } finally {
      requeueSpy.mockRestore();
      writeSpy.mockRestore();
    }
  });

  it('queues a stalled import again, fails it after the limit and leaves a running one alone', async () => {
    const stopped = await prepareImport(`Name,Mobile,Email,Tags\nনাসরিন,${phone()},,`);
    const running = await prepareImport(`Name,Mobile,Email,Tags\nশিরিন,${phone()},,`);
    const stall = (requeues: number) =>
      admin.pool.query(
        "update imports set started_at=now() - interval '2 hours', last_progress_at=now() - interval '20 minutes', requeue_count=$2 where id=$1",
        [stopped, requeues],
      );
    const queued = async (importId: string) =>
      (
        await admin.pool.query(
          "select count(*)::int as count from outbox_events where type='import.started' and payload->>'importId'=$1",
          [importId],
        )
      ).rows[0].count;
    await stall(0);

    await service.sweepStuckImports();

    expect(await queued(stopped)).toBe(2);
    expect(await queued(running)).toBe(1);
    expect((await service.get(storeId, stopped)).status).toBe('importing');
    await stall(4);

    await service.sweepStuckImports();

    const result = await service.get(storeId, stopped);
    expect(result.status).toBe('failed');
    expect(await report(result.reportUrl)).toContain('The import stopped before it finished');
    expect((await service.get(storeId, running)).status).toBe('importing');
  });

  it('fails an import whose file never arrived, with the reason in the report', async () => {
    const { importId } = await service.createCustomerImport(storeId, { sizeBytes: 40 }, owner);
    await service.start(
      storeId,
      importId,
      { mapping, duplicateMode: 'update', consentEvidence: {} },
      owner,
    );

    await service.runCustomerImport(storeId, importId);

    const result = await service.get(storeId, importId);
    expect(result.status).toBe('failed');
    expect(await report(result.reportUrl)).toContain('The file was not uploaded');
  });

  describe('undo', () => {
    const lines = (...rows: string[]) => ['Name,Mobile,Email,Tags', ...rows].join('\n');

    async function undo(importId: string) {
      const result = await service.undo(storeId, importId, owner);
      await service.removeContactsOfUndoneImport(storeId, importId);
      return result;
    }

    async function deletedAt(contactId: string) {
      const result = await admin.pool.query('select deleted_at from contacts where id=$1', [
        contactId,
      ]);
      return result.rows[0].deleted_at as Date | null;
    }

    it('removes the contacts the import created, keeps one edited after it and any it only updated', async () => {
      const created = phone();
      const editedLater = phone();
      const known = phone();
      const leadId = await existingLead(known);
      const { importId } = await runImport(
        lines(`রাবেয়া,${created},,`, `করিম,${editedLater},,`, `সুমি,${known},,`),
      );
      const createdId = (await contactByPhone(created)).id;
      const editedId = (await contactByPhone(editedLater)).id;
      await admin.pool.query(
        "update contacts set name='নতুন নাম', updated_at=now() + interval '1 hour' where id=$1",
        [editedId],
      );

      const result = await undo(importId);

      expect(result.status).toBe('undone');
      expect(await deletedAt(createdId)).not.toBeNull();
      expect(await deletedAt(editedId)).toBeNull();
      expect(await deletedAt(leadId)).toBeNull();
      expect(await contactByPhone(known)).toMatchObject({ name: 'সুমি', import_id: null });
      expect(await consentRows(createdId)).toEqual([
        expect.objectContaining({ channel: 'sms', status: 'granted' }),
        expect.objectContaining({ channel: 'whatsapp', status: 'granted' }),
        expect.objectContaining({
          channel: 'sms',
          status: 'not_answered',
          source: 'import',
          evidence: `Import ${importId} undone`,
        }),
        expect.objectContaining({
          channel: 'whatsapp',
          status: 'not_answered',
          source: 'import',
          evidence: `Import ${importId} undone`,
        }),
      ]);
      expect(await consentRows(leadId)).toEqual([
        expect.objectContaining({ channel: 'sms', status: 'granted' }),
        expect.objectContaining({ channel: 'whatsapp', status: 'granted' }),
        expect.objectContaining({
          channel: 'sms',
          status: 'not_answered',
          evidence: `Import ${importId} undone`,
        }),
        expect.objectContaining({
          channel: 'whatsapp',
          status: 'not_answered',
          evidence: `Import ${importId} undone`,
        }),
      ]);
    });

    it('queues removal once for concurrent requests, and a rerun is harmless', async () => {
      const value = phone();
      const { importId } = await runImport(lines(`রাবেয়া,${value},,`));
      const contactId = (await contactByPhone(value)).id;

      await Promise.all([
        service.undo(storeId, importId, owner),
        service.undo(storeId, importId, owner),
      ]);

      expect(await deletedAt(contactId)).toBeNull();
      const events = await admin.pool.query(
        "select payload from outbox_events where type='import.undo_requested' and store_id=$1 and payload->>'importId'=$2",
        [storeId, importId],
      );
      expect(events.rows).toEqual([{ payload: { importId } }]);
      await service.removeContactsOfUndoneImport(storeId, importId);
      await service.removeContactsOfUndoneImport(storeId, importId);
      expect(await deletedAt(contactId)).not.toBeNull();
      await expect(service.undo(storeId, importId, owner)).rejects.toMatchObject({
        code: 'IMPORT_NOT_UNDOABLE',
      });
    });

    it.each(['granted', 'withdrawn'] as const)(
      'preserves a later %s answer when undoing an existing contact',
      async (status) => {
        const value = phone();
        const contactId = await existingLead(value);
        const { importId } = await runImport(lines(`রাবেয়া,${value},,`));
        await admin.pool.query(
          "insert into consents(id,store_id,contact_id,channel,status,source,captured_at) values(gen_random_uuid(),$1,$2,'sms',$3,'manual',now() + interval '1 minute')",
          [storeId, contactId, status],
        );
        await undo(importId);
        const result = await admin.pool.query(
          'select channel,status from contact_consent_current where contact_id=$1 order by channel',
          [contactId],
        );
        expect(result.rows).toEqual([
          { channel: 'sms', status },
          { channel: 'whatsapp', status: 'not_answered' },
        ]);
        expect(await deletedAt(contactId)).toBeNull();
        const history = await consentRows(contactId);
        expect(history.filter((row) => row.channel === 'sms')).toHaveLength(2);
        expect(history.filter((row) => row.channel === 'whatsapp')).toHaveLength(2);
      },
    );

    it('recovers accepted undo after seven days once, and stops recovering completed work', async () => {
      const value = phone();
      const { importId } = await runImport(lines(`রাবেয়া,${value},,`));
      const contactId = (await contactByPhone(value)).id;
      await service.undo(storeId, importId, owner);
      await admin.pool.query(
        "update imports set finished_at=now()-interval '10 days',last_progress_at=now()-interval '20 minutes' where id=$1",
        [importId],
      );
      await service.undo(storeId, importId, owner);
      await Promise.all([service.sweepStuckImports(), service.sweepStuckImports()]);
      const queued = async () =>
        (
          await admin.pool.query(
            "select count(*)::int as count from outbox_events where store_id=$1 and type='import.undo_requested' and payload->>'importId'=$2",
            [storeId, importId],
          )
        ).rows[0].count;
      expect(await queued()).toBe(2);
      expect(await service.get(storeId, importId)).toMatchObject({
        status: 'undone',
        undoFinishedAt: null,
      });
      await service.removeContactsOfUndoneImport(storeId, importId);
      expect((await service.get(storeId, importId)).undoFinishedAt).not.toBeNull();
      expect(await deletedAt(contactId)).not.toBeNull();
      await admin.pool.query(
        "update imports set last_progress_at=now()-interval '20 minutes' where id=$1",
        [importId],
      );
      await service.sweepStuckImports();
      expect(await queued()).toBe(2);
    });

    it('keeps a contact who opted out after the import, and a new import leaves SMS withdrawn', async () => {
      const [kept, removed] = [phone(), phone()];
      const { importId } = await runImport(lines(`রাবেয়া,${kept},,`, `করিম,${removed},,`));
      const keptId = (await contactByPhone(kept)).id;
      await admin.pool.query(
        "insert into consents(id,store_id,contact_id,channel,status,source,captured_at) values(gen_random_uuid(),$1,$2,'sms','withdrawn','opt_out_link',now() + interval '1 minute')",
        [storeId, keptId],
      );

      await undo(importId);

      expect(await deletedAt(keptId)).toBeNull();
      expect(await deletedAt((await contactByPhone(removed)).id)).not.toBeNull();
      const again = await runImport(lines(`রাবেয়া,${kept},,`));
      const current = await admin.pool.query(
        "select status from contact_consent_current where contact_id=$1 and channel='sms'",
        [keptId],
      );
      expect(current.rows).toEqual([{ status: 'withdrawn' }]);
      expect(await report(again.result.reportUrl)).toContain('said no to SMS messages');
    });

    it('undoes an import that was killed mid-file and then failed by the sweep', async () => {
      const rows = Array.from({ length: 1_000 }, (_, index) => `ক্রেতা ${index},${phone()},,`);
      const importId = await prepareImport(`Name,Mobile,Email,Tags\n${rows.join('\n')}`);
      const contacts = app.get(ContactsService);
      const save = contacts.saveImportedRows.bind(contacts);
      let calls = 0;
      vi.spyOn(contacts, 'saveImportedRows').mockImplementation(async (...args) => {
        calls += 1;
        if (calls === 2) throw new Error('Database connection lost');
        return save(...args);
      });
      await expect(service.runCustomerImport(storeId, importId)).rejects.toThrow();
      await admin.pool.query(
        "update imports set last_progress_at=now() - interval '20 minutes', requeue_count=4 where id=$1",
        [importId],
      );
      await service.sweepStuckImports();
      expect((await service.get(storeId, importId)).status).toBe('failed');

      await undo(importId);

      const left = await admin.pool.query(
        'select count(*) filter (where deleted_at is null)::int as live, count(*)::int as total from contacts where import_id=$1',
        [importId],
      );
      expect(left.rows).toEqual([{ live: 0, total: 500 }]);
    });

    it('resumes an undo after a committed consent page without duplicating history or losing a later answer', async () => {
      const values = Array.from({ length: 251 }, () => phone());
      const { importId } = await runImport(lines(...values.map((value) => `রাবেয়া,${value},,`)));
      const keptId = (await contactByPhone(values[0]!)).id;
      await service.undo(storeId, importId, owner);
      const consents = app.get(ConsentService);
      const restore = consents.restoreImportGrants.bind(consents);
      let pages = 0;
      const failing = vi
        .spyOn(consents, 'restoreImportGrants')
        .mockImplementation(async (...args) => {
          pages += 1;
          if (pages === 2) throw new Error('Worker stopped');
          return restore(...args);
        });
      await expect(service.removeContactsOfUndoneImport(storeId, importId)).rejects.toThrow(
        'Worker stopped',
      );
      const counts = async () =>
        (
          await admin.pool.query(
            'select status,count(*)::int as count from consents where contact_id in (select id from contacts where import_id=$1) group by status order by status',
            [importId],
          )
        ).rows;
      expect(await counts()).toEqual([
        { status: 'granted', count: 502 },
        { status: 'not_answered', count: 500 },
      ]);
      expect((await service.get(storeId, importId)).undoFinishedAt).toBeNull();
      failing.mockRestore();
      await consents.record(
        storeId,
        {
          contactId: keptId,
          channel: 'sms',
          status: 'withdrawn',
          source: 'manual',
          evidence: 'আর পাঠাবেন না',
        },
        owner,
      );
      await service.removeContactsOfUndoneImport(storeId, importId);
      await service.removeContactsOfUndoneImport(storeId, importId);
      expect(await counts()).toEqual([
        { status: 'granted', count: 502 },
        { status: 'not_answered', count: 502 },
        { status: 'withdrawn', count: 1 },
      ]);
      expect((await service.get(storeId, importId)).undoFinishedAt).not.toBeNull();
      const left = await admin.pool.query(
        'select id from contacts where import_id=$1 and deleted_at is null',
        [importId],
      );
      expect(left.rows).toEqual([{ id: keptId }]);
    });

    it('frees the phone of a removed contact for a new import', async () => {
      const value = phone();
      const { importId } = await runImport(lines(`রাবেয়া,${value},,`));
      await undo(importId);

      const again = await runImport(lines(`রাবেয়া,${value},,`));

      expect(again.result).toMatchObject({ status: 'done', rowsAdded: 1 });
    });

    it('refuses a second undo and leaves the first result', async () => {
      const { importId } = await runImport(lines(`রাবেয়া,${phone()},,`));
      await undo(importId);

      await expect(service.undo(storeId, importId, owner)).rejects.toMatchObject({
        code: 'IMPORT_NOT_UNDOABLE',
      });
      expect((await service.get(storeId, importId)).status).toBe('undone');
    });

    it('refuses an import that has not finished', async () => {
      const { importId } = await service.createCustomerImport(storeId, { sizeBytes: 40 }, owner);
      await service.start(
        storeId,
        importId,
        { mapping, duplicateMode: 'update', consentEvidence: {} },
        owner,
      );

      await expect(service.undo(storeId, importId, owner)).rejects.toMatchObject({
        code: 'IMPORT_NOT_UNDOABLE',
      });
    });

    it('refuses an import that finished more than 7 days ago and removes nothing', async () => {
      const value = phone();
      const { importId } = await runImport(lines(`রাবেয়া,${value},,`));
      await admin.pool.query(
        "update imports set finished_at=now() - interval '7 days 1 minute' where id=$1",
        [importId],
      );

      await expect(service.undo(storeId, importId, owner)).rejects.toMatchObject({
        code: 'IMPORT_UNDO_EXPIRED',
      });
      expect(await deletedAt((await contactByPhone(value)).id)).toBeNull();
    });
  });
});
