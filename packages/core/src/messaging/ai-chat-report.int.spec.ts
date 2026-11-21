import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { AiChatReportRepository } from './ai-chat-report.repository';

describe('AI chat report', () => {
  const f = new OwnerIsolationFixture();
  const repository = new AiChatReportRepository(f.tenant);
  const range = { from: '2026-11-10', through: '2026-11-12', timeZone: 'Asia/Dhaka' };
  const now = new Date('2026-11-12T10:00:00Z');
  const query = (sql: string, values: unknown[]) => f.connection.pool.query(sql, values);

  async function chat(
    storeId: string,
    {
      messages,
      handedOverAt,
      reason,
    }: {
      messages: [author: 'ai' | 'user', at: string, kind?: string][];
      handedOverAt?: string;
      reason?: string;
    },
  ) {
    const contactId = randomUUID();
    const connectionId = randomUUID();
    const conversationId = randomUUID();
    await query(
      "insert into contacts(id,store_id,source,kind) values($1,$2,'messenger','chat_only')",
      [contactId, storeId],
    );
    await query(
      `insert into channel_connections(id,store_id,kind,external_account_id,display_name)
       values($1::uuid,$2,'facebook_page',$1::text,'Report fixture')`,
      [connectionId, storeId],
    );
    await query(
      `insert into conversations(id,store_id,contact_id,channel_connection_id,channel,handed_over_at,handover_reason)
       values($1,$2,$3,$4,'messenger',$5,$6)`,
      [conversationId, storeId, contactId, connectionId, handedOverAt ?? null, reason ?? null],
    );
    for (const [author, at, kind] of messages)
      await query(
        `insert into messages(id,store_id,conversation_id,direction,author_type,author_user_id,kind,body,status,created_at)
         values($1,$2,$3,'out',$4,$5,$6,'x','sent',$7)`,
        [
          randomUUID(),
          storeId,
          conversationId,
          author,
          author === 'user' ? f.userA : null,
          kind ?? 'text',
          at,
        ],
      );
  }

  beforeAll(async () => {
    await f.setup();
    await chat(f.a, {
      messages: [
        ['customer', '2026-11-10T04:00:00Z'],
        ['ai', '2026-11-10T04:01:00Z'],
      ],
    });
    await chat(f.a, {
      messages: [
        ['ai', '2026-11-10T05:00:00Z'],
        ['user', '2026-11-10T06:00:00Z'],
      ],
    });
    await chat(f.a, {
      messages: [['ai', '2026-11-11T05:00:00Z']],
      handedOverAt: '2026-11-11T05:01:00Z',
      reason: 'refund',
    });
    await chat(f.a, { messages: [['ai', '2026-11-12T09:00:00Z']] });
    // An internal note by a person and a reply outside the range do not count.
    await chat(f.a, {
      messages: [
        ['ai', '2026-11-10T07:00:00Z'],
        ['user', '2026-11-10T08:00:00Z', 'note'],
      ],
    });
    await chat(f.a, { messages: [['ai', '2026-11-05T07:00:00Z']] });
    await chat(f.b, { messages: [['ai', '2026-11-10T07:00:00Z']] });
  });

  afterAll(async () => {
    await query('delete from messages where store_id=any($1::uuid[])', [[f.a, f.b]]);
    await query('delete from conversations where store_id=any($1::uuid[])', [[f.a, f.b]]);
    await f.close();
  });

  it('puts each chat the AI replied in into one group', async () => {
    expect(await repository.read(f.a, range, now)).toEqual({
      aiChats: 5,
      resolved: 2,
      answeredByPerson: 1,
      inProgress: 1,
      handedOver: [{ reason: 'refund', chats: 1 }],
    });
  });

  it('does not count another shop', async () => {
    expect((await repository.read(f.b, range, now)).aiChats).toBe(1);
  });
});
