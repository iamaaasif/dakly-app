import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { TriggerKey } from '@dakly/contracts/automations/catalogue';
import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { createDatabase } from '@dakly/db/client';

import { CommentPostProductsService } from '../comments/comment-post-products.service';
import { CommentsService } from '../comments/comments.service';
import { ContactsModule } from '../contacts/contacts.module';
import { ConversationIntentService } from '../messaging/conversation-intent.service';
import { OrdersModule } from '../orders/orders.module';
import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { SegmentsModule } from '../segments/segments.module';
import { AutomationEntryRepository } from './automation-entry.repository';
import { AutomationEntryService } from './automation-entry.service';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const contactId = randomUUID();
const productId = randomUUID();
const variantId = randomUUID();
const publishedAt = new Date('2026-11-19T10:00:00.000Z');
const eventAt = new Date('2026-11-20T10:00:00.000Z');

type TriggerFilters = AutomationGraph['trigger']['filters'];

async function workflow(key: TriggerKey, filters: TriggerFilters = []) {
  const id = randomUUID();
  const version = randomUUID();
  const graph: AutomationGraph = {
    trigger: { key, filters },
    reEntry: { rule: 'every_time' },
    workflowFilters: [],
    goal: null,
    exitConditions: [],
    firstStepKey: 'end',
    steps: { end: { kind: 'exit' } },
  };
  await admin.pool.query(
    "insert into automations(id,store_id,name,trigger_type,status,draft_graph) values($1,$2,'অর্ডার',$4,'active',$3)",
    [id, storeId, graph, key],
  );
  await admin.pool.query(
    'insert into automation_versions(id,store_id,automation_id,version,graph,published_at) values($1,$2,$3,1,$4,$5)',
    [version, storeId, id, graph, publishedAt],
  );
  await admin.pool.query('update automations set published_version_id=$2 where id=$1', [
    id,
    version,
  ]);
  return id;
}

async function order(number: number, values: { buyer?: string | null; subtotal?: number } = {}) {
  const id = randomUUID();
  await admin.pool.query(
    `insert into orders(id,store_id,number,buyer_contact_id,source,created_by_type,stage,
       recipient_name,recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,
       delivery_charge_poisha,cod_amount_poisha)
     values($1,$2,$3,$4,'manual','user','to_confirm','রিনা','01710000005','Mirpur','Dhaka',$5,6000,$6)`,
    [
      id,
      storeId,
      number,
      values.buyer === undefined ? contactId : values.buyer,
      values.subtotal ?? 100000,
      (values.subtotal ?? 100000) + 6000,
    ],
  );
  await admin.pool.query(
    `insert into order_items(id,store_id,order_id,variant_id,product_name,variant_title,quantity,unit_price_poisha,is_stock_tracked)
     values($1,$2,$3,$4,'শাড়ি','লাল',1,100000,false)`,
    [randomUUID(), storeId, id, variantId],
  );
  return id;
}

describe('order triggers (Postgres)', () => {
  let app: INestApplicationContext;
  let entries: AutomationEntryService;
  const placed = (orderId: string, id = randomUUID()) =>
    entries.startMatchingOrder(storeId, {
      id,
      type: 'order.created',
      occurredAt: eventAt.toISOString(),
      payload: { orderId },
    });
  const moved = (orderId: string, to: 'with_courier' | 'to_pack') =>
    entries.startMatchingOrder(storeId, {
      id: randomUUID(),
      type: 'order.stage_changed',
      occurredAt: eventAt.toISOString(),
      payload: { orderId, from: 'to_pack', to },
    });
  const runs = async (id: string) =>
    (await admin.pool.query('select 1 from automation_runs where automation_id=$1', [id])).rowCount;

  beforeAll(async () => {
    await admin.pool.query("insert into stores(id,name) values($1,'রিনার দোকান')", [storeId]);
    await admin.pool.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা আক্তার','manual','customer')",
      [contactId, storeId],
    );
    await admin.pool.query("insert into products(id,store_id,name) values($1,$2,'শাড়ি')", [
      productId,
      storeId,
    ]);
    await admin.pool.query(
      "insert into product_variants(id,store_id,product_id,title) values($1,$2,$3,'লাল')",
      [variantId, storeId, productId],
    );
    class TestModule {}
    Module({
      imports: [DatabaseModule, ContactsModule, OrdersModule, SegmentsModule],
      providers: [
        AutomationEntryService,
        AutomationEntryRepository,
        { provide: Clock, useValue: { now: () => eventAt } },
        { provide: ConversationIntentService, useValue: {} },
        { provide: CommentsService, useValue: {} },
        { provide: CommentPostProductsService, useValue: {} },
      ],
    })(TestModule);
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    entries = app.get(AutomationEntryService);
  });

  afterAll(async () => {
    try {
      await app?.close();
      await admin.pool.query('delete from automation_runs where store_id=$1', [storeId]);
      await admin.pool.query('update automations set published_version_id=null where store_id=$1', [
        storeId,
      ]);
      await admin.pool.query('delete from outbox_events where store_id=$1', [storeId]);
      for (const table of [
        'automation_versions',
        'automations',
        'order_items',
        'orders',
        'product_variants',
        'products',
        'contacts',
        'stores',
      ])
        await admin.pool.query(
          `delete from ${table} where ${table === 'stores' ? 'id' : 'store_id'}=$1`,
          [storeId],
        );
    } finally {
      await admin.pool.end();
    }
  });

  it('starts a run for the buyer when an order is placed, once per event', async () => {
    const id = await workflow('order_placed');
    const orderId = await order(1);
    const eventId = randomUUID();
    await placed(orderId, eventId);
    await placed(orderId, eventId);
    expect(await runs(id)).toBe(1);
    const started = await admin.pool.query(
      'select trigger_order_id from automation_runs where automation_id=$1',
      [id],
    );
    expect(started.rows).toEqual([{ trigger_order_id: orderId }]);
  });

  it('starts nothing for an order whose buyer was purged', async () => {
    const id = await workflow('order_placed', [
      { field: 'order_total', operator: 'at_least', amountPoisha: 1 },
    ]);
    await placed(await order(2, { buyer: null }));
    expect(await runs(id)).toBe(0);
  });

  it('checks the order total, first order and product filters at entry', async () => {
    const big = await workflow('order_placed', [
      { field: 'order_total', operator: 'at_least', amountPoisha: 500000 },
    ]);
    const first = await workflow('order_placed', [{ field: 'first_order' }]);
    const bought = await workflow('order_placed', [{ field: 'product', productIds: [productId] }]);
    const other = await workflow('order_placed', [
      { field: 'product', productIds: [randomUUID()] },
    ]);
    await placed(await order(3));
    // Order 1 above came first, so order 3 is a repeat purchase.
    expect([await runs(big), await runs(first), await runs(bought), await runs(other)]).toEqual([
      0, 0, 1, 0,
    ]);
    const bigOrder = await order(4, { subtotal: 600000 });
    await placed(bigOrder);
    expect(await runs(big)).toBe(1);
  });

  it('maps a move to With courier to the shipped trigger and ignores other stages', async () => {
    const shipped = await workflow('order_shipped');
    const orderId = await order(5);
    await moved(orderId, 'to_pack');
    expect(await runs(shipped)).toBe(0);
    await moved(orderId, 'with_courier');
    expect(await runs(shipped)).toBe(1);
  });
});
