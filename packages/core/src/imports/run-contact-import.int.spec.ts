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

async function runImport(file: string, start: Partial<StartImportInput> = {}) {
  const body = new TextEncoder().encode(file);
  const { importId, uploadUrl } = await service.createCustomerImport(
    storeId,
    { sizeBytes: body.length },
    owner,
  );
  const upload = await fetch(uploadUrl, { method: 'PUT', body });
  expect(upload.status).toBe(200);
  await service.start(
    storeId,
    importId,
    { mapping, duplicateMode: 'update', consentEvidence: evidence, ...start },
    owner,
  );
  await service.runCustomerImport(storeId, importId);
  return { importId, result: await service.get(storeId, importId) };
}

async function contactByPhone(value: string) {
  const result = await admin.pool.query(
    'select id,name,email,kind,source,tags,import_id from contacts where store_id=$1 and phone=$2',
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
      expect.stringMatching(/^"3","sms","This customer said no to SMS messages/),
      expect.stringMatching(/^"4","phone",/),
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

  it('applies a large file in batches', async () => {
    const rows = Array.from({ length: 1_201 }, (_, index) => `ক্রেতা ${index},${phone()},,`);

    const { importId, result } = await runImport(`Name,Mobile,Email,Tags\n${rows.join('\n')}`, {
      consentEvidence: {},
    });

    expect(result).toMatchObject({ status: 'done', rowsTotal: 1_201, rowsAdded: 1_201 });
    const count = await admin.pool.query('select count(*)::int from contacts where import_id=$1', [
      importId,
    ]);
    expect(count.rows[0].count).toBe(1_201);
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
      expect(await consentRows(createdId)).toHaveLength(2);
    });

    it('queues the removal in the same transaction and a rerun of it is harmless', async () => {
      const value = phone();
      const { importId } = await runImport(lines(`রাবেয়া,${value},,`));
      const contactId = (await contactByPhone(value)).id;

      await service.undo(storeId, importId, owner);

      expect(await deletedAt(contactId)).toBeNull();
      const events = await admin.pool.query(
        "select payload from outbox_events where type='import.undo_requested' and store_id=$1 and payload->>'importId'=$2",
        [storeId, importId],
      );
      expect(events.rows).toEqual([{ payload: { importId } }]);
      await service.removeContactsOfUndoneImport(storeId, importId);
      await service.removeContactsOfUndoneImport(storeId, importId);
      expect(await deletedAt(contactId)).not.toBeNull();
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
