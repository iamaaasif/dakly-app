import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { ContactsModule } from '../contacts/contacts.module';
import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { DAY_MS } from '../platform/time';
import { DueBookModule } from './due-book.module';
import { DueBookService } from './due-book.service';

class TestModule {}
Module({ imports: [DatabaseModule, ContactsModule, DueBookModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeA = randomUUID();
const storeB = randomUUID();
const userId = randomUUID();
const storeIds = [storeA, storeB];
const user = { kind: 'user', userId } as const;
const byUser = { actor: user };
const owner = {
  role: 'owner',
  areas: { dueBook: 'edit' },
  seeFullPhone: true,
  exportLists: true,
  refund: true,
} as const;
const NOW = new Date('2026-11-21T06:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS).toISOString();
let app: INestApplicationContext;
let service: DueBookService;

async function contact(storeId: string, name = 'রিনা', phone: string | null = null) {
  const id = randomUUID();
  await admin.pool.query(
    "insert into contacts(id,store_id,name,phone,source,kind) values($1,$2,$3,$4,'manual','customer')",
    [id, storeId, name, phone],
  );
  return id;
}

const baki = (contactId: string, amountPoisha: number, days = 0, storeId = storeA) =>
  service.recordBaki(
    storeId,
    contactId,
    { amountPoisha, occurredAt: days ? daysAgo(days) : undefined },
    byUser,
  );
const pay = (contactId: string, amountPoisha: number, days = 0) =>
  service.collectPayment(
    storeA,
    contactId,
    { amountPoisha, method: 'cash', occurredAt: days ? daysAgo(days) : undefined },
    byUser,
  );

async function failure(work: Promise<unknown>) {
  return work.then(
    () => undefined,
    (error: { code: string }) => error.code,
  );
}

describe('DueBookService (Postgres)', () => {
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
    service = app.get(DueBookService);
    vi.spyOn(app.get(Clock), 'now').mockImplementation(() => NOW);
  });

  afterAll(async () => {
    try {
      await app?.close();
      for (const table of ['outbox_events', 'due_entries', 'contacts'])
        await admin.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [storeIds]);
      await admin.pool.query('delete from stores where id=any($1::uuid[])', [storeIds]);
      await admin.pool.query('delete from users where id=$1', [userId]);
    } finally {
      await admin.pool.end();
    }
  });

  it('settles the oldest baki first and dates the debt from what is left', async () => {
    const id = await contact(storeA);
    await baki(id, 60000, 60);
    await baki(id, 80000, 10);
    const { balance } = await pay(id, 100000);
    expect(balance).toEqual({
      contactId: id,
      balancePoisha: 40000,
      oldestDebtAt: daysAgo(10),
    });
  });

  it('keeps the older debt open when a payment only covers part of it', async () => {
    const id = await contact(storeA);
    await baki(id, 60000, 60);
    await baki(id, 80000, 10);
    expect((await pay(id, 20000)).balance).toMatchObject({
      balancePoisha: 120000,
      oldestDebtAt: daysAgo(60),
    });
  });

  it('counts a payment dated before a baki against the older baki only', async () => {
    const id = await contact(storeA);
    await baki(id, 50000, 20);
    await pay(id, 70000, 15);
    expect((await baki(id, 30000, 5)).balance).toMatchObject({
      balancePoisha: 10000,
      oldestDebtAt: daysAgo(5),
    });
  });

  it('shows a payment above the debt as a negative balance', async () => {
    const id = await contact(storeA);
    await baki(id, 40000);
    const { balance } = await pay(id, 60000);
    expect(balance).toMatchObject({ balancePoisha: -20000, oldestDebtAt: null });
    expect(await service.customer(storeA, id, owner)).toMatchObject({ balancePoisha: -20000 });
  });

  it('writes off part of a debt with a reason and keeps it in the history', async () => {
    const id = await contact(storeA);
    await baki(id, 90000, 40);
    const result = await service.writeOff(
      storeA,
      id,
      { amountPoisha: 30000, reason: 'Moved to another town' },
      { actor: user, access: owner },
    );
    expect(result.balance.balancePoisha).toBe(60000);
    expect(result.entry).toMatchObject({ kind: 'write_off', note: 'Moved to another town' });
    const history = await service.history(storeA, id, { limit: 10 }, owner);
    expect(history.items.map((item) => item.kind)).toEqual(['write_off', 'baki']);
  });

  it('refuses a write-off above the balance and one from a role that cannot', async () => {
    const id = await contact(storeA);
    await baki(id, 10000);
    const tooMuch = { amountPoisha: 10001, reason: 'Gone' };
    expect(
      await failure(service.writeOff(storeA, id, tooMuch, { actor: user, access: owner })),
    ).toBe('DUE_WRITE_OFF_EXCEEDS_BALANCE');
    const counter = { ...owner, role: 'support_agent' } as const;
    expect(
      await failure(
        service.writeOff(
          storeA,
          id,
          { amountPoisha: 100, reason: 'Gone' },
          { actor: user, access: counter },
        ),
      ),
    ).toBe('DUE_WRITE_OFF_NOT_ALLOWED');
    expect((await service.customer(storeA, id, owner)).balancePoisha).toBe(10000);
  });

  it('refuses a date in the future and a customer from another store', async () => {
    const id = await contact(storeA);
    const future = new Date(NOW.getTime() + 60_000).toISOString();
    expect(
      await failure(
        service.recordBaki(storeA, id, { amountPoisha: 500, occurredAt: future }, byUser),
      ),
    ).toBe('DUE_ENTRY_IN_FUTURE');
    expect(await failure(baki(id, 500, 0, storeB))).toBe('CONTACT_NOT_FOUND');
    expect(await failure(service.history(storeB, id, { limit: 10 }, owner))).toBe(
      'CONTACT_NOT_FOUND',
    );
    expect(await failure(service.customer(storeB, id, owner))).toBe('CONTACT_NOT_FOUND');
  });

  it('lets two payments at once both count', async () => {
    const id = await contact(storeA);
    await baki(id, 100000, 3);
    await Promise.all([pay(id, 10000), pay(id, 20000), pay(id, 30000)]);
    expect((await service.customer(storeA, id, owner)).balancePoisha).toBe(40000);
  });

  it('gives a running balance, newest first, and pages through it', async () => {
    const id = await contact(storeA);
    await baki(id, 50000, 9);
    await pay(id, 20000, 6);
    await baki(id, 10000, 3);
    const first = await service.history(storeA, id, { limit: 2 }, owner);
    expect(first.items.map((item) => item.balanceAfterPoisha)).toEqual([40000, 30000]);
    expect(first.nextCursor).not.toBeNull();
    const second = await service.history(
      storeA,
      id,
      { limit: 2, cursor: first.nextCursor! },
      owner,
    );
    expect(second.items.map((item) => item.balanceAfterPoisha)).toEqual([50000]);
    expect(second.nextCursor).toBeNull();
  });

  describe('list and totals', () => {
    const shop = randomUUID();
    let overdueId: string, recentId: string, removedId: string, settledId: string;

    beforeAll(async () => {
      await admin.pool.query("insert into stores(id,name) values($1,'তালিকার দোকান')", [shop]);
      storeIds.push(shop);
      overdueId = await contact(shop, 'পুরনো', '01711111111');
      recentId = await contact(shop, 'নতুন', '01722222222');
      removedId = await contact(shop, 'মুছে ফেলা');
      settledId = await contact(shop, 'শোধ');
      await baki(overdueId, 70000, 45, shop);
      await baki(overdueId, 30000, 2, shop);
      await baki(recentId, 25000, 5, shop);
      await baki(removedId, 99000, 50, shop);
      await baki(settledId, 12000, 40, shop);
      await service.collectPayment(
        shop,
        settledId,
        { amountPoisha: 12000, method: 'bkash' },
        byUser,
      );
      await service.collectPayment(
        shop,
        recentId,
        { amountPoisha: 5000, method: 'nagad', occurredAt: daysAgo(10) },
        byUser,
      );
      await service.collectPayment(
        shop,
        overdueId,
        { amountPoisha: 10000, method: 'cash' },
        byUser,
      );
      await admin.pool.query('update contacts set deleted_at=now() where id=$1', [removedId]);
    });

    it('lists only people who owe, oldest debt first, with masked phones', async () => {
      const list = await service.listCustomers(shop, { filter: 'all', limit: 10 }, owner);
      expect(list.items.map((item) => [item.name, item.balancePoisha])).toEqual([
        ['পুরনো', 90000],
        ['নতুন', 20000],
      ]);
      const masked = await service.listCustomers(
        shop,
        { filter: 'all', limit: 10 },
        {
          seeFullPhone: false,
        },
      );
      expect(masked.items[0]!.phone).toBe('01711-XXX111');
      expect(list.items[0]!.phone).toBe('01711111111');
    });

    it('filters to debts older than 30 days and pages by cursor', async () => {
      const over = await service.listCustomers(shop, { filter: 'over_30_days', limit: 10 }, owner);
      expect(over.items.map((item) => item.contactId)).toEqual([overdueId]);
      const page = await service.listCustomers(shop, { filter: 'all', limit: 1 }, owner);
      expect(page.items).toHaveLength(1);
      const next = await service.listCustomers(
        shop,
        { filter: 'all', limit: 1, cursor: page.nextCursor! },
        owner,
      );
      expect(next.items.map((item) => item.contactId)).toEqual([recentId]);
      expect(next.nextCursor).toBeNull();
    });

    it('adds up what is owed, what is overdue and what was collected in 7 days', async () => {
      expect(await service.summary(shop)).toEqual({
        totalOwedPoisha: 110000,
        customersOwing: 2,
        // 60,000 of the 70,000 baki from 45 days ago is still open after the 10,000 payment.
        overdueOwedPoisha: 60000,
        overdueCustomers: 1,
        neverRemindedCustomers: 2,
        // The 12,000 and 10,000 payments count; the 5,000 one is dated 10 days ago.
        collectedLast7DaysPoisha: 22000,
      });
    });

    it('shows no debt for a store with no entries', async () => {
      expect(await service.summary(storeB)).toEqual({
        totalOwedPoisha: 0,
        customersOwing: 0,
        overdueOwedPoisha: 0,
        overdueCustomers: 0,
        neverRemindedCustomers: 0,
        collectedLast7DaysPoisha: 0,
      });
      expect(
        (await service.listCustomers(storeB, { filter: 'all', limit: 10 }, owner)).items,
      ).toEqual([]);
    });
  });

  it('publishes an event for each entry in the same transaction', async () => {
    const id = await contact(storeA);
    await baki(id, 1000);
    await pay(id, 400);
    await service.writeOff(
      storeA,
      id,
      { amountPoisha: 100, reason: 'Gone' },
      { actor: user, access: owner },
    );
    const result = await admin.pool.query<{ type: string }>(
      "select type from outbox_events where payload->>'contactId'=$1 order by occurred_at, id",
      [id],
    );
    expect(result.rows.map((row) => row.type).sort()).toEqual([
      'due.added',
      'due.payment_recorded',
      'due.written_off',
    ]);
  });

  it('keeps entries out of reach of another store and of edits by the app', async () => {
    const id = await contact(storeA);
    await baki(id, 7000);
    const app_ = createDatabase(process.env.DATABASE_URL!);
    try {
      const visible = await app_.pool.query('select id from due_entries');
      expect(visible.rowCount).toBe(0);
      await expect(app_.pool.query('update due_entries set amount_poisha = 1')).rejects.toThrow(
        /permission denied/,
      );
      await expect(app_.pool.query('delete from due_entries')).rejects.toThrow(/permission denied/);
    } finally {
      await app_.pool.end();
    }
  });
});
