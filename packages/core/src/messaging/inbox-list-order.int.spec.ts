import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ConversationListQuery } from '@dakly/contracts/chats';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { InboxRepository } from './inbox.repository';

describe('inbox list order and filters', () => {
  const f = new OwnerIsolationFixture();
  const repository = new InboxRepository(f.tenant, f.connection.db);
  const ids: Record<string, string> = {};
  const contactIds: Record<string, string> = {};

  beforeAll(async () => {
    await f.setup();
    const connectionId = randomUUID();
    await f.connection.pool.query(
      `insert into channel_connections (id, store_id, kind, external_account_id, display_name)
       values ($1::uuid, $2, 'facebook_page', $1::text, 'Order fixture')`,
      [connectionId, f.a],
    );
    // name, status, unread, minutes after 09:00, not-a-customer reason
    const rows = [
      ['oldNeeds', 'needs_you', 0, 1, null],
      ['newOpenUnread', 'open', 2, 30, null],
      ['newestDone', 'done', 0, 40, null],
      ['oldOpenUnread', 'open', 1, 5, null],
      ['supplier', 'open', 0, 20, 'supplier'],
      ['spammer', 'open', 0, 25, 'spam'],
      ['snoozed', 'later', 0, 10, null],
    ] as const;
    for (const [name, status, unread, minutes, reason] of rows) {
      ids[name] = randomUUID();
      contactIds[name] = randomUUID();
      await f.connection.pool.query(
        "insert into contacts (id, store_id, source, kind, not_customer_reason) values ($1, $2, 'messenger', case when $3::text is null then 'customer' else 'not_customer' end, $3)",
        [contactIds[name], f.a, reason],
      );
      await f.connection.pool.query(
        `insert into conversations (id, store_id, contact_id, channel_connection_id, channel, status, unread_count, last_message_at)
         values ($1, $2, $3, $4, 'messenger', $5, $6, $7::timestamptz + make_interval(mins => $8))`,
        [
          ids[name],
          f.a,
          contactIds[name],
          connectionId,
          status,
          unread,
          '2026-11-19T09:00:00Z',
          minutes,
        ],
      );
    }
  });

  afterAll(async () => {
    try {
      for (const table of ['messages', 'conversations', 'channel_connections', 'contacts'])
        await f.connection.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [
          [f.a, f.b],
        ]);
    } finally {
      await f.close();
    }
  });

  const query = (change: Partial<ConversationListQuery>): ConversationListQuery => ({
    limit: 50,
    sort: 'recent',
    ...change,
  });
  const names = async (change: Partial<ConversationListQuery>, contactFilter?: string[]) => {
    const byId = Object.fromEntries(Object.entries(ids).map(([name, id]) => [id, name]));
    const rows = await repository.list(f.a, f.userA, query(change), contactFilter);
    return rows.map((row) => byId[row.id]);
  };

  it('puts chats that need you first, then the newest', async () => {
    expect(await names({ sort: 'needs_you' })).toEqual([
      'oldNeeds',
      'newestDone',
      'newOpenUnread',
      'spammer',
      'supplier',
      'snoozed',
      'oldOpenUnread',
    ]);
  });

  it('puts unread chats first', async () => {
    expect((await names({ sort: 'unread' })).slice(0, 2)).toEqual([
      'newOpenUnread',
      'oldOpenUnread',
    ]);
  });

  it('puts the longest waiting unread chat first', async () => {
    expect((await names({ sort: 'waiting' })).slice(0, 2)).toEqual([
      'oldOpenUnread',
      'newOpenUnread',
    ]);
  });

  it('pages through every sort without repeating or skipping a chat', async () => {
    for (const sort of ['recent', 'needs_you', 'unread', 'waiting'] as const) {
      const seen: string[] = [];
      let cursor: ConversationListQuery['cursor'];
      for (let page = 0; page < 5; page += 1) {
        const rows = await repository.list(f.a, f.userA, query({ sort, limit: 2, cursor }));
        const shown = rows.slice(0, 2);
        seen.push(...shown.map((row) => row.id));
        const last = shown.at(-1);
        if (rows.length <= 2 || !last) break;
        const position = `${last.lastMessageAt}_${last.id}`;
        cursor = (sort === 'recent' ? position : `${last.sortGroup}_${position}`) as typeof cursor;
      }
      expect([...seen].sort()).toEqual(Object.values(ids).sort());
    }
  });

  it('filters by folder, state and a list of contacts', async () => {
    expect(await names({ folder: 'all', state: 'open' })).toEqual([
      'newOpenUnread',
      'oldOpenUnread',
      'oldNeeds',
    ]);
    expect(await names({ folder: 'not_customers' })).toEqual(['supplier']);
    expect(await names({ folder: 'spam' })).toEqual(['spammer']);
    expect(await names({ folder: 'all', state: 'snoozed' })).toEqual(['snoozed']);
    expect(await names({ state: 'resolved' })).toEqual(['newestDone']);
    expect(await names({}, [contactIds.oldNeeds!])).toEqual(['oldNeeds']);
  });

  it('puts a chat in Mine, Unassigned, Unreplied, AI handling and Order request by its fields', async () => {
    await f.connection.pool.query(
      `update conversations set assignee_user_id = $2, responder = 'human',
         last_inbound_at = '2026-11-19T09:00:00Z', last_outbound_at = '2026-11-19T09:05:00Z'
       where id = $1`,
      [ids.newOpenUnread, f.userA],
    );
    await f.connection.pool.query(
      `update conversations set responder = 'ai', intent_tag = 'order',
         last_inbound_at = '2026-11-19T09:10:00Z', last_outbound_at = '2026-11-19T09:05:00Z'
       where id = $1`,
      [ids.oldOpenUnread],
    );
    await f.connection.pool.query(
      "update conversations set responder = 'human', last_inbound_at = '2026-11-19T09:00:00Z' where id = $1",
      [ids.oldNeeds],
    );
    const open = (folder: ConversationListQuery['folder']) => names({ folder, state: 'open' });
    expect(await open('mine')).toEqual(['newOpenUnread']);
    expect(await open('unassigned')).toEqual(['oldOpenUnread', 'oldNeeds']);
    expect(await open('unreplied')).toEqual(['oldOpenUnread', 'oldNeeds']);
    expect(await open('ai_handling')).toEqual(['oldOpenUnread']);
    expect(await open('order_request')).toEqual(['oldOpenUnread']);
    expect(await repository.counts(f.a, f.userA)).toEqual({
      all: 3,
      mine: 1,
      unassigned: 2,
      unreplied: 2,
      ai_handling: 1,
      order_request: 1,
      not_customers: 1,
      spam: 1,
      unread: 2,
      needsYou: 1,
      snoozed: 1,
      resolved: 1,
    });
    expect((await repository.counts(f.b, f.userA)).all).toBe(0);
  });

  it('returns who wrote the newest sent message, the contact kind and the intent tag', async () => {
    const message = (authorType: string, kind: string, status: string, minute: number) =>
      f.connection.pool.query(
        `insert into messages (id, store_id, conversation_id, direction, author_type, author_user_id, kind, body, status, created_at)
         values ($7, $1, $2, 'out', $3, $8, $4, 'text', $5, '2026-11-19T09:00:00Z'::timestamptz + make_interval(mins => $6))`,
        [
          f.a,
          ids.newestDone,
          authorType,
          kind,
          status,
          minute,
          randomUUID(),
          authorType === 'user' ? f.userA : null,
        ],
      );
    await message('ai', 'text', 'sent', 1);
    await message('user', 'note', 'sent', 2);
    await message('user', 'text', 'failed', 3);
    await f.connection.pool.query("update conversations set intent_tag = 'price' where id = $1", [
      ids.newestDone,
    ]);
    const rows = await repository.list(f.a, f.userA, query({ state: 'resolved' }));
    const fields = ({ lastMessageFrom, contactKind, intentTag }: (typeof rows)[number]) => ({
      lastMessageFrom,
      contactKind,
      intentTag,
    });
    expect(rows.map(fields)).toEqual([
      { lastMessageFrom: 'ai', contactKind: 'customer', intentTag: 'price' },
    ]);
    const [quiet] = await repository.list(f.a, f.userA, query({ folder: 'spam' }));
    expect(quiet && fields(quiet)).toEqual({
      lastMessageFrom: null,
      contactKind: 'not_customer',
      intentTag: null,
    });
  });
});
