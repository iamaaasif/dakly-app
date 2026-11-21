import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule } from '@nestjs/bullmq';
import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { ClockModule } from '../platform/clock.module';
import { loadEnv } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { AiAgentModule } from './ai-agent.module';
import { SalesAgentToolsService, salesAgentLlmTools } from './sales-agent-tools.service';

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

async function product(
  storeId: string,
  fields: { name: string; aliases?: string[]; status?: string; chats?: boolean; stock?: number },
) {
  const id = randomUUID();
  await admin.pool.query(
    'insert into products (id, store_id, name, aliases, status, is_visible_in_chats, price_poisha) values ($1, $2, $3, $4, $5, $6, 120000)',
    [
      id,
      storeId,
      fields.name,
      fields.aliases ?? [],
      fields.status ?? 'active',
      fields.chats ?? true,
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

const run = (storeId: string, contactId: string, name: string, args: object) =>
  tools.run({ storeId, contactId }, name, JSON.stringify(args));

const runInChat = (storeId: string, contactId: string, name: string, args: object) =>
  tools.run(
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

it('lists every tool for the model with its words and units in the description', () => {
  expect(salesAgentLlmTools.map((tool) => tool.name)).toEqual([
    'search_products',
    'get_product',
    'get_delivery_charge',
    'search_knowledge',
    'get_my_orders',
    'get_order_status',
    'send_product_card',
    'draft_order',
    'confirm_order',
    'hand_over',
  ]);
  const search = salesAgentLlmTools[0]!;
  expect(search.description).toContain('দাম কত');
  expect(search.description).toContain('priceTaka: taka, converted from poisha.');
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
  expect(await run(storeId, buyer, 'hand_over', { reason: 'refund' })).toEqual({
    handedOver: true,
    reason: 'refund',
  });
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

  const drafted = await tools.run(scope, 'draft_order', args);
  expect(drafted).toMatchObject({
    stage: 'to_confirm',
    items: [{ product: 'পাঞ্জাবি', quantity: 2, unitPriceTaka: 1200 }],
    deliveryChargeTaka: 60,
    totalTaka: 2460,
  });
  // The same details in the same chat return the order already made.
  expect(await tools.run(scope, 'draft_order', args)).toEqual(drafted);
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
