import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { ContactsModule } from '../contacts/contacts.module';
import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { AppError } from '../platform/errors/app-error';
import { DAY_MS } from '../platform/time';
import { SmsService } from '../sms/sms.service';
import { BakiNoticesService } from './baki-notices.service';
import { DueBookModule } from './due-book.module';
import { DueBookService } from './due-book.service';
import { DueMessageDeliveryService } from './due-message-delivery.service';
import { DueRemindersService } from './due-reminders.service';

class TestModule {}
Module({ imports: [DatabaseModule, ContactsModule, DueBookModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeA = randomUUID();
const storeB = randomUUID();
const userId = randomUUID();
const byUser = { actor: { kind: 'user', userId } } as const;
// 12:00 in Dhaka.
const NOON = new Date('2026-11-21T06:00:00.000Z');
// 22:00 in Dhaka.
const NIGHT = new Date('2026-11-21T16:00:00.000Z');
let now = NOON;
let app: INestApplicationContext;
let dueBook: DueBookService;
let notices: BakiNoticesService;
let reminders: DueRemindersService;
let delivery: DueMessageDeliveryService;
const sent: { to: string; text: string; idempotencyKey?: string }[] = [];
let refuseSms = false;

async function contact(phone: string | null = '01711000101', storeId = storeA) {
  const id = randomUUID();
  await admin.pool.query(
    "insert into contacts(id,store_id,name,phone,source,kind) values($1,$2,'রিনা',$3,'manual','customer')",
    [id, storeId, phone],
  );
  return id;
}

const daysAgo = (days: number) => new Date(NOON.getTime() - days * DAY_MS).toISOString();

async function baki(contactId: string, amountPoisha: number, days = 0) {
  return dueBook.recordBaki(
    storeA,
    contactId,
    { amountPoisha, occurredAt: days ? daysAgo(days) : undefined },
    byUser,
  );
}

async function setCredits(credits: number) {
  await admin.pool.query('delete from wallet_ledger where store_id=$1', [storeA]);
  if (!credits) return;
  await admin.pool.query(
    "insert into wallet_ledger(id,store_id,wallet,revision,kind,quantity_delta,balance_quantity_after,idempotency_key,actor_type) values(gen_random_uuid(),$1,'sms_credits',1,'top_up',$2,$2,$3,'system')",
    [storeA, credits, randomUUID()],
  );
}

async function balance() {
  const result = await admin.pool.query(
    "select balance_quantity_after::int as balance from wallet_ledger where store_id=$1 and wallet='sms_credits' order by revision desc limit 1",
    [storeA],
  );
  return result.rows[0].balance as number;
}

async function messages(contactId: string) {
  const result = await admin.pool.query(
    'select kind,status,skip_reason,credits from due_messages where contact_id=$1 order by created_at',
    [contactId],
  );
  return result.rows as {
    kind: string;
    status: string;
    skip_reason: string | null;
    credits: number | null;
  }[];
}

async function failure(work: Promise<unknown>) {
  return work.then(
    () => undefined,
    (error: { code: string }) => error.code,
  );
}

describe('Due book notices and reminders (Postgres)', () => {
  beforeAll(async () => {
    await admin.pool.query(
      "insert into stores(id,name,time_zone) values($1,'রিনার দোকান','Asia/Dhaka'),($2,'করিমের দোকান','Asia/Dhaka')",
      [storeA, storeB],
    );
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'নুসরাত',$1::text || '@example.test')",
      [userId],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    dueBook = app.get(DueBookService);
    notices = app.get(BakiNoticesService);
    reminders = app.get(DueRemindersService);
    delivery = app.get(DueMessageDeliveryService);
    vi.spyOn(app.get(Clock), 'now').mockImplementation(() => now);
    vi.spyOn(SmsService.prototype, 'send').mockImplementation(async (message) => {
      if (refuseSms)
        throw new AppError('SMS_SEND_REFUSED', { status: 502, message: 'SMS refused' });
      sent.push(message);
      return { providerMessageId: `sms-${sent.length}` };
    });
  });

  beforeEach(async () => {
    now = NOON;
    sent.length = 0;
    refuseSms = false;
    await setCredits(100);
    await admin.pool.query("update stores set settings='{}' where id=$1", [storeA]);
  });

  afterEach(async () => {
    for (const table of ['due_messages', 'due_entries', 'outbox_events', 'contacts'])
      await admin.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [storeA, storeB],
      ]);
  });

  afterAll(async () => {
    try {
      await app?.close();
      await admin.pool.query('delete from wallet_ledger where store_id=any($1::uuid[])', [
        [storeA, storeB],
      ]);
      await admin.pool.query('delete from stores where id=any($1::uuid[])', [[storeA, storeB]]);
      await admin.pool.query('delete from users where id=$1', [userId]);
    } finally {
      await admin.pool.end();
    }
  });

  describe('baki notice', () => {
    it('tells the customer what was added and the total, and charges the credits', async () => {
      const id = await contact();
      await baki(id, 80000);
      const { entry } = await baki(id, 95000);
      await notices.sendForEntry(storeA, entry.id);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        to: '01711000101',
        text: 'রিনার দোকান: ৳950 বাকি যোগ হয়েছে। মোট বাকি ৳1,750। ধন্যবাদ।',
      });
      expect(await messages(id)).toEqual([
        { kind: 'baki_notice', status: 'sent', skip_reason: null, credits: 1 },
      ]);
      expect(await balance()).toBe(99);
    });

    it('sends once when the event is relayed twice', async () => {
      const id = await contact();
      const { entry } = await baki(id, 95000);
      await notices.sendForEntry(storeA, entry.id);
      await notices.sendForEntry(storeA, entry.id);
      expect(sent).toHaveLength(1);
      expect(await balance()).toBe(99);
    });

    it('stays quiet when the shop turned the notice off', async () => {
      await admin.pool.query(
        `update stores set settings='{"dueBook":{"bakiNoticeEnabled":false}}' where id=$1`,
        [storeA],
      );
      const id = await contact();
      const { entry } = await baki(id, 95000);
      await notices.sendForEntry(storeA, entry.id);
      expect(sent).toEqual([]);
      expect(await messages(id)).toEqual([]);
    });

    it('stays quiet for a khata import and for baki copied from an older page', async () => {
      const id = await contact();
      const imported = await dueBook.recordBaki(
        storeA,
        id,
        { amountPoisha: 5000 },
        {
          ...byUser,
          source: 'khata_import',
        },
      );
      const old = await baki(id, 7000, 40);
      await notices.sendForEntry(storeA, imported.entry.id);
      await notices.sendForEntry(storeA, old.entry.id);
      expect(sent).toEqual([]);
    });

    it('skips a customer with no phone, and a blocked one, without charging', async () => {
      const noPhone = await contact(null);
      const blocked = await contact('01711000102');
      await admin.pool.query('update contacts set is_blocked=true where id=$1', [blocked]);
      for (const id of [noPhone, blocked]) {
        const { entry } = await baki(id, 95000);
        await notices.sendForEntry(storeA, entry.id);
      }
      expect(sent).toEqual([]);
      expect(await balance()).toBe(100);
      expect((await messages(noPhone))[0]).toMatchObject({
        status: 'skipped',
        skip_reason: 'no_address',
      });
      expect((await messages(blocked))[0]).toMatchObject({
        status: 'skipped',
        skip_reason: 'blocked',
      });
    });

    it('records no_credits and sends nothing when the SMS balance is empty', async () => {
      await setCredits(0);
      const id = await contact();
      const { entry } = await baki(id, 95000);
      await notices.sendForEntry(storeA, entry.id);
      expect(sent).toEqual([]);
      expect((await messages(id))[0]).toMatchObject({
        status: 'skipped',
        skip_reason: 'no_credits',
      });
    });

    it('returns the credits when the provider refuses the message', async () => {
      refuseSms = true;
      const id = await contact();
      const { entry } = await baki(id, 95000);
      await notices.sendForEntry(storeA, entry.id);
      expect((await messages(id))[0]).toMatchObject({ status: 'failed' });
      expect(await balance()).toBe(100);
    });

    it('sends again under the same key when a job stopped after claiming the credits', async () => {
      const id = await contact();
      const { entry } = await baki(id, 95000);
      refuseSms = false;
      vi.spyOn(SmsService.prototype, 'send').mockRejectedValueOnce(new Error('connection reset'));
      await expect(notices.sendForEntry(storeA, entry.id)).rejects.toThrow('connection reset');
      expect((await messages(id))[0]).toMatchObject({ status: 'sending' });
      await notices.sendForEntry(storeA, entry.id);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.idempotencyKey).toMatch(/^due-message-/);
      expect((await messages(id))[0]).toMatchObject({ status: 'sent' });
      expect(await balance()).toBe(99);
    });
  });

  describe('reminder', () => {
    async function remind(id: string) {
      const { messageId } = await reminders.remind(storeA, id, userId);
      await delivery.deliver(storeA, messageId);
      return messageId;
    }

    it('sends the polite Bangla reminder with the amount owed', async () => {
      const id = await contact();
      await baki(id, 175000, 40);
      await remind(id);
      expect(sent.map((message) => message.text)).toEqual([
        'রিনার দোকান: প্রিয় গ্রাহক, আপনার ৳1,750 বাকি আছে। সুবিধামতো পরিশোধ করলে কৃতজ্ঞ থাকব। ধন্যবাদ।',
      ]);
      expect((await messages(id))[0]).toMatchObject({
        kind: 'reminder',
        status: 'sent',
        credits: 2,
      });
      expect(await balance()).toBe(98);
    });

    it('allows one reminder in 7 days and the next after that', async () => {
      const id = await contact();
      await baki(id, 175000, 40);
      await remind(id);
      expect(await failure(reminders.remind(storeA, id, userId))).toBe('DUE_REMINDER_TOO_SOON');
      now = new Date(NOON.getTime() + 7 * DAY_MS + 1000);
      await remind(id);
      expect(sent).toHaveLength(2);
    });

    it('makes one reminder when two taps arrive together', async () => {
      const id = await contact();
      await baki(id, 175000, 40);
      const outcomes = await Promise.all([
        failure(reminders.remind(storeA, id, userId)),
        failure(reminders.remind(storeA, id, userId)),
      ]);
      expect(outcomes.filter(Boolean)).toEqual(['DUE_REMINDER_TOO_SOON']);
      expect(await messages(id)).toHaveLength(1);
    });

    it('refuses outside 9 am to 8 pm in the shop time zone', async () => {
      const id = await contact();
      await baki(id, 175000, 40);
      now = NIGHT;
      expect(await failure(reminders.remind(storeA, id, userId))).toBe(
        'DUE_REMINDER_OUTSIDE_HOURS',
      );
      expect(await failure(reminders.remindOverdue(storeA, userId))).toBe(
        'DUE_REMINDER_OUTSIDE_HOURS',
      );
      expect(await messages(id)).toEqual([]);
    });

    it('refuses a customer who owes nothing, has no phone, or is blocked', async () => {
      const paid = await contact();
      await baki(paid, 1000);
      await dueBook.collectPayment(storeA, paid, { amountPoisha: 1000, method: 'cash' }, byUser);
      const noPhone = await contact(null);
      await baki(noPhone, 1000, 40);
      const blocked = await contact('01711000102');
      await baki(blocked, 1000, 40);
      await admin.pool.query('update contacts set is_blocked=true where id=$1', [blocked]);
      expect(await failure(reminders.remind(storeA, paid, userId))).toBe('DUE_NOT_OWING');
      expect(await failure(reminders.remind(storeA, noPhone, userId))).toBe(
        'DUE_REMINDER_NO_PHONE',
      );
      expect(await failure(reminders.remind(storeA, blocked, userId))).toBe('DUE_REMINDER_BLOCKED');
    });

    it('does not reach a customer of another shop', async () => {
      const other = await contact('01711000103', storeB);
      expect(await failure(reminders.remind(storeA, other, userId))).toBe('CONTACT_NOT_FOUND');
    });

    it('skips the reminder at delivery when the customer paid in the meantime', async () => {
      const id = await contact();
      await baki(id, 175000, 40);
      const { messageId } = await reminders.remind(storeA, id, userId);
      await dueBook.collectPayment(storeA, id, { amountPoisha: 175000, method: 'cash' }, byUser);
      await delivery.deliver(storeA, messageId);
      expect(sent).toEqual([]);
      expect((await messages(id))[0]).toMatchObject({
        status: 'skipped',
        skip_reason: 'not_owing',
      });
    });

    it('lists when a customer was last reminded and who was never reminded', async () => {
      const reminded = await contact('01711000111');
      const never = await contact('01711000112');
      await baki(reminded, 50000, 3);
      await baki(never, 60000, 5);
      await reminders.remind(storeA, reminded, userId);
      const owner = { seeFullPhone: true };
      const all = await dueBook.listCustomers(storeA, { filter: 'all', limit: 10 }, owner);
      // The row time is the database clock, not the test clock.
      const remindedAt = all.items.find((item) => item.contactId === reminded)!.lastRemindedAt;
      expect(Date.now() - new Date(remindedAt!).getTime()).toBeLessThan(60_000);
      expect(all.items.find((item) => item.contactId === never)!.lastRemindedAt).toBeNull();
      const unreminded = await dueBook.listCustomers(
        storeA,
        { filter: 'never_reminded', limit: 10 },
        owner,
      );
      expect(unreminded.items.map((item) => item.contactId)).toEqual([never]);
      expect((await dueBook.summary(storeA)).neverRemindedCustomers).toBe(1);
    });

    it('announces the request in the outbox with the message id', async () => {
      const id = await contact();
      await baki(id, 175000, 40);
      const { messageId } = await reminders.remind(storeA, id, userId);
      const events = await admin.pool.query(
        "select payload from outbox_events where store_id=$1 and type='due.reminder_requested'",
        [storeA],
      );
      expect(events.rows).toEqual([{ payload: { contactId: id, messageId } }]);
    });
  });

  describe('remind all over 30 days', () => {
    it('queues the overdue customers and counts who was left out and why', async () => {
      const overdue = await contact('01711000111');
      await baki(overdue, 100000, 45);
      const recent = await contact('01711000112');
      await baki(recent, 100000, 10);
      const reminded = await contact('01711000113');
      await baki(reminded, 100000, 60);
      await reminders.remind(storeA, reminded, userId);
      const noPhone = await contact(null);
      await baki(noPhone, 100000, 50);
      const blocked = await contact('01711000114');
      await baki(blocked, 100000, 50);
      await admin.pool.query('update contacts set is_blocked=true where id=$1', [blocked]);

      expect(await reminders.remindOverdue(storeA, userId)).toEqual({
        queued: 1,
        skippedRecentlyReminded: 1,
        skippedNoPhone: 1,
        skippedBlocked: 1,
      });
      expect((await messages(overdue))[0]).toMatchObject({ kind: 'reminder', status: 'queued' });
      expect(await messages(recent)).toEqual([]);
    });
  });
});
