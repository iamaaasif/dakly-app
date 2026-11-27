import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule } from '@nestjs/bullmq';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { ContactMergeModule } from './contact-merge.module';
import { ContactMergeService } from './contact-merge.service';

class TestModule {}
Module({
  imports: [
    DatabaseModule,
    BullModule.forRoot({
      connection: toRedisConnection(loadEnv().REDIS_URL),
      prefix: `contact-merge-test-${randomUUID()}`,
    }),
    ContactMergeModule,
  ],
})(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const userId = randomUUID();
const stores: string[] = [];
let app: INestApplicationContext;
let merges: ContactMergeService;
let clock = new Date('2026-11-20T12:00:00Z');

beforeAll(async () => {
  await admin.pool.query(
    "insert into users (id, name, email) values ($1::uuid, 'Rina', $1::text || '@example.test')",
    [userId],
  );
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  vi.spyOn(app.get(Clock), 'now').mockImplementation(() => clock);
  merges = app.get(ContactMergeService);
});

afterAll(async () => {
  try {
    await app?.close();
    for (const table of [
      'outbox_events',
      'audit_log',
      'consents',
      'contact_merges',
      'orders',
      'messages',
      'contact_notes',
      'contact_memories',
      'conversations',
      'contact_identities',
      'channel_connections',
      'contacts',
    ])
      await admin.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [stores]);
    await admin.pool.query('delete from stores where id = any($1::uuid[])', [stores]);
    await admin.pool.query('delete from users where id = $1', [userId]);
  } finally {
    await admin.pool.end();
    vi.restoreAllMocks();
  }
});

async function shop() {
  const storeId = randomUUID();
  await admin.pool.query(
    "insert into stores (id, name, extensions) values ($1, 'Merge', '{chats}')",
    [storeId],
  );
  stores.push(storeId);
  return storeId;
}

async function contact(
  storeId: string,
  values: { name: string; phone?: string; createdAt: string },
) {
  const id = randomUUID();
  await admin.pool.query(
    `insert into contacts (id, store_id, name, phone, source, kind, created_at, updated_at)
     values ($1, $2, $3, $4, 'messenger', 'lead', $5, $5)`,
    [id, storeId, values.name, values.phone ?? null, values.createdAt],
  );
  return id;
}

async function chat(storeId: string, contactId: string) {
  const connectionId = randomUUID();
  await admin.pool.query(
    "insert into channel_connections (id, store_id, kind, external_account_id, display_name) values ($1::uuid, $2, 'facebook_page', $1::text, 'Page')",
    [connectionId, storeId],
  );
  const identityId = randomUUID();
  await admin.pool.query(
    "insert into contact_identities (id, store_id, contact_id, channel_connection_id, channel, external_id) values ($1::uuid, $2, $3, $4, 'messenger', $1::text)",
    [identityId, storeId, contactId, connectionId],
  );
  const conversationId = randomUUID();
  await admin.pool.query(
    `insert into conversations (id, store_id, contact_id, channel_connection_id, channel, last_message_at,
       memory_built_through_message_id, memory_built_through_message_at, memory_version)
     values ($1, $2, $3, $4, 'messenger', now(), $5, now(), 4)`,
    [conversationId, storeId, contactId, connectionId, randomUUID()],
  );
  return { connectionId, identityId, conversationId };
}

async function order(storeId: string, contactId: string, number: number) {
  const id = randomUUID();
  await admin.pool.query(
    `insert into orders (id, store_id, number, buyer_contact_id, source, created_by_type, stage,
       recipient_name, recipient_phone, recipient_address, recipient_district,
       items_subtotal_poisha, order_discount_poisha, delivery_charge_poisha, cod_amount_poisha, payment_status)
     values ($1, $2, $3, $4, 'manual', 'user', 'delivered', 'Rina', '01710000001', 'Mirpur', 'Dhaka',
       10000, 0, 0, 10000, 'cod_pending')`,
    [id, storeId, number, contactId],
  );
  return id;
}

const fact = (kind: string, value: string, source: string) => ({
  kind,
  value,
  source,
  sourceId: randomUUID(),
  at: '2026-11-19T10:00:00.000Z',
});

async function memory(storeId: string, contactId: string, facts: object[], summary: string) {
  await admin.pool.query(
    `insert into contact_memories (contact_id, store_id, summary, facts, version, built_at)
     values ($1, $2, $3, $4::jsonb, 3, now())`,
    [contactId, storeId, summary, JSON.stringify(facts)],
  );
}

const one = async (sql: string, params: unknown[]) => (await admin.pool.query(sql, params)).rows[0];

async function note(storeId: string, contactId: string, body: string) {
  const id = randomUUID();
  await admin.pool.query(
    'insert into contact_notes (id, store_id, contact_id, body) values ($1, $2, $3, $4)',
    [id, storeId, contactId, body],
  );
  return id;
}

async function pair() {
  const storeId = await shop();
  const older = await contact(storeId, {
    name: 'রিনা',
    phone: '01710000001',
    createdAt: '2026-11-01T00:00:00Z',
  });
  const newer = await contact(storeId, { name: 'Rina A', createdAt: '2026-11-10T00:00:00Z' });
  await admin.pool.query(
    "update contacts set email = 'rina@example.test', tags = '{vip}' where id = $1",
    [newer],
  );
  await admin.pool.query("update contacts set tags = '{eid}' where id = $1", [older]);
  return { storeId, older, newer };
}

describe('contact merge (Postgres)', () => {
  it('keeps the older contact, moves records, and rebuilds both memories', async () => {
    const { storeId, older, newer } = await pair();
    const olderChat = await chat(storeId, older);
    const newerChat = await chat(storeId, newer);
    const newerOrder = await order(storeId, newer, 1);
    const newerNote = await note(storeId, newer, 'শুক্রবারে ডেলিভারি চান');
    const staffFact = fact('size', 'M', 'staff');
    await memory(storeId, older, [fact('colour', 'red', 'customer_message')], 'Likes red.');
    await memory(storeId, newer, [staffFact, fact('style', 'plain', 'own_order')], 'Likes plain.');

    const result = await merges.merge(storeId, userId, {
      contactId: newer,
      otherContactId: older,
      operationKey: randomUUID(),
    });

    expect(result).toMatchObject({ keptContactId: older, mergedContactId: newer });
    const kept = await one('select * from contacts where id = $1', [older]);
    expect(kept).toMatchObject({ phone: '01710000001', email: 'rina@example.test' });
    expect(kept.tags.sort()).toEqual(['eid', 'vip']);
    const hidden = await one('select deleted_at from contacts where id = $1', [newer]);
    expect(hidden.deleted_at).not.toBeNull();
    const movedOrder = await one('select buyer_contact_id as c from orders where id = $1', [
      newerOrder,
    ]);
    expect(movedOrder.c).toBe(older);
    const movedNote = await one('select contact_id as c from contact_notes where id = $1', [
      newerNote,
    ]);
    expect(movedNote.c).toBe(older);
    const movedChat = await one('select contact_id as c from conversations where id = $1', [
      newerChat.conversationId,
    ]);
    expect(movedChat.c).toBe(older);
    const movedIdentity = await one(
      'select contact_id as c from contact_identities where id = $1',
      [newerChat.identityId],
    );
    expect(movedIdentity.c).toBe(older);
    // Both chats start again from nothing and an older model answer fails its version guard.
    const reset = await one(
      'select memory_built_through_message_id as m, memory_version as v from conversations where id = $1',
      [olderChat.conversationId],
    );
    expect(reset).toEqual({ m: null, v: 5 });
    const keptMemory = await one('select * from contact_memories where contact_id = $1', [older]);
    expect(keptMemory).toMatchObject({ summary: '', version: 4 });
    expect(keptMemory.facts).toEqual([staffFact]);
    const mergedMemory = await one('select * from contact_memories where contact_id = $1', [newer]);
    expect(mergedMemory.facts).toEqual([staffFact]);
    const events = await one(
      "select count(*)::int as n from outbox_events where store_id = $1 and type = 'contact.merged'",
      [storeId],
    );
    expect(events.n).toBe(1);
  });

  it('returns the recorded merge when the same key is sent again', async () => {
    const { storeId, older, newer } = await pair();
    const input = { contactId: older, otherContactId: newer, operationKey: randomUUID() };
    const first = await merges.merge(storeId, userId, input);
    const second = await merges.merge(storeId, userId, input);
    expect(second.id).toBe(first.id);
    expect(await merges.listUndoable(storeId, older)).toMatchObject([
      { id: first.id, mergedContactName: 'Rina A' },
    ]);
    await merges.undo(storeId, userId, first.id);
    expect(await merges.listUndoable(storeId, older)).toEqual([]);
    expect((await merges.merge(storeId, userId, input)).undoneAt).not.toBeNull();
    const back = await one('select deleted_at from contacts where id = $1', [newer]);
    expect(back.deleted_at).toBeNull();
  });

  it('undoes only what still stands and keeps later changes', async () => {
    const { storeId, older, newer } = await pair();
    const newerChat = await chat(storeId, newer);
    const newerOrder = await order(storeId, newer, 1);
    const newerNote = await note(storeId, newer, 'বড় সাইজ লাগে');
    const staffFact = fact('size', 'L', 'staff');
    await memory(storeId, newer, [staffFact], '');
    await admin.pool.query("update contacts set phone = '01710000002' where id = $1", [newer]);
    await admin.pool.query('update contacts set phone = null where id = $1', [older]);
    const merged = await merges.merge(storeId, userId, {
      contactId: older,
      otherContactId: newer,
      operationKey: randomUUID(),
    });
    const gained = await one('select phone from contacts where id = $1', [older]);
    expect(gained.phone).toBe('01710000002');
    // After the merge: an edit to the email, a new order, and the phone is taken by someone else.
    await admin.pool.query(
      "update contacts set email = 'edited@example.test', phone = null where id = $1",
      [older],
    );
    const lateOrder = await order(storeId, older, 2);
    await contact(storeId, {
      name: 'Other',
      phone: '01710000002',
      createdAt: '2026-11-12T00:00:00Z',
    });
    await admin.pool.query(
      "insert into consents (id, store_id, contact_id, channel, status, source, captured_at) values (gen_random_uuid(), $1, $2, 'sms', 'withdrawn', 'manual', $3)",
      [storeId, older, new Date(clock.getTime() + 1000)],
    );
    clock = new Date(clock.getTime() + 60_000);

    const undone = await merges.undo(storeId, userId, merged.id);

    expect(undone.undoConflicts).toEqual(expect.arrayContaining(['phone', 'email']));
    const kept = await one('select * from contacts where id = $1', [older]);
    expect(kept.email).toBe('edited@example.test');
    expect(kept.tags).toEqual(['eid']);
    const restored = await one('select deleted_at, phone from contacts where id = $1', [newer]);
    expect(restored).toEqual({ deleted_at: null, phone: null });
    const owner = (id: string) =>
      one('select buyer_contact_id as c from orders where id = $1', [id]);
    expect((await owner(newerOrder)).c).toBe(newer);
    expect((await owner(lateOrder)).c).toBe(older);
    const noteOwner = await one('select contact_id as c from contact_notes where id = $1', [
      newerNote,
    ]);
    expect(noteOwner.c).toBe(newer);
    const chatOwner = await one('select contact_id as c from conversations where id = $1', [
      newerChat.conversationId,
    ]);
    expect(chatOwner.c).toBe(newer);
    const keptFacts = await one('select facts from contact_memories where contact_id = $1', [
      older,
    ]);
    expect(keptFacts.facts).toEqual([]);
    const mergedFacts = await one('select facts from contact_memories where contact_id = $1', [
      newer,
    ]);
    expect(mergedFacts.facts).toEqual([staffFact]);
    const consent = await one(
      "select status from contact_consent_current where contact_id = $1 and channel = 'sms'",
      [newer],
    );
    expect(consent.status).toBe('withdrawn');
  });

  it('refuses an undo after a later merge or after seven days, and a chat on the same page', async () => {
    const { storeId, older, newer } = await pair();
    const first = await merges.merge(storeId, userId, {
      contactId: older,
      otherContactId: newer,
      operationKey: randomUUID(),
    });
    const third = await contact(storeId, { name: 'Third', createdAt: '2026-11-15T00:00:00Z' });
    await merges.merge(storeId, userId, {
      contactId: older,
      otherContactId: third,
      operationKey: randomUUID(),
    });
    await expect(merges.undo(storeId, userId, first.id)).rejects.toMatchObject({
      code: 'CONTACT_MERGE_UNDO_BLOCKED',
    });
    clock = new Date(clock.getTime() + 8 * 24 * 60 * 60 * 1000);
    await expect(merges.undo(storeId, userId, first.id)).rejects.toMatchObject({
      code: 'CONTACT_MERGE_UNDO_CLOSED',
    });

    const same = await pair();
    const olderChat = await chat(same.storeId, same.older);
    await admin.pool.query(
      "insert into conversations (id, store_id, contact_id, channel_connection_id, channel, last_message_at) values (gen_random_uuid(), $1, $2, $3, 'messenger', now())",
      [same.storeId, same.newer, olderChat.connectionId],
    );
    await expect(
      merges.merge(same.storeId, userId, {
        contactId: same.older,
        otherContactId: same.newer,
        operationKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CONTACT_MERGE_CHAT_CONFLICT' });
  });
});
