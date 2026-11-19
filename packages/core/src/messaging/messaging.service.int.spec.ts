import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { smsSenderIds } from '@dakly/db/schema/channels';
import { contacts as contactsTable } from '@dakly/db/schema/contacts';
import { stores } from '@dakly/db/schema/stores';
import { MailpitSmsDriver } from '@dakly/providers/sms/mailpit/mailpit-sms-driver';

import { ContactsService } from '../contacts/contacts.service';
import { DatabaseModule } from '../platform/database/database.module';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { SmsSendersService } from '../sms-senders/sms-senders.service';
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
  vi.spyOn(MailpitSmsDriver.prototype, 'send').mockImplementation(async function (message, signal) {
    calls.push({ to: message.to, isTransactionOpen: transaction.isOpen() });
    const result = await send.call(this, message, signal);
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

async function capturedSenderName(providerMessageId: string) {
  const response = await fetch(`${mailpitApi}/api/v1/message/${providerMessageId}`, {
    signal: AbortSignal.timeout(5000),
  });
  return ((await response.json()) as { From: { Name: string } }).From.Name;
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
  if (sentIds.length) {
    // A repeated send returns the same id; Mailpit 1.27 hangs on a delete that lists an id twice.
    const response = await fetch(`${mailpitApi}/api/v1/messages`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ IDs: [...new Set(sentIds)] }),
      signal: AbortSignal.timeout(5000),
    });
    expect(response.ok).toBe(true);
  }
  await admin.db.execute(sql`delete from outbox_events where store_id in (${storeA}, ${storeB})`);
  await admin.db.execute(sql`delete from contacts where store_id in (${storeA}, ${storeB})`);
  await admin.db.execute(sql`delete from sms_sender_ids where store_id in (${storeA}, ${storeB})`);
  await admin.db.execute(sql`delete from stores where id in (${storeA}, ${storeB})`);
  await Promise.all([admin.pool.end(), app.close()]);
});

describe('MessagingService (Postgres and Mailpit)', () => {
  it('sends Bangla text to the contact phone and counts Unicode parts', async () => {
    const contact = await contacts.create(
      storeA,
      { name: 'নুসরাত জাহান', phone: '01712345601' },
      fullPhone,
      { kind: 'system' },
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
      { kind: 'system' },
    );
    watchDriver();

    const sent = await send(storeA, contact.id, 'a'.repeat(161));

    expect(sent).toMatchObject({ parts: 2, credits: 2 });
  });

  it('reads the final phone after an unprepared sender lookup finishes', async () => {
    const contact = await contacts.create(
      storeA,
      { name: 'Sumi Akter', phone: '01712345618' },
      fullPhone,
      { kind: 'system' },
    );
    const calls = watchDriver();
    const original = SmsSendersService.prototype.approvedSenderName;
    vi.spyOn(SmsSendersService.prototype, 'approvedSenderName').mockImplementationOnce(
      async function (store) {
        const sender = await original.call(this, store);
        await contacts.editDetails(
          storeA,
          contact.id,
          { phone: '01712345619' },
          { access: fullPhone, actor: { kind: 'system' } },
        );
        return sender;
      },
    );
    expect(
      await errorCode(
        messaging.send(storeA, {
          channel: 'sms',
          contactId: contact.id,
          body: 'Your order has shipped',
          operationKey: `test-${contact.id}`,
          destination: contact.phone,
        }),
      ),
    ).toBe('MESSAGING_DESTINATION_CHANGED');
    expect(calls).toEqual([]);
  });

  it('refuses before the provider a destination the contact no longer has', async () => {
    const contact = await contacts.create(
      storeA,
      { name: 'Sumi Akter', phone: '01712345609' },
      fullPhone,
      { kind: 'system' },
    );
    const calls = watchDriver();
    const changed = messaging.send(storeA, {
      channel: 'sms',
      contactId: contact.id,
      body: 'Your order has shipped',
      operationKey: `test-${contact.id}`,
      destination: '01712345610',
    });

    expect(await errorCode(changed)).toBe('MESSAGING_DESTINATION_CHANGED');
    expect(calls).toEqual([]);
  });

  it('refuses a phone the contact did not have when the send was decided', async () => {
    const contact = await contacts.create(
      storeA,
      { name: 'Rina Begum', phone: '01712345611' },
      fullPhone,
      { kind: 'system' },
    );
    const calls = watchDriver();
    const changed = messaging.send(storeA, {
      channel: 'sms',
      contactId: contact.id,
      body: 'Your order has shipped',
      operationKey: `test-${contact.id}`,
      destination: null,
    });

    expect(await errorCode(changed)).toBe('MESSAGING_DESTINATION_CHANGED');
    expect(calls).toEqual([]);
  });

  it('sends one SMS for the same operation key twice', async () => {
    const contact = await contacts.create(
      storeA,
      { name: 'Farhana Islam', phone: '01712345606' },
      fullPhone,
      { kind: 'system' },
    );
    watchDriver();

    const first = await send(storeA, contact.id, 'Your order has shipped');
    const second = await send(storeA, contact.id, 'Your order has shipped');

    expect(second).toEqual(first);
    expect(await capturedIdsTo('01712345606')).toEqual([first.providerMessageId]);
  });

  it('submits a prepared SMS without reading the phone again and binds it to the shop and contact', async () => {
    const contact = await contacts.create(
      storeA,
      { name: 'Nasima Akter', phone: '01812345619' },
      fullPhone,
      { kind: 'system' },
    );
    const calls = watchDriver();
    const phone = vi.spyOn(contacts, 'getPhoneForSend');
    const prepared = await messaging.prepareSms(storeA, contact.id);
    const message = {
      channel: 'sms',
      contactId: contact.id,
      body: 'Your order has shipped',
      operationKey: `prepared-${contact.id}`,
    } as const;

    expect(await errorCode(messaging.send(storeB, message, prepared))).toBe(
      'MESSAGING_PREPARATION_FAILED',
    );
    expect(
      await errorCode(messaging.send(storeA, { ...message, contactId: randomUUID() }, prepared)),
    ).toBe('MESSAGING_PREPARATION_FAILED');
    expect(calls).toEqual([]);

    await messaging.send(storeA, message, prepared);
    expect(phone).toHaveBeenCalledExactlyOnceWith(storeA, contact.id);
    expect(calls.map((call) => call.to)).toEqual(['01812345619']);
  });

  it('sends from the shared sender until the store’s sender name is approved', async () => {
    const contact = await contacts.create(
      storeB,
      { name: 'Nusrat Jahan', phone: '01712345607' },
      fullPhone,
      { kind: 'system' },
    );
    watchDriver();
    const senders = app.get(SmsSendersService);
    const [requested] = await admin.db
      .insert(smsSenderIds)
      .values({ storeId: storeB, senderName: 'Nusrat Fab' })
      .returning({ id: smsSenderIds.id });

    const shared = await send(storeB, contact.id, 'Your order has shipped');
    await senders.decideRequest(
      storeB,
      requested!.id,
      { status: 'approved', reason: 'Operator approved the masking name' },
      { kind: 'system' },
    );
    const prepared = await messaging.prepareSender(storeB);
    const own = await messaging.send(
      storeB,
      {
        channel: 'sms',
        contactId: contact.id,
        body: 'Your order is out for delivery',
        operationKey: `approved-${contact.id}`,
      },
      prepared,
    );
    const otherContact = await contacts.create(
      storeA,
      { name: 'Karim Hossain', phone: '01912345609' },
      fullPhone,
      { kind: 'system' },
    );
    const [otherRequest] = await admin.db
      .insert(smsSenderIds)
      .values({ storeId: storeA, senderName: 'Karim Mart' })
      .returning({ id: smsSenderIds.id });
    await senders.decideRequest(
      storeA,
      otherRequest!.id,
      { status: 'approved', reason: 'Operator approved the masking name' },
      { kind: 'system' },
    );
    const other = await messaging.send(
      storeA,
      {
        channel: 'sms',
        contactId: otherContact.id,
        body: 'Your order is out for delivery',
        operationKey: `other-store-${otherContact.id}`,
      },
      prepared,
    );

    expect(await capturedSenderName(shared.providerMessageId)).toBe('');
    expect(await capturedSenderName(own.providerMessageId)).toBe('Nusrat Fab');
    expect(await capturedSenderName(other.providerMessageId)).toBe('Karim Mart');
  });

  it('calls the driver with no store transaction open', async () => {
    const contact = await contacts.create(
      storeA,
      { name: 'Karim Hossain', phone: '01912345603' },
      fullPhone,
      { kind: 'system' },
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
      { kind: 'system' },
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
    // An approved number is checked first: the phone it was approved for is gone.
    expect(
      await errorCode(
        messaging.send(storeA, {
          channel: 'sms',
          contactId: contact!.id,
          body: 'Hello',
          operationKey: `test-no-phone-${contact!.id}`,
          destination: '01712345610',
        }),
      ),
    ).toBe('MESSAGING_DESTINATION_CHANGED');
    expect(calls).toEqual([]);
  });

  it('refuses a phone that is no longer the approved number, and sends to the approved one', async () => {
    const contact = await contacts.create(
      storeA,
      { name: 'সাবিনা ইয়াসমিন', phone: '01712345621' },
      fullPhone,
      { kind: 'system' },
    );
    const calls = watchDriver();
    const approved = (destination: string | null) =>
      messaging.send(storeA, {
        channel: 'sms',
        contactId: contact.id,
        body: 'নতুন কালেকশন এসেছে',
        operationKey: `test-destination-${contact.id}`,
        destination,
      });

    expect(await errorCode(approved('01712345600'))).toBe('MESSAGING_DESTINATION_CHANGED');
    expect(await errorCode(approved(null))).toBe('MESSAGING_DESTINATION_CHANGED');
    expect(calls).toEqual([]);
    const sent = await approved('01712345621');
    expect(calls.map((call) => call.to)).toEqual(['01712345621']);
    expect(await capturedText(sent.providerMessageId)).toBe('নতুন কালেকশন এসেছে');
  });

  it('never sends to another store’s contact', async () => {
    const contact = await contacts.create(
      storeB,
      { name: 'Jamal Mia', phone: '01312345605' },
      fullPhone,
      { kind: 'system' },
    );
    const calls = watchDriver();

    expect(await errorCode(send(storeA, contact.id, 'Hello'))).toBe('CONTACT_NOT_FOUND');
    expect(calls).toEqual([]);
  });
});
