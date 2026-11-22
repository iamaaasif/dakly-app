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
    // name, status, unread, minutes after 09:00, contact kind
    const rows = [
      ['oldNeeds', 'needs_you', 0, 1, 'customer'],
      ['newOpenUnread', 'open', 2, 30, 'customer'],
      ['newestDone', 'done', 0, 40, 'customer'],
      ['oldOpenUnread', 'open', 1, 5, 'customer'],
      ['supplier', 'open', 0, 20, 'not_customer'],
    ] as const;
    for (const [name, status, unread, minutes, kind] of rows) {
      ids[name] = randomUUID();
      contactIds[name] = randomUUID();
      await f.connection.pool.query(
        "insert into contacts (id, store_id, source, kind, not_customer_reason) values ($1, $2, 'messenger', $3, case when $3 = 'not_customer' then 'supplier' end)",
        [contactIds[name], f.a, kind],
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
      for (const table of ['conversations', 'channel_connections', 'contacts'])
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
    const rows = await repository.list(f.a, query(change), contactFilter);
    return rows.map((row) => byId[row.id]);
  };

  it('puts chats that need you first, then the newest', async () => {
    expect(await names({ sort: 'needs_you' })).toEqual([
      'oldNeeds',
      'newestDone',
      'newOpenUnread',
      'supplier',
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
        const rows = await repository.list(f.a, query({ sort, limit: 2, cursor }));
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

  it('filters by contact kind, status and a list of contacts', async () => {
    expect(await names({ contactKind: 'not_customer' })).toEqual(['supplier']);
    expect(await names({ status: 'done' })).toEqual(['newestDone']);
    expect(await names({}, [contactIds.oldNeeds!])).toEqual(['oldNeeds']);
  });
});
