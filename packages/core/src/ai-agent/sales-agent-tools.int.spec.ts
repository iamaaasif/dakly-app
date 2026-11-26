import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule } from '@nestjs/bullmq';
import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { OrdersService } from '../orders/orders.service';
import { ClockModule } from '../platform/clock.module';
import { loadEnv } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { TenantDatabase } from '../platform/database/tenant-database';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { AiAgentModule } from './ai-agent.module';
import { salesAgentLlmTools } from './sales-agent-tool-definitions';
import { SalesAgentToolsService } from './sales-agent-tools.service';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeIds: string[] = [];

class TestModule {}
Module({
  imports: [
    DatabaseModule,
    ClockModule,
    AiAgentModule,
    BullModule.forRoot({
      connection: toRedisConnection(loadEnv().REDIS_URL),
      prefix: `tools-int-${randomUUID()}`,
    }),
  ],
})(TestModule);

let app: INestApplicationContext;
let tools: SalesAgentToolsService;

beforeAll(async () => {
  app = await NestFactory.createApplicationContext(TestModule, { logger: ['error'] });
  tools = app.get(SalesAgentToolsService);
});

afterAll(async () => {
  try {
    await app?.close();
    for (const table of [
      'contact_match_suggestions',
      'restock_requests',
      'price_offers',
      'messages',
      'conversations',
      'contact_identities',
      'channel_connections',
      'stock_movements',
      'outbox_events',
      'audit_log',
      'ai_runs',
      'knowledge_chunks',
      'knowledge_items',
      'order_items',
      'orders',
      'delivery_zones',
      'product_variants',
      'products',
      'product_categories',
      'contacts',
      'store_counters',
    ])
      await admin.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [storeIds]);
    await admin.pool.query('delete from stores where id = any($1::uuid[])', [storeIds]);
  } finally {
    await admin.pool.end();
  }
});

async function shop() {
  const storeId = randomUUID();
  storeIds.push(storeId);
  await admin.pool.query(
    "insert into stores (id, name, extensions) values ($1, 'Tool test', '{chats}')",
    [storeId],
  );
  await admin.pool.query('insert into store_counters (store_id) values ($1)', [storeId]);
  return storeId;
}

async function contact(storeId: string) {
  const id = randomUUID();
  await admin.pool.query(
    "insert into contacts (id, store_id, name, phone, kind, source) values ($1, $2, 'রিনা', $3, 'customer', 'manual')",
    [id, storeId, `018${Math.floor(10000000 + Math.random() * 89999999)}`],
  );
  return id;
}

async function categoryFor(storeId: string, name: string) {
  const found = await admin.pool.query(
    'select id from product_categories where store_id = $1 and name = $2',
    [storeId, name],
  );
  if (found.rows[0]) return found.rows[0].id as string;
  const id = randomUUID();
  await admin.pool.query(
    'insert into product_categories (id, store_id, name) values ($1, $2, $3)',
    [id, storeId, name],
  );
  return id;
}

async function product(
  storeId: string,
  fields: {
    name: string;
    aliases?: string[];
    status?: string;
    chats?: boolean;
    stock?: number;
    category?: string;
    pricePoisha?: number;
  },
) {
  const id = randomUUID();
  const categoryId = fields.category ? await categoryFor(storeId, fields.category) : null;
  await admin.pool.query(
    'insert into products (id, store_id, name, aliases, status, is_visible_in_chats, category_id, price_poisha) values ($1, $2, $3, $4, $5, $6, $7, $8)',
    [
      id,
      storeId,
      fields.name,
      fields.aliases ?? [],
      fields.status ?? 'active',
      fields.chats ?? true,
      categoryId,
      fields.pricePoisha ?? 120000,
    ],
  );
  await admin.pool.query(
    "insert into product_variants (id, store_id, product_id, title, on_hand, reserved, is_default) values (gen_random_uuid(), $1, $2, 'Default', $3, 2, true)",
    [storeId, id, fields.stock ?? 10],
  );
  return id;
}

async function order(storeId: string, contactId: string, number: number) {
  const id = randomUUID();
  const productId = await product(storeId, { name: 'পাঞ্জাবি' });
  const {
    rows: [variant],
  } = await admin.pool.query<{ id: string }>(
    'select id from product_variants where store_id = $1 and product_id = $2',
    [storeId, productId],
  );
  await admin.pool.query(
    `insert into orders (id, store_id, number, buyer_contact_id, source, created_by_type, recipient_name, recipient_phone, recipient_address, recipient_district, items_subtotal_poisha, delivery_charge_poisha, cod_amount_poisha, stage, tracking_code)
     values ($1, $2, $3, $4, 'messenger', 'ai', 'রিনা', '01812345678', 'মিরপুর', 'Dhaka', 120000, 6000, 126000, 'with_courier', 'TRK-1')`,
    [id, storeId, number, contactId],
  );
  await admin.pool.query(
    "insert into order_items (id, store_id, order_id, variant_id, product_name, variant_title, quantity, unit_price_poisha, is_stock_tracked) values (gen_random_uuid(), $1, $2, $3, 'পাঞ্জাবি', 'Default', 1, 120000, true)",
    [storeId, id, variant!.id],
  );
}

async function toolResult(...args: Parameters<SalesAgentToolsService['run']>) {
  const { result } = await tools.run(...args);
  return result;
}

const run = (storeId: string, contactId: string, name: string, args: object) =>
  toolResult({ storeId, contactId }, name, JSON.stringify(args));

const runInChat = (storeId: string, contactId: string, name: string, args: object) =>
  toolResult(
    { storeId, contactId, chat: { conversationId: randomUUID(), channel: 'messenger' } },
    name,
    JSON.stringify(args),
  );

async function orderShop() {
  const storeId = await shop();
  await admin.pool.query(
    "insert into delivery_zones (id, store_id, name, charge_poisha, bd_area_ids, is_default) values (gen_random_uuid(), $1, 'Inside Dhaka', 6000, '{301}', true)",
    [storeId],
  );
  const productId = await product(storeId, { name: 'পাঞ্জাবি' });
  const {
    rows: [variant],
  } = await admin.pool.query<{ id: string }>(
    'select id from product_variants where store_id = $1 and product_id = $2',
    [storeId, productId],
  );
  return { storeId, variantId: variant!.id };
}

const draft = (variantId: string, fields: object = {}) => ({
  items: [{ variantId, quantity: 2 }],
  recipientName: 'রিনা',
  phone: '01712345678',
  address: 'মিরপুর ১০, রোড ৩',
  area: 'Dhaka',
  ...fields,
});

it('lists every tool for the model with its words and its non-obvious units in the description', () => {
  expect(salesAgentLlmTools.map((tool) => tool.name)).toEqual([
    'search_products',
    'browse_products',
    'get_product',
    'offer_lower_price',
    'get_delivery_charge',
    'search_knowledge',
    'get_my_orders',
    'get_order_status',
    'send_product_card',
    'find_alternatives',
    'join_restock_list',
    'draft_order',
    'confirm_order',
    'hand_over',
  ]);
  const search = salesAgentLlmTools[0]!;
  expect(search.description).toContain('দাম কত');
  expect(search.description).toContain('stock: count of pieces left');
  expect(search.description).not.toContain('converted from poisha');
});

it('finds only active chat-visible products of this store by name or alias, with taka prices and free stock', async () => {
  const storeId = await shop();
  const other = await shop();
  const buyer = await contact(storeId);
  await product(storeId, { name: 'কটন পাঞ্জাবি', aliases: ['panjabi'] });
  await product(storeId, { name: 'Hidden panjabi', status: 'hidden' });
  await product(storeId, { name: 'Private panjabi', chats: false });
  await product(other, { name: 'Other shop panjabi' });
  expect(await run(storeId, buyer, 'search_products', { query: 'panjabi' })).toEqual({
    products: [
      {
        productId: expect.any(String),
        name: 'কটন পাঞ্জাবি',
        category: null,
        description: null,
        photos: [],
        variants: [{ variantId: expect.any(String), title: 'Default', priceTaka: 1200, stock: 8 }],
      },
    ],
  });
});

it('hides a hidden product and another shop product from get_product', async () => {
  const storeId = await shop();
  const other = await shop();
  const buyer = await contact(storeId);
  const hidden = await product(storeId, { name: 'Hidden', status: 'hidden' });
  const foreign = await product(other, { name: 'Foreign' });
  for (const productId of [hidden, foreign])
    expect(await run(storeId, buyer, 'get_product', { productId })).toEqual({
      error: 'PRODUCT_NOT_FOUND',
    });
});

it('gives the charge for a matched place with no zones, and the zones for an unmatched locality', async () => {
  const storeId = await shop();
  const buyer = await contact(storeId);
  await admin.pool.query(
    "insert into delivery_zones (id, store_id, name, charge_poisha, bd_area_ids, is_default) values (gen_random_uuid(), $1, 'Inside Dhaka', 6000, '{301}', false), (gen_random_uuid(), $1, 'Outside Dhaka', 12000, '{}', true)",
    [storeId],
  );
  const zones = expect.arrayContaining([
    { name: 'Inside Dhaka', chargeTaka: 60, isDefault: false },
    { name: 'Outside Dhaka', chargeTaka: 120, isDefault: true },
  ]);
  expect(await run(storeId, buyer, 'get_delivery_charge', { area: 'Dhaka' })).toEqual({
    places: [{ area: 'Dhaka', district: 'Dhaka', chargeTaka: 60 }],
  });
  expect(await run(storeId, buyer, 'get_delivery_charge', { area: 'Nowhereville' })).toEqual({
    places: [],
    zones,
  });
});

it('shows a customer only their own orders and treats another buyer order as missing', async () => {
  const storeId = await shop();
  const rina = await contact(storeId);
  const karim = await contact(storeId);
  await order(storeId, rina, 101);
  await order(storeId, karim, 102);
  expect(await run(storeId, rina, 'get_my_orders', {})).toEqual({
    orders: [
      { orderNumber: 101, stage: 'with_courier', totalTaka: 1260, placedOn: expect.any(String) },
    ],
  });
  expect(await run(storeId, rina, 'get_order_status', { orderNumber: 101 })).toMatchObject({
    orderNumber: 101,
    trackingCode: 'TRK-1',
    totalTaka: 1260,
    items: [{ product: 'পাঞ্জাবি', quantity: 1, unitPriceTaka: 1200 }],
  });
  expect(await run(storeId, rina, 'get_order_status', { orderNumber: 102 })).toEqual({
    error: 'ORDER_NOT_FOUND',
  });
});

it('searches only this store knowledge', async () => {
  const storeId = await shop();
  const other = await shop();
  const buyer = await contact(storeId);
  const vector = JSON.stringify(Array.from({ length: 512 }, () => 0.5));
  for (const [id, text] of [
    [storeId, 'Return within 3 days if unused'],
    [other, 'Secret policy of another shop'],
  ] as const) {
    const itemId = randomUUID();
    await admin.pool.query(
      "insert into knowledge_items (id, store_id, kind, question, answer, status) values ($1, $2, 'policy', 'Return policy', $3, 'active')",
      [itemId, id, text],
    );
    await admin.pool.query(
      'insert into knowledge_chunks (id, store_id, knowledge_item_id, content, embedding, embedding_model, token_count) values (gen_random_uuid(), $1, $2, $3, $4::vector, $5, 5)',
      [id, itemId, text, vector, process.env.AI_EMBEDDING_MODEL ?? 'text-embedding-3-large'],
    );
  }
  const result = (await run(storeId, buyer, 'search_knowledge', { question: 'return policy' })) as {
    passages: { content: string }[];
  };
  expect(result.passages.map(({ content }) => content)).toEqual(['Return within 3 days if unused']);
});

it('counts a use only when the search happens in a real chat', async () => {
  const storeId = await shop();
  const buyer = await contact(storeId);
  const vector = JSON.stringify(Array.from({ length: 512 }, () => 0.5));
  const itemId = randomUUID();
  await admin.pool.query(
    "insert into knowledge_items (id, store_id, kind, question, answer, status) values ($1, $2, 'policy', 'Return policy', 'Return within 3 days', 'active')",
    [itemId, storeId],
  );
  await admin.pool.query(
    'insert into knowledge_chunks (id, store_id, knowledge_item_id, content, embedding, embedding_model, token_count) values (gen_random_uuid(), $1, $2, $3, $4::vector, $5, 5)',
    [
      storeId,
      itemId,
      'Return within 3 days',
      vector,
      process.env.AI_EMBEDDING_MODEL ?? 'text-embedding-3-large',
    ],
  );
  const timesUsed = async () =>
    (
      await admin.pool.query<{ times_used: number }>(
        'select times_used from knowledge_items where id = $1',
        [itemId],
      )
    ).rows[0]!.times_used;
  await run(storeId, buyer, 'search_knowledge', { question: 'return policy' });
  expect(await timesUsed()).toBe(0);
  await runInChat(storeId, buyer, 'search_knowledge', { question: 'return policy' });
  expect(await timesUsed()).toBe(1);
});

it('answers a bad call with a result the model can act on', async () => {
  const storeId = await shop();
  const buyer = await contact(storeId);
  expect(await run(storeId, buyer, 'search_products', { query: 'x' })).toEqual({
    error: 'INVALID_ARGUMENTS',
  });
  expect(await run(storeId, buyer, 'get_my_orders', { contactId: randomUUID() })).toEqual({
    error: 'INVALID_ARGUMENTS',
  });
  expect(await run(storeId, buyer, 'drop_tables', {})).toEqual({ error: 'UNKNOWN_TOOL' });
  expect(
    await run(storeId, buyer, 'hand_over', {
      reason: 'refund',
      summary: 'Order 1042 not received',
    }),
  ).toEqual({ handedOver: true, reason: 'refund', summary: 'Order 1042 not received' });
});

it('takes an order in a chat, prices it in code and waits for the customer to say yes', async () => {
  const { storeId, variantId } = await orderShop();
  const buyer = await contact(storeId);
  const scope = {
    storeId,
    contactId: buyer,
    chat: { conversationId: randomUUID(), channel: 'instagram' as const },
  };
  const args = JSON.stringify(draft(variantId));

  const drafted = await toolResult(scope, 'draft_order', args);
  expect(drafted).toMatchObject({
    stage: 'to_confirm',
    items: [{ product: 'পাঞ্জাবি', quantity: 2, unitPriceTaka: 1200 }],
    deliveryChargeTaka: 60,
    totalTaka: 2460,
  });
  // The same details in the same chat return the order already made.
  expect(await toolResult(scope, 'draft_order', args)).toEqual(drafted);
  const { rows } = await admin.pool.query(
    'select source, created_by_type, buyer_contact_id from orders where store_id = $1',
    [storeId],
  );
  expect(rows).toEqual([{ source: 'instagram', created_by_type: 'ai', buyer_contact_id: buyer }]);

  const { orderNumber } = drafted as { orderNumber: number };
  expect(await run(storeId, buyer, 'confirm_order', { orderNumber })).toEqual({
    orderNumber,
    stage: 'to_pack',
  });
  const {
    rows: [confirmed],
  } = await admin.pool.query(
    'select confirmation_method from orders where store_id = $1 and number = $2',
    [storeId, orderNumber],
  );
  expect(confirmed).toEqual({ confirmation_method: 'chat_reply' });
  // Answering yes twice does not move the order again.
  expect(await run(storeId, buyer, 'confirm_order', { orderNumber })).toEqual({
    error: 'ORDER_STAGE_NOT_ALLOWED',
  });
});

it('confirms the one order waiting for a yes when the model names a number that is not the customer own', async () => {
  const { storeId, variantId } = await orderShop();
  const buyer = await contact(storeId);
  const { orderNumber } = (await runInChat(storeId, buyer, 'draft_order', draft(variantId))) as {
    orderNumber: number;
  };
  expect(await run(storeId, buyer, 'confirm_order', { orderNumber: orderNumber + 1000 })).toEqual({
    orderNumber,
    stage: 'to_pack',
  });
  // Nothing is waiting any more, so a wrong number is still refused.
  expect(await run(storeId, buyer, 'confirm_order', { orderNumber: orderNumber + 1000 })).toEqual({
    error: 'ORDER_NOT_FOUND',
  });
});

it('names add-ons after a confirmed order only when the owner turned them on', async () => {
  const storeId = await shop();
  await admin.pool.query(
    "insert into delivery_zones (id, store_id, name, charge_poisha, bd_area_ids, is_default) values (gen_random_uuid(), $1, 'Inside Dhaka', 6000, '{301}', true)",
    [storeId],
  );
  const category = 'পোশাক';
  const ordered = await product(storeId, { name: 'পাঞ্জাবি', category, pricePoisha: 120000 });
  await product(storeId, { name: 'পোলো শার্ট', category, pricePoisha: 65000 });
  await product(storeId, { name: 'শেষ হয়ে গেছে', category, pricePoisha: 50000, stock: 0 });
  await product(storeId, { name: 'জুতা', category: 'জুতা', pricePoisha: 50000 });
  await product(storeId, { name: 'দামি শেরওয়ানি', category, pricePoisha: 900000 });
  const {
    rows: [variant],
  } = await admin.pool.query<{ id: string }>(
    'select id from product_variants where store_id = $1 and product_id = $2',
    [storeId, ordered],
  );
  const buyer = await contact(storeId);
  const chat = { conversationId: randomUUID(), channel: 'messenger' as const };
  const place = async (address: string, suggestAddOns: boolean) => {
    const scope = { storeId, contactId: buyer, chat, suggestAddOns };
    const drafted = (await toolResult(
      scope,
      'draft_order',
      JSON.stringify(
        draft(variant!.id, { address, items: [{ variantId: variant!.id, quantity: 1 }] }),
      ),
    )) as { orderNumber: number };
    return toolResult(scope, 'confirm_order', JSON.stringify({ orderNumber: drafted.orderNumber }));
  };

  const withAddOns = await place('মিরপুর ১০', true);
  expect(withAddOns).toMatchObject({ stage: 'to_pack' });
  const { addOns } = withAddOns as { addOns: { name: string; variants: object[] }[] };
  expect(addOns.map(({ name }) => name)).toEqual(['পোলো শার্ট']);
  expect(addOns[0]!.variants).toMatchObject([{ priceTaka: 650, stock: 8 }]);

  expect(await place('গুলশান ২', false)).toEqual({
    orderNumber: expect.any(Number),
    stage: 'to_pack',
  });
});

it('saves the own phone on the buyer and shows staff a possible match when another contact holds it', async () => {
  const { storeId, variantId } = await orderShop();
  const rina = await contact(storeId);
  const holder = await contact(storeId);
  await admin.pool.query('update contacts set phone = $2 where id = $1', [holder, '01712345678']);
  await admin.pool.query('update contacts set phone = null where id = $1', [rina]);
  expect(await runInChat(storeId, rina, 'draft_order', draft(variantId))).toHaveProperty(
    'orderNumber',
  );
  const { rows } = await admin.pool.query(
    'select contact_id, matched_contact_id from contact_match_suggestions where store_id = $1',
    [storeId],
  );
  expect(rows).toEqual([{ contact_id: rina, matched_contact_id: holder }]);
  const {
    rows: [buyer],
  } = await admin.pool.query('select phone from contacts where id = $1', [rina]);
  expect(buyer).toEqual({ phone: null });
});

it('answers a draft that cannot be made with a result the model can act on', async () => {
  const { storeId, variantId } = await orderShop();
  const buyer = await contact(storeId);
  expect(await run(storeId, buyer, 'draft_order', draft(variantId))).toEqual({
    error: 'NOT_IN_A_CHAT',
  });
  expect(
    await runInChat(storeId, buyer, 'draft_order', draft(variantId, { area: 'Nowhereville' })),
  ).toEqual({
    error: 'DELIVERY_AREA_INVALID',
  });
  expect(
    await runInChat(storeId, buyer, 'draft_order', draft(variantId, { phone: '12345' })),
  ).toEqual({
    error: 'INVALID_ARGUMENTS',
  });
  const { rows } = await admin.pool.query('select 1 from orders where store_id = $1', [storeId]);
  expect(rows).toEqual([]);
});

it('does not confirm another customer order or an order of a customer who must pay in advance', async () => {
  const { storeId, variantId } = await orderShop();
  const rina = await contact(storeId);
  const karim = await contact(storeId);
  const { orderNumber } = (await runInChat(storeId, rina, 'draft_order', draft(variantId))) as {
    orderNumber: number;
  };
  expect(await run(storeId, karim, 'confirm_order', { orderNumber })).toEqual({
    error: 'ORDER_NOT_FOUND',
  });
  // Three earlier parcels to the same phone, two returned, make the delivery phone high risk.
  for (const [offset, stage] of [
    [1, 'returned'],
    [2, 'returned'],
    [3, 'delivered'],
  ] as const)
    await admin.pool.query(
      `insert into orders (id, store_id, number, buyer_contact_id, source, created_by_type, recipient_name, recipient_phone, recipient_address, recipient_district, stage, items_subtotal_poisha, delivery_charge_poisha, cod_amount_poisha)
       values (gen_random_uuid(), $1, $2, $3, 'manual', 'user', 'রিনা', '01712345678', 'মিরপুর', 'Dhaka', $4, 100, 0, 100)`,
      [storeId, 900 + offset, rina, stage],
    );
  expect(await run(storeId, rina, 'confirm_order', { orderNumber })).toEqual({
    error: 'ORDER_ADVANCE_REQUIRED',
  });
});

// The waiting list keeps the conversation the customer asked in, so it must exist.
async function conversation(storeId: string, contactId: string) {
  const connectionId = randomUUID();
  const id = randomUUID();
  await admin.pool.query(
    "insert into channel_connections (id, store_id, kind, external_account_id, display_name) values ($1::uuid, $2, 'facebook_page', $1::text, 'Tool test')",
    [connectionId, storeId],
  );
  await admin.pool.query(
    "insert into conversations (id, store_id, contact_id, channel_connection_id, channel) values ($1, $2, $3, $4, 'messenger')",
    [id, storeId, contactId, connectionId],
  );
  return id;
}

async function variantOf(storeId: string, productId: string) {
  const {
    rows: [variant],
  } = await admin.pool.query<{ id: string }>(
    'select id from product_variants where store_id = $1 and product_id = $2',
    [storeId, productId],
  );
  return variant!.id;
}

async function askForDiscount(storeId: string, buyer: string, conversationId: string) {
  const identity = randomUUID();
  const message = randomUUID();
  await admin.pool.query(
    `insert into contact_identities (id, store_id, contact_id, channel_connection_id, channel, external_id)
     select $1::uuid, $2, $3, channel_connection_id, 'messenger', $1::text from conversations where id = $4`,
    [identity, storeId, buyer, conversationId],
  );
  await admin.pool.query(
    `insert into messages (id, store_id, conversation_id, direction, author_type, kind, body, status, sender_identity_id)
     values ($1, $2, $3, 'in', 'customer', 'text', 'discount?', 'received', $4)`,
    [message, storeId, conversationId, identity],
  );
  return message;
}

function recordQuote(
  storeId: string,
  conversationId: string,
  ref: string,
  status: 'queued' | 'sent',
) {
  return admin.pool.query(
    `insert into messages (id, store_id, conversation_id, direction, author_type, kind, body, status, sent_at, ai_sources)
     values (gen_random_uuid(), $1, $2, 'out', 'ai', 'text', 'Quote', $3, case when $3='sent' then now() end, $4)`,
    [storeId, conversationId, status, JSON.stringify([{ tool: 'price_offer', refs: [ref] }])],
  );
}

it('offers one price per customer ask and discounts only the draft in that conversation', async () => {
  const { storeId, variantId } = await orderShop();
  const buyer = await contact(storeId);
  const conversationId = await conversation(storeId, buyer);
  const otherConversation = await conversation(storeId, buyer);
  const changed = await admin.pool.query<{ id: string }>(
    `update products set negotiation_enabled=true, negotiation_opening_poisha=110000, negotiation_floor_poisha=95000
     where store_id=$1 returning id`,
    [storeId],
  );
  const chat = { conversationId, channel: 'messenger' as const };
  const scope = { storeId, contactId: buyer, chat, adProductIds: [changed.rows[0]!.id] };
  const turn = () => askForDiscount(storeId, buyer, conversationId);
  const offer = (discountAskMessageId: string) =>
    toolResult(
      { ...scope, chat: { ...chat, discountAskMessageId } },
      'offer_lower_price',
      '{"productName":"পাঞ্জাবি","variantWords":null}',
    );
  const outgoing = (messageId: string, status: 'queued' | 'sent') =>
    recordQuote(storeId, conversationId, `${messageId}:${scope.adProductIds[0]}`, status);
  expect(
    await toolResult(scope, 'offer_lower_price', '{"productName":"পাঞ্জাবি","variantWords":null}'),
  ).toEqual({
    error: 'NOT_A_DISCOUNT_ASK',
  });

  const first = await turn();
  const opening = { kind: 'offered', priceTaka: 1100, isFinal: false };
  const calls = () => offer(first);
  expect(await Promise.all([calls(), calls()])).toEqual([opening, opening]);
  await outgoing(first, 'queued');
  const singleItem = JSON.stringify(draft(variantId, { items: [{ variantId, quantity: 1 }] }));
  expect(await toolResult(scope, 'draft_order', singleItem)).toMatchObject({ totalTaka: 1260 });
  const delivered = await turn();
  expect(await offer(delivered)).toEqual(opening);
  await outgoing(delivered, 'sent');
  const final = await turn();
  expect(await offer(final)).toEqual({ kind: 'offered', priceTaka: 950, isFinal: true });
  await outgoing(final, 'sent');
  expect(await offer(await turn())).toEqual({ kind: 'final' });
  expect(await calls()).toEqual(opening);

  const orderArgs = JSON.stringify(draft(variantId));
  const drafted = await toolResult(scope, 'draft_order', orderArgs);
  expect(drafted).toMatchObject({
    items: [{ unitPriceTaka: 950, lineDiscountTaka: 500, quantity: 2 }],
    totalTaka: 1960,
  });
  expect(await toolResult(scope, 'draft_order', orderArgs)).toEqual(drafted);
  const orders = await admin.pool.query<{ id: string }>(
    'select id from orders where store_id=$1 and number=$2',
    [storeId, (drafted as { orderNumber: number }).orderNumber],
  );
  const detail = await app
    .get(OrdersService)
    .getById(storeId, orders.rows[0]!.id, { seeFullPhone: false });
  expect(detail).toMatchObject({
    items: [{ lineDiscountPoisha: 50000 }],
    timeline: [{ reason: 'AI price offer' }],
  });

  const other = await toolResult(
    { ...scope, chat: { ...chat, conversationId: otherConversation } },
    'draft_order',
    orderArgs,
  );
  expect(other).toMatchObject({ totalTaka: 2460 });

  await admin.pool.query('update product_variants set price_override_poisha = 130000 where id=$1', [
    variantId,
  ]);
  expect(await offer(await turn())).toEqual({ kind: 'fixed', pricesTaka: [1300] });
  expect(
    await toolResult(
      scope,
      'draft_order',
      JSON.stringify(draft(variantId, { address: 'Changed variant price' })),
    ),
  ).toMatchObject({ totalTaka: 2660 });
  await admin.pool.query('update product_variants set price_override_poisha = null where id=$1', [
    variantId,
  ]);
  await admin.pool.query(
    "update price_offers set expires_at = now() - interval '1 second' where store_id=$1",
    [storeId],
  );
  expect(
    await toolResult(
      scope,
      'draft_order',
      JSON.stringify(
        draft(variantId, { items: [{ variantId, quantity: 1 }], address: 'আরেকটি ঠিকানা' }),
      ),
    ),
  ).toMatchObject({ totalTaka: 1260 });
  expect(await calls()).toEqual({ kind: 'fixed', pricesTaka: [1200] });
  expect(await offer(await turn())).toEqual(opening);
});

it('lowers an existing draft after a sent offer and keeps that draft and discount on retry', async () => {
  const { storeId, variantId } = await orderShop();
  const buyer = await contact(storeId);
  const conversationId = await conversation(storeId, buyer);
  const changed = await admin.pool.query<{ id: string }>(
    `update products set negotiation_enabled=true, negotiation_opening_poisha=110000, negotiation_floor_poisha=95000
     where store_id=$1 returning id`,
    [storeId],
  );
  const productId = changed.rows[0]!.id;
  const chat = { conversationId, channel: 'messenger' as const };
  const scope = { storeId, contactId: buyer, chat, adProductIds: [productId] };
  const args = JSON.stringify(draft(variantId));
  const first = (await toolResult(scope, 'draft_order', args)) as { orderNumber: number };
  expect(first).toMatchObject({ totalTaka: 2460, stage: 'to_confirm' });

  const customerMessageId = await askForDiscount(storeId, buyer, conversationId);
  await toolResult(
    { ...scope, chat: { ...chat, discountAskMessageId: customerMessageId } },
    'offer_lower_price',
    '{"productName":"পাঞ্জাবি","variantWords":null}',
  );
  await recordQuote(storeId, conversationId, `${customerMessageId}:${productId}`, 'queued');
  expect(await toolResult(scope, 'draft_order', args)).toEqual(first);
  await recordQuote(storeId, conversationId, `${customerMessageId}:${productId}`, 'sent');

  const rows = await admin.pool.query<{ id: string }>(
    'select id from orders where store_id=$1 and number=$2',
    [storeId, first.orderNumber],
  );
  const orders = app.get(OrdersService);
  const orderId = rows.rows[0]!.id;
  const staff = { actor: { kind: 'system' as const }, access: { seeFullPhone: false } };
  await orders.editOrder(storeId, orderId, { orderDiscountPoisha: 235000 }, staff);
  expect(await toolResult(scope, 'draft_order', args)).toMatchObject({ totalTaka: 110 });
  await orders.editOrder(storeId, orderId, { orderDiscountPoisha: 0 }, staff);

  const repriced = await toolResult(scope, 'draft_order', args);
  expect(repriced).toMatchObject({
    orderNumber: first.orderNumber,
    stage: 'to_confirm',
    items: [{ unitPriceTaka: 1100, lineDiscountTaka: 200, quantity: 2 }],
    totalTaka: 2260,
  });
  expect(await toolResult(scope, 'draft_order', args)).toEqual(repriced);
  const order = await orders.getById(storeId, orderId, staff.access);
  expect(order.timeline.filter(({ reason }) => reason === 'AI price offer')).toHaveLength(1);

  const finalAsk = await askForDiscount(storeId, buyer, conversationId);
  expect(
    await toolResult(
      { ...scope, chat: { ...chat, discountAskMessageId: finalAsk } },
      'offer_lower_price',
      '{"productName":"পাঞ্জাবি","variantWords":null}',
    ),
  ).toEqual({ kind: 'offered', priceTaka: 950, isFinal: true });
  await admin.pool.query(
    "update price_offers set expires_at = now() - interval '1 second' where store_id=$1 and customer_message_id=$2",
    [storeId, customerMessageId],
  );
  expect(await toolResult(scope, 'draft_order', args)).toEqual(repriced);

  await orders.changeStage(storeId, orderId, { to: 'to_pack' }, staff);
  await recordQuote(storeId, conversationId, `${finalAsk}:${productId}`, 'sent');
  expect(await toolResult(scope, 'draft_order', args)).toMatchObject({
    orderNumber: first.orderNumber,
    stage: 'to_pack',
    totalTaka: 2260,
  });
});

it('keeps an existing draft when an offer was made on a different regular price', async () => {
  const { storeId, variantId } = await orderShop();
  const buyer = await contact(storeId);
  const conversationId = await conversation(storeId, buyer);
  const productId = (
    await admin.pool.query<{ id: string }>(
      'select product_id as id from product_variants where id=$1',
      [variantId],
    )
  ).rows[0]!.id;
  const chat = { conversationId, channel: 'messenger' as const };
  const scope = { storeId, contactId: buyer, chat, adProductIds: [productId] };
  const args = JSON.stringify(draft(variantId));
  const first = await toolResult(scope, 'draft_order', args);
  expect(first).toMatchObject({ totalTaka: 2460, stage: 'to_confirm' });

  await admin.pool.query(
    `update products set price_poisha=130000, negotiation_enabled=true,
       negotiation_opening_poisha=110000, negotiation_floor_poisha=95000
     where store_id=$1 and id=$2`,
    [storeId, productId],
  );
  const customerMessageId = await askForDiscount(storeId, buyer, conversationId);
  expect(
    await toolResult(
      { ...scope, chat: { ...chat, discountAskMessageId: customerMessageId } },
      'offer_lower_price',
      '{"productName":"পাঞ্জাবি","variantWords":null}',
    ),
  ).toEqual({ kind: 'offered', priceTaka: 1100, isFinal: false });
  await recordQuote(storeId, conversationId, `${customerMessageId}:${productId}`, 'sent');

  expect(await toolResult(scope, 'draft_order', args)).toEqual(first);
});

it('enforces store isolation on price offers with app-role RLS', async () => {
  const storeId = await shop();
  const otherStoreId = await shop();
  const buyer = await contact(storeId);
  const conversationId = await conversation(storeId, buyer);
  const productId = await product(storeId, { name: 'Isolation scarf' });
  const customerMessageId = await askForDiscount(storeId, buyer, conversationId);
  const client = createDatabase(process.env.DATABASE_URL!);
  const tenant = new TenantDatabase(client.db);
  const insert = sql`insert into price_offers (id,store_id,conversation_id,contact_id,product_id,customer_message_id,offered_price_poisha,step,expires_at)
    values (gen_random_uuid(),${storeId},${conversationId},${buyer},${productId},${customerMessageId},100,'opening',now())`;
  try {
    await expect(tenant.forStore(otherStoreId, (tx) => tx.execute(insert))).rejects.toMatchObject({
      cause: { code: '42501' },
    });
    await tenant.forStore(storeId, (tx) => tx.execute(insert));
    const visible = (scope: string) =>
      tenant.forStore(scope, (tx) => tx.execute(sql`select store_id from price_offers`));
    expect((await visible(storeId)).rows).toEqual([{ store_id: storeId }]);
    expect((await visible(otherStoreId)).rows).toEqual([]);
  } finally {
    await client.pool.end();
  }
});

it('offers in-stock products of the same category for a sold-out one, never another shop or category', async () => {
  const storeId = await shop();
  const other = await shop();
  const buyer = await contact(storeId);
  // Stock 2 with 2 reserved leaves nothing to sell.
  const soldOut = await product(storeId, { name: 'স্নিকার্স', category: 'জুতা', stock: 2 });
  await product(storeId, { name: 'ক্যানভাস জুতা', category: 'জুতা', pricePoisha: 150000 });
  await product(storeId, { name: 'লোফার', category: 'জুতা', stock: 2 });
  await product(storeId, { name: 'শাড়ি', category: 'শাড়ি' });
  await product(other, { name: 'Other canvas', category: 'জুতা' });
  const result = (await run(storeId, buyer, 'find_alternatives', { productId: soldOut })) as {
    alternatives: { name: string; variants: { stock: number }[] }[];
    soldOutVariants: { variantId: string }[];
  };
  expect(result.alternatives.map(({ name }) => name)).toEqual(['ক্যানভাস জুতা']);
  expect(result.alternatives[0]!.variants.every(({ stock }) => stock > 0)).toBe(true);
  expect(result.soldOutVariants).toEqual([
    { variantId: await variantOf(storeId, soldOut), title: 'Default' },
  ]);
});

it('brings the alternatives of a sold-out search result, once each and never a product already found', async () => {
  const storeId = await shop();
  const buyer = await contact(storeId);
  await product(storeId, { name: 'স্নিকার্স', aliases: ['sneakers'], category: 'জুতা', stock: 2 });
  await product(storeId, { name: 'ক্যানভাস জুতা', category: 'জুতা', pricePoisha: 150000 });
  const result = (await run(storeId, buyer, 'search_products', { query: 'sneakers' })) as {
    products: { name: string }[];
    alternatives: { name: string }[];
  };
  expect(result.products.map(({ name }) => name)).toEqual(['স্নিকার্স']);
  expect(result.alternatives.map(({ name }) => name)).toEqual(['ক্যানভাস জুতা']);
  const inStock = (await run(storeId, buyer, 'search_products', { query: 'canvas' })) as object;
  expect(inStock).not.toHaveProperty('alternatives');
});

it('puts a customer on the restock list once, only for a sold-out size, only in a chat', async () => {
  const storeId = await shop();
  const buyer = await contact(storeId);
  const conversationId = await conversation(storeId, buyer);
  const inChat = (name: string, args: object) =>
    toolResult(
      { storeId, contactId: buyer, chat: { conversationId, channel: 'messenger' } },
      name,
      JSON.stringify(args),
    );
  const soldOut = await variantOf(storeId, await product(storeId, { name: 'স্নিকার্স', stock: 2 }));
  const available = await variantOf(storeId, await product(storeId, { name: 'কুর্তি' }));
  expect(await run(storeId, buyer, 'join_restock_list', { variantId: soldOut })).toEqual({
    error: 'NOT_IN_A_CHAT',
  });
  expect(await inChat('join_restock_list', { variantId: available })).toEqual({
    error: 'RESTOCK_VARIANT_IN_STOCK',
  });
  expect(await inChat('join_restock_list', { variantId: soldOut })).toEqual({
    onWaitingList: true,
    variantId: soldOut,
  });
  await inChat('join_restock_list', { variantId: soldOut });
  const { rows } = await admin.pool.query(
    'select 1 from restock_requests where store_id = $1 and variant_id = $2',
    [storeId, soldOut],
  );
  expect(rows).toHaveLength(1);
  expect(await runInChat(await shop(), buyer, 'join_restock_list', { variantId: soldOut })).toEqual(
    { error: 'PRODUCT_VARIANT_NOT_FOUND' },
  );
});

it('limits search and product reads to the ad’s products, and reads their price and stock now', async () => {
  const storeId = await shop();
  const buyer = await contact(storeId);
  const inAd = await product(storeId, { name: 'Ad panjabi', aliases: ['panjabi'], stock: 5 });
  const outsideAd = await product(storeId, { name: 'Shop panjabi', aliases: ['panjabi'] });
  const scope = { storeId, contactId: buyer, adProductIds: [inAd] };
  const call = (name: string, args: object) => toolResult(scope, name, JSON.stringify(args));

  expect(await call('search_products', { query: 'panjabi' })).toEqual({
    products: [expect.objectContaining({ productId: inAd })],
  });
  expect(await call('search_products', { query: 'kurti' })).toEqual({ products: [] });
  expect(await call('get_product', { productId: outsideAd })).toEqual({
    error: 'NOT_AN_AD_PRODUCT',
  });
  expect(await call('get_product', { productId: inAd })).toMatchObject({ productId: inAd });
  expect(await tools.adProducts(scope, [inAd, outsideAd])).toEqual([
    expect.objectContaining({
      productId: inAd,
      variants: [expect.objectContaining({ priceTaka: 1200, stock: 3 })],
    }),
    expect.objectContaining({ productId: outsideAd }),
  ]);
});
