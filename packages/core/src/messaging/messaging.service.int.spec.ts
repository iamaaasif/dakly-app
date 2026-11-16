import 'reflect-metadata';
import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { contacts as contactsTable } from '@dakly/db/schema/contacts';
import { stores } from '@dakly/db/schema/stores';
import { MailpitSmsDriver } from '@dakly/providers/sms/mailpit/mailpit-sms-driver';

import { ContactsService } from '../contacts/contacts.service';
import { DatabaseModule } from '../platform/database/database.module';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { MessagingModule } from './messaging.module';
import { MessagingService } from './messaging.service';

class TestModule {}
Module({ imports: [DatabaseModule, MessagingModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
let app: INestApplicationContext;
let transaction: StoreTransaction;
let contacts: ContactsService;
let messaging: MessagingService;
const mailpitApi = process.env.MAILPIT_API_URL ?? 'http://127.0.0.1:8025';
const fullPhone = { seeFullPhone: true };
const sentIds: string[] = [];
let storeA: string;
let storeB: string;

// Records what the driver saw, then sends through Mailpit for real.
function watchDriver() {
  const calls: { to: string; isTransactionOpen: boolean }[] = [];
  const send = MailpitSmsDriver.prototype.send;
  vi.spyOn(MailpitSmsDriver.prototype, 'send').mockImplementation(async function (message) {
    calls.push({ to: message.to, isTransactionOpen: transaction.isOpen() });
    const result = await send.call(this, message);
    sentIds.push(result.providerMessageId);
    return result;
  });
  return calls;
}

async function capturedText(providerMessageId: string) {
  const response = await fetch(`${mailpitApi}/api/v1/message/${providerMessageId}`, {
    signal: AbortSignal.timeout(5000),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { Text: string }).Text.trimEnd();
}

async function capturedIdsTo(phone: string) {
  const query = new URLSearchParams({ query: `to:"${phone}@sms.test"` });
  const response = await fetch(`${mailpitApi}/api/v1/search?${query}`, {
    signal: AbortSignal.timeout(5000),
  });
  return ((await response.json()) as { messages: { ID: string }[] }).messages.map(
    (message) => message.ID,
  );
}

async function errorCode(work: Promise<unknown>) {
  const error = await work.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppError);
  return (error as AppError).code;
}

function send(storeId: string, contactId: string, body: string) {
  return messaging.send(storeId, {
    channel: 'sms',
    contactId,
    body,
    operationKey: `test-${contactId}`,
  });
}

beforeAll(async () => {
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  transaction = app.get(StoreTransaction);
  contacts = app.get(ContactsService);
  messaging = app.get(MessagingService);
  const created = await admin.db
    .insert(stores)
    .values([{ name: 'নুসরাতের দোকান' }, { name: 'রহিম স্টোর' }])
    .returning({ id: stores.id });
  storeA = created[0]!.id;
  storeB = created[1]!.id;
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  if (sentIds.length)
    await fetch(`${mailpitApi}/api/v1/messages`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ IDs: sentIds }),
      signal: AbortSignal.timeout(5000),
    });
  await admin.db.execute(sql`delete from contacts where store_id in (${storeA}, ${storeB})`);
  await admin.db.execute(sql`delete from stores where id in (${storeA}, ${storeB})`);
  await Promise.all([admin.pool.end(), app.close()]);
});

describe('MessagingService (Postgres and Mailpit)', () => {
  it('sends Bangla text to the contact phone and counts Unicode parts', async () => {
    const contact = await contacts.create(
      storeA,
      { name: 'নুসরাত জাহান', phone: '01712345601' },
      fullPhone,
    );
    const calls = watchDriver();
    const body = 'ঈদের অফার! সব পাঞ্জাবিতে ২০% ছাড়, কোড EID20। আজই অর্ডার করুন, স্টক সীমিত।';

    const sent = await send(storeA, contact.id, body);

    expect(body.length).toBeGreaterThan(70);
    expect(sent).toMatchObject({ parts: 2, credits: 2 });
    expect(calls.map((call) => call.to)).toEqual(['01712345601']);
    expect(await capturedText(sent.providerMessageId)).toBe(body);
  });

  it('counts a 161-character English text as two parts', async () => {
    const contact = await contacts.create(
      storeA,
      { name: 'Rahim Uddin', phone: '01812345602' },
      fullPhone,
    );
    watchDriver();

    const sent = await send(storeA, contact.id, 'a'.repeat(161));

    expect(sent).toMatchObject({ parts: 2, credits: 2 });
  });

  it('sends one SMS for the same operation key twice', async () => {
    const contact = await contacts.create(
      storeA,
      { name: 'Farhana Islam', phone: '01712345606' },
      fullPhone,
    );
    watchDriver();

    const first = await send(storeA, contact.id, 'Your order has shipped');
    const second = await send(storeA, contact.id, 'Your order has shipped');

    expect(second).toEqual(first);
    expect(await capturedIdsTo('01712345606')).toEqual([first.providerMessageId]);
  });

  it('calls the driver with no store transaction open', async () => {
    const contact = await contacts.create(
      storeA,
      { name: 'Karim Hossain', phone: '01912345603' },
      fullPhone,
    );
    const calls = watchDriver();

    await send(storeA, contact.id, 'Your order has shipped');

    expect(calls).toEqual([{ to: '01912345603', isTransactionOpen: false }]);
  });

  it('refuses a send from inside a store transaction without calling the driver', async () => {
    const contact = await contacts.create(
      storeA,
      { name: 'Sumaiya Akter', phone: '01512345604' },
      fullPhone,
    );
    const calls = watchDriver();

    const code = await errorCode(
      transaction.run(storeA, () => send(storeA, contact.id, 'Your order has shipped')),
    );

    expect(code).toBe('MESSAGING_INSIDE_TRANSACTION');
    expect(calls).toEqual([]);
  });

  it('refuses a contact with no phone', async () => {
    // Contacts from a Messenger chat can have no phone; staff adds always have one.
    const [contact] = await admin.db
      .insert(contactsTable)
      .values({ storeId: storeA, name: 'Tania Rahman', source: 'messenger', kind: 'customer' })
      .returning({ id: contactsTable.id });
    const calls = watchDriver();

    expect(await errorCode(send(storeA, contact!.id, 'Hello'))).toBe(
      'MESSAGING_CONTACT_HAS_NO_PHONE',
    );
    expect(calls).toEqual([]);
  });

  it('never sends to another store’s contact', async () => {
    const contact = await contacts.create(
      storeB,
      { name: 'Jamal Mia', phone: '01312345605' },
      fullPhone,
    );
    const calls = watchDriver();

    expect(await errorCode(send(storeA, contact.id, 'Hello'))).toBe('CONTACT_NOT_FOUND');
    expect(calls).toEqual([]);
  });
});
