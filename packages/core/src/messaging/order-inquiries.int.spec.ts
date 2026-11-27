import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { StoreAccess } from '@dakly/contracts/team';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { OrderInquiriesRepository } from './order-inquiries.repository';
import { OrderInquiriesService } from './order-inquiries.service';

describe('order inquiries', () => {
  const f = new OwnerIsolationFixture();
  const repository = new OrderInquiriesRepository(f.tenant);
  const chatAccess = { areas: { chats: 'view' } } as StoreAccess;
  const actor = { kind: 'user', userId: f.userA } as const;
  const names = new Map<string, string>();
  const contactIds: Record<string, string> = {};
  const conversationIds: Record<string, string> = {};
  const kurti = randomUUID();
  let extensions = ['chats'];

  const service = new OrderInquiriesService(
    repository,
    { searchIds: async () => [contactIds.vip!] } as never,
    {
      getManyForChat: async (_storeId: string, ids: string[]) =>
        ids.includes(kurti)
          ? [
              {
                id: kurti,
                name: "Women's Kurti",
                variants: [{ isDefault: true, pricePoisha: 191000 }],
              },
            ]
          : [],
    } as never,
    { settings: async () => ({ extensions }) } as never,
  );

  async function chat(
    name: string,
    change: {
      store?: string;
      status?: string;
      intent?: string | null;
      interest?: boolean;
      kind?: string;
      vip?: boolean;
      minutes: number;
    },
  ) {
    const store = change.store ?? f.a;
    contactIds[name] = randomUUID();
    conversationIds[name] = randomUUID();
    names.set(conversationIds[name], name);
    await f.connection.pool.query(
      `insert into contacts (id, store_id, name, source, kind, not_customer_reason)
       values ($1, $2, $3, 'messenger', $4, case when $4 = 'not_customer' then 'supplier' end)`,
      [contactIds[name], store, name, change.kind ?? 'customer'],
    );
    if (change.vip)
      await f.connection.pool.query(
        "insert into contact_stats (contact_id, store_id, lifecycle_stage) values ($1, $2, 'best')",
        [contactIds[name], store],
      );
    await f.connection.pool.query(
      `insert into conversations (id, store_id, contact_id, channel_connection_id, channel, status,
         intent_tag, has_buying_interest, last_inbound_at, last_message_at)
       values ($1, $2, $3, $4, 'messenger', $5, $6, $7, $8::timestamptz + make_interval(mins => $9),
         $8::timestamptz + make_interval(mins => $9))`,
      [
        conversationIds[name],
        store,
        contactIds[name],
        store === f.a ? connectionA : connectionB,
        change.status ?? 'open',
        change.intent === undefined ? 'price' : change.intent,
        change.interest ?? false,
        '2026-11-20T09:00:00Z',
        change.minutes,
      ],
    );
  }

  let orderNumber = 1000;
  async function orderFor(name: string, minutes: number, stage = 'to_confirm') {
    await f.connection.pool.query(
      `insert into orders (id, store_id, number, buyer_contact_id, buyer_name, source, created_by_type,
         recipient_name, recipient_phone, recipient_address, recipient_district, stage, cancel_reason, items_subtotal_poisha, cod_amount_poisha, created_at)
       values ($1, $2, $3, $4, 'x', 'manual', 'user', 'x', '01712458903', 'Dhanmondi', 'Dhaka', $5, case when $5 = 'cancelled' then 'other' end,
         1000, 1000, '2026-11-20T09:00:00Z'::timestamptz + make_interval(mins => $6))`,
      [randomUUID(), f.a, ++orderNumber, contactIds[name], stage, minutes],
    );
  }

  const connectionA = randomUUID();
  const connectionB = randomUUID();
  const list = async (query = {}) => service.list(f.a, { limit: 50, ...query }, chatAccess, actor);
  const listed = async (query = {}) =>
    (await list(query)).items.map(({ conversationId }) => names.get(conversationId));

  beforeAll(async () => {
    await f.setup();
    for (const [id, store] of [
      [connectionA, f.a],
      [connectionB, f.b],
    ] as const)
      await f.connection.pool.query(
        `insert into channel_connections (id, store_id, kind, external_account_id, display_name)
         values ($1::uuid, $2, 'facebook_page', $1::text, 'Fixture')`,
        [id, store],
      );
    await chat('asked_price', { minutes: 50 });
    await chat('wants_to_order', { intent: 'order', minutes: 40 });
    await chat('repeat_buyer', { intent: 'size_or_stock', minutes: 30 });
    await chat('vip', { intent: null, interest: true, vip: true, minutes: 20 });
    await chat('ordered_after', { minutes: 60 });
    await chat('cancelled_after', { minutes: 10 });
    await chat('ordered_before', { minutes: 5 });
    await chat('greeting', { intent: 'greeting', minutes: 70 });
    await chat('done', { status: 'done', minutes: 80 });
    await chat('supplier', { kind: 'not_customer', minutes: 90 });
    await chat('other_shop', { store: f.b, minutes: 100 });
    await orderFor('repeat_buyer', -60);
    await orderFor('ordered_after', 61);
    await orderFor('cancelled_after', 11, 'cancelled');
    await orderFor('ordered_before', 4);
    await f.connection.pool.query(
      `insert into messages (id, store_id, conversation_id, direction, author_type, kind, body, status, ai_sources, created_at)
       values ($1, $2, $3, 'out', 'ai', 'product_card', 'Kurti', 'sent', $4::jsonb, '2026-11-20T09:10:00Z')`,
      [
        randomUUID(),
        f.a,
        conversationIds.asked_price,
        JSON.stringify([{ tool: 'shown_products', refs: [kurti] }]),
      ],
    );
  });

  afterAll(async () => {
    try {
      for (const table of [
        'messages',
        'orders',
        'conversations',
        'channel_connections',
        'contacts',
      ])
        await f.connection.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [
          [f.a, f.b],
        ]);
    } finally {
      await f.close();
    }
  });

  it('lists chats with buying intent and no order since the last message, newest first', async () => {
    expect(await listed()).toEqual([
      'asked_price',
      'wants_to_order',
      'repeat_buyer',
      'vip',
      'cancelled_after',
      'ordered_before',
    ]);
    expect(await repository.count(f.a)).toBe(6);
  });

  it('names the product the AI showed last with its price, and marks new, repeat and vip customers', async () => {
    const byName = Object.fromEntries(
      (await list()).items.map((item) => [names.get(item.conversationId), item]),
    );
    expect(byName.asked_price).toMatchObject({
      contactName: 'asked_price',
      customerKind: 'new',
      channel: 'messenger',
      product: { id: kurti, name: "Women's Kurti", pricePoisha: 191000 },
    });
    expect(byName.repeat_buyer).toMatchObject({ customerKind: 'repeat', product: null });
    expect(byName.vip).toMatchObject({ customerKind: 'vip' });
  });

  it('pages by position and narrows by the customers a search finds', async () => {
    const first = await list({ limit: 4 });
    expect(first.items).toHaveLength(4);
    expect(first.nextCursor).toBe(4);
    const second = await list({ limit: 4, cursor: 4 });
    expect(second.items.map(({ conversationId }) => names.get(conversationId))).toEqual([
      'cancelled_after',
      'ordered_before',
    ]);
    expect(second.nextCursor).toBeNull();
    expect(await listed({ search: 'vip' })).toEqual(['vip']);
  });

  it('shows nothing when chats are off or the member cannot see chats', async () => {
    extensions = [];
    expect(await list()).toEqual({ items: [], nextCursor: null });
    expect(await service.count(f.a, chatAccess)).toBe(0);
    extensions = ['chats'];
    const noChats = { areas: { chats: 'none' } } as StoreAccess;
    expect(await service.list(f.a, { limit: 50 }, noChats, actor)).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(await service.count(f.a, chatAccess)).toBe(6);
  });
});
