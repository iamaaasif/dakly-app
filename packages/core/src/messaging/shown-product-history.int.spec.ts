import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { InboxShownProductsRepository } from './inbox-shown-products.repository';

describe('shown product history', () => {
  const f = new OwnerIsolationFixture();
  const repository = new InboxShownProductsRepository(f.tenant);
  const messenger = randomUUID();
  const instagram = randomUUID();
  const other = randomUUID();
  const sources = (ref: string) => JSON.stringify([{ tool: 'shown_products', refs: [ref] }]);

  async function chat(id: string, contactId: string, connectionId: string, channel: string) {
    await f.connection.pool.query(
      `insert into conversations (id, store_id, contact_id, channel_connection_id, channel, status)
       values ($1, $2, $3, $4, $5, 'open')`,
      [id, f.a, contactId, connectionId, channel],
    );
  }

  async function reply(
    conversationId: string,
    body: string,
    aiSources: string | null,
    day: number,
  ) {
    await f.connection.pool.query(
      `insert into messages (id, store_id, conversation_id, direction, author_type, kind, body, status, ai_sources, created_at)
       values ($1, $2, $3, 'out', 'ai', 'text', $4, 'sent', $5::jsonb, $6::timestamptz + make_interval(days => $7))`,
      [randomUUID(), f.a, conversationId, body, aiSources, '2026-11-20T09:00:00Z', day],
    );
  }

  beforeAll(async () => {
    await f.setup();
    const buyer = randomUUID();
    const stranger = randomUUID();
    for (const id of [buyer, stranger])
      await f.connection.pool.query(
        "insert into contacts (id, store_id, source, kind) values ($1, $2, 'messenger', 'customer')",
        [id, f.a],
      );
    const messengerConnection = randomUUID();
    const instagramConnection = randomUUID();
    for (const [id, kind] of [
      [messengerConnection, 'facebook_page'],
      [instagramConnection, 'instagram'],
    ] as const)
      await f.connection.pool.query(
        `insert into channel_connections (id, store_id, kind, external_account_id, display_name)
         values ($1::uuid, $2, $3, $1::text, 'Fixture')`,
        [id, f.a, kind],
      );
    await chat(messenger, buyer, messengerConnection, 'messenger');
    await chat(instagram, buyer, instagramConnection, 'instagram');
    await chat(other, stranger, messengerConnection, 'messenger');
    await reply(messenger, 'কুর্তি আছে', sources('p-kurti'), 0);
    await reply(messenger, 'plain reply', null, 1);
    await reply(other, 'polo ache', sources('p-polo'), 2);
    await reply(instagram, 'পাঞ্জাবি আছে', sources('p-panjabi'), 3);
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

  it('finds the shown products of the same customer on every channel, newest first', async () => {
    const found = await repository.shownProductHistory(f.a, instagram, 20);
    expect(found.map(({ body }) => body)).toEqual(['পাঞ্জাবি আছে', 'কুর্তি আছে']);
  });

  it('never reads another customer’s chat', async () => {
    const found = await repository.shownProductHistory(f.a, messenger, 20);
    expect(found.map(({ body }) => body)).not.toContain('polo ache');
  });
});
