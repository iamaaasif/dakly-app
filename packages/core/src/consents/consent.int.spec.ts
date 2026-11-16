import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { consents } from '@dakly/db/schema/contacts';

import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { StoreTransaction } from '../platform/database/store-transaction';
import { TenantDatabase } from '../platform/database/tenant-database';
import { ConsentService } from './consent.service';
import { ConsentsModule } from './consents.module';

class TestModule {}
Module({ imports: [DatabaseModule, ConsentsModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeA = randomUUID();
const storeB = randomUUID();
const userId = randomUUID();
const staff = { kind: 'user', userId } as const;
let app: INestApplicationContext;
let service: ConsentService;
let minute = 0;

async function contact(storeId: string) {
  const id = randomUUID();
  await admin.pool.query(
    "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','customer')",
    [id, storeId],
  );
  return id;
}

function granted(contactId: string, channel: 'whatsapp' | 'sms' = 'whatsapp') {
  return {
    contactId,
    channel,
    status: 'granted',
    source: 'manual',
    evidence: 'দোকানে এসে মৌখিকভাবে রাজি হয়েছেন',
  } as const;
}

function withdrawn(contactId: string) {
  return { ...granted(contactId), status: 'withdrawn', evidence: 'ফোনে না বলেছেন' } as const;
}

async function consentEvents(contactId: string) {
  const result = await admin.pool.query<{ payload: object }>(
    "select payload from outbox_events where type='consent.changed' and payload->>'contactId'=$1",
    [contactId],
  );
  return result.rows.map((row) => row.payload);
}

describe('ConsentService (Postgres)', () => {
  beforeAll(async () => {
    await admin.pool.query(
      "insert into stores(id,name) values($1,'রিনার দোকান'),($2,'করিমের দোকান')",
      [storeA, storeB],
    );
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'নুসরাত',$1::text || '@example.test')",
      [userId],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(ConsentService);
    // Each answer gets its own minute, so the order of rows is the order of calls.
    vi.spyOn(app.get(Clock), 'now').mockImplementation(
      () => new Date(Date.UTC(2026, 10, 16, 4, minute++)),
    );
  });

  afterAll(async () => {
    try {
      await app?.close();
      for (const table of ['outbox_events', 'contacts'])
        await admin.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
          [storeA, storeB],
        ]);
      await admin.pool.query('delete from stores where id=any($1::uuid[])', [[storeA, storeB]]);
      await admin.pool.query('delete from users where id=$1', [userId]);
    } finally {
      await admin.pool.end();
    }
  });

  it('reads the latest answer per channel', async () => {
    const id = await contact(storeA);
    await service.record(storeA, granted(id), staff);
    await service.record(storeA, granted(id, 'sms'), staff);
    await service.record(storeA, withdrawn(id), staff);

    expect(await service.current(storeA, [id], 'whatsapp')).toEqual([
      expect.objectContaining({ contactId: id, status: 'withdrawn', source: 'manual' }),
    ]);
    expect(await service.current(storeA, [id], 'sms')).toEqual([
      expect.objectContaining({ contactId: id, status: 'granted' }),
    ]);
    expect(await service.current(storeA, [id], 'messenger')).toEqual([]);
  });

  it('reads a new opt-in after a withdrawal as opted in', async () => {
    const id = await contact(storeA);
    await service.record(storeA, granted(id), staff);
    await service.record(storeA, withdrawn(id), staff);
    const optIn = await service.record(storeA, granted(id), staff);

    expect(await service.current(storeA, [id], 'whatsapp')).toEqual([
      {
        contactId: id,
        status: 'granted',
        source: 'manual',
        capturedAt: new Date(optIn.capturedAt),
      },
    ]);
  });

  it('keeps every answer with its evidence and the member who recorded it', async () => {
    const id = await contact(storeA);
    const first = await service.record(storeA, granted(id), staff);
    await service.record(storeA, withdrawn(id), { kind: 'system' });

    const rows = await admin.pool.query(
      'select status, evidence, captured_by_user_id from consents where contact_id=$1 order by captured_at',
      [id],
    );
    expect(first).toMatchObject({ contactId: id, channel: 'whatsapp', status: 'granted' });
    expect(rows.rows).toEqual([
      { status: 'granted', evidence: granted(id).evidence, captured_by_user_id: userId },
      { status: 'withdrawn', evidence: withdrawn(id).evidence, captured_by_user_id: null },
    ]);
  });

  it('writes consent.changed with ids and enum values only', async () => {
    const id = await contact(storeA);
    const consent = await service.record(storeA, granted(id), staff);

    expect(await consentEvents(id)).toEqual([
      {
        consentId: consent.id,
        contactId: id,
        channel: 'whatsapp',
        status: 'granted',
        source: 'manual',
      },
    ]);
  });

  it('rolls back the consent row and its event together', async () => {
    const id = await contact(storeA);
    await expect(
      app.get(StoreTransaction).run(storeA, async () => {
        await service.record(storeA, granted(id), staff);
        throw new Error('Later step failed');
      }),
    ).rejects.toThrow('Later step failed');

    expect(await service.current(storeA, [id], 'whatsapp')).toEqual([]);
    expect(await consentEvents(id)).toEqual([]);
  });

  it('lets the app role neither change nor delete a consent row', async () => {
    const id = await contact(storeA);
    const consent = await service.record(storeA, granted(id), staff);
    const database = app.get(TenantDatabase);

    await expect(
      database.forStore(storeA, (tx) =>
        tx.update(consents).set({ status: 'withdrawn' }).where(eq(consents.id, consent.id)),
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    await expect(
      database.forStore(storeA, (tx) => tx.delete(consents).where(eq(consents.id, consent.id))),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    expect(await service.current(storeA, [id], 'whatsapp')).toEqual([
      expect.objectContaining({ status: 'granted' }),
    ]);
  });

  it('refuses a contact from another store and hides its consent', async () => {
    const foreign = await contact(storeB);
    await service.record(storeB, granted(foreign), staff);

    await expect(service.record(storeA, withdrawn(foreign), staff)).rejects.toMatchObject({
      code: 'CONTACT_NOT_FOUND',
      status: 404,
    });
    await expect(service.record(storeA, granted(randomUUID()), staff)).rejects.toMatchObject({
      code: 'CONTACT_NOT_FOUND',
    });
    expect(await service.current(storeA, [foreign], 'whatsapp')).toEqual([]);
    expect(await service.current(storeB, [foreign], 'whatsapp')).toEqual([
      expect.objectContaining({ status: 'granted' }),
    ]);
  });

  it('saves a staff answer as a manual consent with the note as evidence', async () => {
    const id = await contact(storeA);
    const note = 'দোকানে এসে মৌখিকভাবে রাজি হয়েছেন';
    const consent = await service.recordStaffAnswer(
      storeA,
      id,
      { channel: 'sms', status: 'granted', note },
      staff,
    );

    expect(consent).toMatchObject({ contactId: id, channel: 'sms', source: 'manual' });
    const rows = await admin.pool.query('select source, evidence from consents where id=$1', [
      consent.id,
    ]);
    expect(rows.rows).toEqual([{ source: 'manual', evidence: note }]);
  });

  it('reads current consent for at most 100 contacts at a time', async () => {
    const id = await contact(storeA);
    await service.record(storeA, granted(id), staff);
    const hundred = [id, ...Array.from({ length: 99 }, () => randomUUID())];

    expect(await service.current(storeA, hundred, 'whatsapp')).toHaveLength(1);
    expect(() => service.current(storeA, [...hundred, randomUUID()], 'whatsapp')).toThrow(
      expect.objectContaining({ code: 'CONSENT_CONTACTS_TOO_MANY', status: 400 }),
    );
  });
});
