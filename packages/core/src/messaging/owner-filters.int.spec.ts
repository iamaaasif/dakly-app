import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { InboxRepository } from './inbox.repository';

describe('inbox filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new InboxRepository(f.tenant, f.connection.db);
  const now = new Date('2026-11-19T06:00:00Z');

  beforeAll(() => f.setup());
  afterAll(async () => {
    try {
      for (const table of ['messages', 'conversations'])
        await f.connection.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [
          [f.a, f.b],
        ]);
    } finally {
      await f.close();
    }
  });

  async function conversation(storeId: string) {
    const contactId = randomUUID();
    const connectionId = randomUUID();
    const id = randomUUID();
    const messageId = randomUUID();
    await f.connection.pool.query(
      "insert into contacts (id, store_id, source, kind) values ($1, $2, 'messenger', 'chat_only')",
      [contactId, storeId],
    );
    await f.connection.pool.query(
      `insert into channel_connections (id, store_id, kind, external_account_id, display_name)
       values ($1::uuid, $2, 'facebook_page', $1::text, 'Inbox fixture')`,
      [connectionId, storeId],
    );
    await f.connection.pool.query(
      `insert into conversations (id, store_id, contact_id, channel_connection_id, channel)
       values ($1, $2, $3, $4, 'messenger')`,
      [id, storeId, contactId, connectionId],
    );
    await f.connection.pool.query(
      `insert into messages (id, store_id, conversation_id, direction, author_type, kind, status)
       values ($1, $2, $3, 'in', 'customer', 'text', 'received')`,
      [messageId, storeId, id],
    );
    return { id, messageId, contactId, connectionId };
  }

  it('lists, reads and updates only conversations and messages in the selected store', async () => {
    const first = await conversation(f.a);
    const second = await conversation(f.b);
    const page = { limit: 50 };
    expect((await repository.list(f.b, page)).map(({ id }) => id)).toEqual([second.id]);
    expect(await repository.find(f.b, first.id)).toBeUndefined();
    expect(await repository.find(f.b, second.id)).toMatchObject({ id: second.id });
    expect(await repository.messages(f.b, first.id, page)).toEqual([]);
    expect((await repository.messages(f.b, second.id, page)).map(({ id }) => id)).toEqual([
      second.messageId,
    ]);
    expect(await repository.update(f.b, first.id, { status: 'done' }, { now })).toBeUndefined();
    expect(await repository.find(f.a, first.id)).toMatchObject({ status: 'open' });
    expect(await repository.update(f.b, second.id, { status: 'done' }, { now })).toMatchObject({
      status: 'done',
    });
    const note = { body: 'ভিতরের নোট', authorUserId: f.userB };
    await expect(repository.addNote(f.b, first.id, note, now)).rejects.toMatchObject({
      cause: { code: '23503' },
    });
    const added = await repository.addNote(f.b, second.id, note, now);
    expect(added).toMatchObject({ ...note, kind: 'note' });
    expect(await repository.messages(f.a, first.id, page)).toHaveLength(1);
  });

  it('keeps a send intent tied to an identity in the same store even for the table owner', async () => {
    const own = await conversation(f.a);
    const foreign = await conversation(f.b);
    const identityId = randomUUID();
    const { pool } = f.connection;
    await pool.query(
      `insert into contact_identities (id, store_id, contact_id, channel_connection_id, channel, external_id)
       values ($1, $2, $3, $4, 'messenger', 'other-shop-recipient')`,
      [identityId, f.b, foreign.contactId, foreign.connectionId],
    );
    await expect(
      pool.query('update messages set recipient_identity_id = $1 where id = $2', [
        identityId,
        own.messageId,
      ]),
    ).rejects.toMatchObject({ code: '23503', constraint: 'messages_recipient_identity_store_fk' });
    await expect(
      pool.query("update messages set send_category = 'unexpected' where id = $1", [own.messageId]),
    ).rejects.toMatchObject({ code: '23514', constraint: 'messages_send_category' });
  });
});
