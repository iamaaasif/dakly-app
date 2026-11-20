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
      'ai_runs',
      'knowledge_chunks',
      'knowledge_items',
      'order_items',
      'orders',
      'delivery_zones',
      'product_variants',
      'products',
      'contacts',
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

it('lists every tool for the model with its words and units in the description', () => {
  expect(salesAgentLlmTools.map((tool) => tool.name)).toEqual([
    'search_products',
    'get_product',
    'get_delivery_charge',
    'search_knowledge',
    'get_my_orders',
    'get_order_status',
    'send_product_card',
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

it('gives the charge for a named place and the shop zones for any place', async () => {
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
    zones,
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
      [id, itemId, text, vector, process.env.AI_EMBEDDING_MODEL ?? 'text-embedding-3-small'],
    );
  }
  const result = (await run(storeId, buyer, 'search_knowledge', { question: 'return policy' })) as {
    passages: { content: string }[];
  };
  expect(result.passages.map(({ content }) => content)).toEqual(['Return within 3 days if unused']);
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
