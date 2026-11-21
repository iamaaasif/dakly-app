import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';

import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import type { SmsMessage } from '@dakly/providers/sms/sms-driver';

import { DatabaseModule } from '../platform/database/database.module';
import { SmsService } from '../sms/sms.service';
import { SmsSendersModule } from './sms-senders.module';
import { SmsSendersService } from './sms-senders.service';

class TestModule {}
Module({ imports: [DatabaseModule, SmsSendersModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const staff = { kind: 'staff', staffUserId: randomUUID() } as const;
const storeIds: string[] = [];
let app: INestApplicationContext;
let senders: SmsSendersService;
let sent: SmsMessage[];
let owner: string;
let unverified: string;

async function store() {
  const id = randomUUID();
  storeIds.push(id);
  await admin.pool.query('insert into stores(id,name) values($1,$2)', [id, 'নুসরাতের দোকান']);
  return id;
}

async function user(isPhoneVerified: boolean) {
  const id = randomUUID();
  await admin.pool.query(
    `insert into users(id,name,phone,phone_verified_at) values($1,'নুসরাত জাহান',$2,${isPhoneVerified ? 'now()' : 'null'})`,
    [id, `017${randomInt(10000000, 99999999)}`],
  );
  return id;
}

async function errorCode(work: Promise<unknown>) {
  return work.then(
    () => undefined,
    (error: { code?: string }) => error.code,
  );
}

async function documents(storeId: string) {
  const ids = [randomUUID(), randomUUID()];
  for (const id of ids)
    await admin.pool.query(
      `insert into files(id,store_id,purpose,object_key,content_type,size_bytes,status)
       values($1,$2,'sms_sender_document',$3,'application/pdf',1000,'ready')`,
      [id, storeId, `stores/${storeId}/sms_sender_document/${id}`],
    );
  return { tradeLicenceFileId: ids[0]!, nidFileId: ids[1]! };
}

async function request(storeId: string, senderName = 'Nusrat Fab') {
  return senders.request(
    storeId,
    { senderName, ...(await documents(storeId)) },
    { kind: 'user', userId: owner },
  );
}

function decide(storeId: string, id: string, status: 'approved' | 'rejected', reason: string) {
  return senders.decideRequest(storeId, id, { status, reason }, staff);
}

beforeAll(async () => {
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  senders = app.get(SmsSendersService);
  owner = await user(true);
  unverified = await user(false);
});

beforeEach(() => {
  sent = [];
  vi.spyOn(app.get(SmsService), 'send').mockImplementation(async (message) => {
    sent.push(message);
    return { providerMessageId: `test-${sent.length}` };
  });
});

afterAll(async () => {
  await admin.pool.query('delete from sms_sender_ids where store_id=any($1::uuid[])', [storeIds]);
  await admin.pool.query('delete from files where store_id=any($1::uuid[])', [storeIds]);
  await admin.pool.query('delete from stores where id=any($1::uuid[])', [storeIds]);
  await admin.pool.query('delete from users where id=any($1::uuid[])', [[owner, unverified]]);
  await Promise.all([admin.pool.end(), app.close()]);
  vi.restoreAllMocks();
});

describe('SmsSendersService (Postgres)', () => {
  it('records a request as requested and lists it for the store', async () => {
    const storeId = await store();

    const requested = await request(storeId);

    expect(requested).toMatchObject({
      senderName: 'Nusrat Fab',
      status: 'requested',
      rejectionReason: null,
      decidedAt: null,
    });
    expect((await senders.list(storeId, { limit: 50 })).items).toEqual([requested]);
  });

  it('refuses a second request while one is pending or approved', async () => {
    const storeId = await store();
    const first = await request(storeId);

    expect(await errorCode(request(storeId, 'Nusrat BD'))).toBe('SMS_SENDER_ID_ALREADY_ACTIVE');
    await decide(storeId, first.id, 'approved', 'Operator approved the masking name');
    expect(await errorCode(request(storeId, 'Nusrat BD'))).toBe('SMS_SENDER_ID_ALREADY_ACTIVE');
    expect((await senders.list(storeId, { limit: 50 })).items).toHaveLength(1);
  });

  it('shows the rejection reason and then accepts a new request', async () => {
    const storeId = await store();
    const first = await request(storeId);

    const rejected = await decide(storeId, first.id, 'rejected', 'Trade licence name differs');
    const second = await request(storeId, 'Nusrat BD');

    expect(rejected).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Trade licence name differs',
      decidedAt: expect.any(String),
    });
    expect((await senders.list(storeId, { limit: 50 })).items.map((item) => item.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it('refuses documents that belong to another store', async () => {
    const storeId = await store();
    const other = await documents(await store());

    expect(
      await errorCode(
        senders.request(
          storeId,
          { senderName: 'Nusrat Fab', ...other },
          { kind: 'user', userId: owner },
        ),
      ),
    ).toBe('SMS_SENDER_DOCUMENT_INVALID');
  });

  it('lets the purge job delete the documents once the request is decided', async () => {
    const storeId = await store();
    const { id } = await request(storeId);
    const attached = () =>
      admin.pool.query(
        'select trade_licence_file_id, nid_file_id from sms_sender_ids where id=$1',
        [id],
      );
    expect((await attached()).rows[0]).toEqual({
      trade_licence_file_id: expect.any(String),
      nid_file_id: expect.any(String),
    });

    await decide(storeId, id, 'approved', 'Operator approved the masking name');

    expect((await attached()).rows[0]).toEqual({ trade_licence_file_id: null, nid_file_id: null });
    const expiring = await admin.pool.query(
      'select count(*)::int as count from files where store_id=$1 and expires_at is not null',
      [storeId],
    );
    expect(expiring.rows[0].count).toBe(2);
  });

  it('decides a request once', async () => {
    const storeId = await store();
    const { id } = await request(storeId);
    await decide(storeId, id, 'approved', 'Operator approved the masking name');

    expect(await errorCode(decide(storeId, id, 'rejected', 'Changed my mind on this'))).toBe(
      'SMS_SENDER_ID_ALREADY_DECIDED',
    );
    expect((await senders.list(storeId, { limit: 50 })).items[0]).toMatchObject({
      status: 'approved',
      rejectionReason: null,
    });
  });

  it('uses the shared sender until the request is approved', async () => {
    const storeId = await store();
    const { id } = await request(storeId);
    expect(await senders.approvedSenderName(storeId)).toBeUndefined();

    await decide(storeId, id, 'approved', 'Operator approved the masking name');

    expect(await senders.approvedSenderName(storeId)).toBe('Nusrat Fab');
  });

  it('sends a test SMS from an approved sender to the member’s own verified phone', async () => {
    const storeId = await store();
    const { id } = await request(storeId);
    expect(await errorCode(senders.sendTest(storeId, id, owner))).toBe(
      'SMS_SENDER_ID_NOT_APPROVED',
    );
    await decide(storeId, id, 'approved', 'Operator approved the masking name');

    await senders.sendTest(storeId, id, owner);
    const ownPhone = (await admin.pool.query('select phone from users where id=$1', [owner]))
      .rows[0].phone;

    expect(sent).toEqual([
      { to: ownPhone, text: 'This is a test SMS from Nusrat Fab on Dakly.', sender: 'Nusrat Fab' },
    ]);
    expect(await errorCode(senders.sendTest(storeId, id, unverified))).toBe(
      'SMS_SENDER_TEST_PHONE_REQUIRED',
    );
    expect(sent).toHaveLength(1);
  });

  it('never reads, decides or tests another store’s request', async () => {
    const storeA = await store();
    const storeB = await store();
    const { id } = await request(storeA);

    expect((await senders.list(storeB, { limit: 50 })).items).toEqual([]);
    expect(await errorCode(decide(storeB, id, 'approved', 'Operator approved the name'))).toBe(
      'SMS_SENDER_ID_NOT_FOUND',
    );
    expect(await errorCode(senders.sendTest(storeB, id, owner))).toBe('SMS_SENDER_ID_NOT_FOUND');
    expect((await senders.list(storeA, { limit: 50 })).items[0]?.status).toBe('requested');
    expect(sent).toEqual([]);
  });

  it('lists undecided requests from every store for staff, oldest first', async () => {
    const storeA = await store();
    const storeB = await store();
    const pending = await request(storeA);
    const decided = await request(storeB);
    await decide(storeB, decided.id, 'rejected', 'Trade licence name differs');

    const { items } = await senders.listOpen({ limit: 100 });
    const ids = items.map((item) => item.id);

    expect(items.find((item) => item.id === pending.id)).toMatchObject({
      storeId: storeA,
      storeName: 'নুসরাতের দোকান',
      senderName: 'Nusrat Fab',
      status: 'requested',
    });
    expect(ids).not.toContain(decided.id);
    expect(ids).toEqual([...ids].sort());
  });
});
