import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createOrderSchema, editOrderSchema, type CreateOrderInput } from '@dakly/contracts/orders';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { DeliveryModule } from '../delivery/delivery.module';
import { DeliveryService } from '../delivery/delivery.service';
import { DatabaseModule } from '../platform/database/database.module';
import { StoreTransaction } from '../platform/database/store-transaction';
import { TenantDatabase } from '../platform/database/tenant-database';
import { OrdersModule } from './orders.module';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

class TestModule {}
Module({ imports: [DatabaseModule, DeliveryModule, OrdersModule] })(TestModule);

describe('Staff order creation', () => {
  const f = new OwnerIsolationFixture();
  let app: INestApplicationContext;
  let orders: OrdersService;

  const editor = () => ({
    actor: { kind: 'user', userId: f.userA } as const,
    access: { seeFullPhone: true },
    idempotencyKey: randomUUID(),
  });

  beforeAll(async () => {
    await f.setup();
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    orders = app.get(OrdersService);
    await f.connection.pool.query('insert into store_counters (store_id) values ($1)', [f.a]);
    await app.get(DeliveryService).initializeDefaults(f.a, editor().actor);
  });

  afterAll(async () => {
    for (const table of [
      'orders',
      'outbox_events',
      'stock_movements',
      'contacts',
      'product_variants',
      'products',
      'delivery_zones',
      'store_counters',
    ])
      await f.connection.pool.query(`delete from ${table} where store_id=$1`, [f.a]);
    await app.close();
    await f.close();
  });

  async function variant(stock: number): Promise<string> {
    const productId = randomUUID();
    const variantId = randomUUID();
    await f.connection.pool.query(
      "insert into products(id,store_id,name,is_stock_tracked,price_poisha) values ($1,$2,'Panjabi',true,125000)",
      [productId, f.a],
    );
    await f.connection.pool.query(
      "insert into product_variants(id,store_id,product_id,title,on_hand) values ($1,$2,$3,'M',$4)",
      [variantId, f.a, productId, stock],
    );
    return variantId;
  }

  function draft(variantId: string, change: Partial<CreateOrderInput> = {}): CreateOrderInput {
    return createOrderSchema.parse({
      buyer: { name: 'Rahim' },
      recipient: { name: 'Rahim', phone: '01712458903', address: 'Dhanmondi', areaId: 301 },
      items: [{ variantId, quantity: 1 }],
      ...change,
    });
  }

  async function buyer(name: string, phone: string | null = null): Promise<string> {
    const id = randomUUID();
    await f.connection.pool.query(
      "insert into contacts(id,store_id,name,phone,source,kind) values ($1,$2,$3,$4,'messenger','chat_only')",
      [id, f.a, name, phone],
    );
    return id;
  }

  it('records a manual advance, computes COD and reuses the order on a retry', async () => {
    const variantId = await variant(2);
    const input = draft(variantId, { advancePaidPoisha: 20000 });
    const request = editor();
    const first = await orders.createOrder(f.a, input, request);
    expect(first).toMatchObject({
      number: 1001,
      stage: 'to_confirm',
      itemsSubtotalPoisha: 125000,
      deliveryChargePoisha: 6000,
      advancePaidPoisha: 20000,
      codAmountPoisha: 111000,
      paymentStatus: 'advance_paid',
      items: [{ variantId, quantity: 1, unitPricePoisha: 125000 }],
    });
    expect(await orders.createOrder(f.a, input, request)).toEqual(first);
    expect(await f.row('product_variants', variantId)).toMatchObject({ reserved: 1 });
  });

  it('caps an overpayment at zero COD and rejects a discount above the items subtotal', async () => {
    const variantId = await variant(1);
    const items = [{ variantId, quantity: 1, lineDiscountPoisha: 500 }];
    const buyer = { name: 'Discount boundary buyer' };
    const request = editor();
    await expect(
      orders.createOrder(
        f.a,
        draft(variantId, { buyer, items, orderDiscountPoisha: 124501 }),
        request,
      ),
    ).rejects.toMatchObject({ code: 'ORDER_TOTAL_INVALID' });
    const contacts = await f.connection.pool.query(
      'select id from contacts where store_id=$1 and name=$2',
      [f.a, buyer.name],
    );
    expect(contacts.rows).toEqual([]);
    await expect(
      orders.createOrder(
        f.a,
        draft(variantId, { buyer, items, orderDiscountPoisha: 124500, advancePaidPoisha: 7000 }),
        request,
      ),
    ).resolves.toMatchObject({ itemsSubtotalPoisha: 124500, codAmountPoisha: 0 });
  });

  it('sets refund due when staff cancel after recording an advance', async () => {
    const variantId = await variant(2);
    const request = editor();
    const created = await orders.createOrder(
      f.a,
      draft(variantId, { advancePaidPoisha: 20000 }),
      request,
    );
    await expect(
      orders.changeStage(
        f.a,
        created.id,
        { to: 'cancelled', reason: 'customer_cancelled' },
        request,
      ),
    ).resolves.toMatchObject({
      stage: 'cancelled',
      paymentStatus: 'refund_due',
      advancePaidPoisha: 20000,
      timeline: [{ from: 'to_confirm', to: 'cancelled', reason: 'customer_cancelled' }],
    });
    expect(await f.row('product_variants', variantId)).toMatchObject({ reserved: 0 });
  });

  it('changes stock by the item difference, keeps prior prices, and rolls back an unavailable edit', async () => {
    const variantId = await variant(4);
    const request = editor();
    const initial = await orders.createOrder(f.a, draft(variantId), request);
    await f.connection.pool.query(
      'update products set price_poisha=140000 where id=(select product_id from product_variants where id=$1)',
      [variantId],
    );
    const edit = (quantity: number) =>
      orders.editOrder(
        f.a,
        initial.id,
        editOrderSchema.parse({ items: [{ variantId, quantity }], orderDiscountPoisha: 10000 }),
        request,
      );
    const changed = await edit(2);
    expect(changed).toMatchObject({
      items: [{ id: initial.items[0]!.id, quantity: 2, unitPricePoisha: 125000 }],
      itemsSubtotalPoisha: 250000,
      codAmountPoisha: 246000,
    });
    expect(await f.row('product_variants', variantId)).toMatchObject({ reserved: 2 });
    await expect(edit(5)).rejects.toMatchObject({ code: 'STOCK_NOT_AVAILABLE' });
    expect(await orders.getById(f.a, initial.id, request.access)).toEqual(changed);
    expect(await f.row('product_variants', variantId)).toMatchObject({ reserved: 2 });
    expect((await edit(1)).items[0]).toMatchObject({ quantity: 1 });
    expect(await f.row('product_variants', variantId)).toMatchObject({ reserved: 1 });
  });

  it('replaces duplicate legacy lines without keeping a released reservation on the order', async () => {
    const variantId = await variant(2);
    const request = editor();
    const order = await orders.createOrder(f.a, draft(variantId), request);
    await f.connection.pool.query(
      `insert into order_items(id,store_id,order_id,variant_id,product_name,variant_title,quantity,unit_price_poisha,is_stock_tracked)
       select $3::uuid,store_id,order_id,variant_id,product_name,variant_title,quantity,unit_price_poisha,is_stock_tracked
       from order_items where store_id=$1 and order_id=$2`,
      [f.a, order.id, randomUUID()],
    );
    await f.connection.pool.query(
      'update product_variants set reserved=2 where store_id=$1 and id=$2',
      [f.a, variantId],
    );
    const changed = await orders.editOrder(
      f.a,
      order.id,
      editOrderSchema.parse({ items: [{ variantId, quantity: 1 }] }),
      request,
    );
    expect(changed.items).toHaveLength(1);
    expect(changed.itemsSubtotalPoisha).toBe(125000);
    expect(await f.row('product_variants', variantId)).toMatchObject({ reserved: 1 });
  });

  it('links a duplicate during an edit while cancellation holds the other order lock', async () => {
    const variantId = await variant(2);
    const request = editor();
    const original = draft(variantId);
    const duplicate = await orders.createOrder(f.a, original, request);
    const edit = await orders.createOrder(
      f.a,
      draft(variantId, { recipient: { ...original.recipient, phone: '01712458910' } }),
      editor(),
    );
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const cancel = app.get(StoreTransaction).run(f.a, async () => {
      await app.get(OrdersRepository).lock(f.a, duplicate.id);
      entered.resolve();
      await release.promise;
      return orders.changeStage(f.a, duplicate.id, { to: 'cancelled', reason: 'other' }, request);
    });
    await entered.promise;
    try {
      const edited = await app.get(TenantDatabase).forStore(f.a, async (tx) => {
        await tx.execute(sql`set local lock_timeout = '2500ms'`);
        return orders.editOrder(
          f.a,
          edit.id,
          editOrderSchema.parse({
            items: original.items,
            recipient: { phone: original.recipient.phone },
          }),
          request,
        );
      });
      expect(edited.possibleDuplicateOfOrderId).toBe(duplicate.id);
    } finally {
      release.resolve();
      await cancel;
    }
    expect(await f.row('product_variants', variantId)).toMatchObject({ reserved: 1 });
  });

  it('counts each purchase under its buyer when two people order for each other', async () => {
    const variantId = await variant(3);
    const rahimId = await buyer('Rahim');
    const karimId = await buyer('Karim', '01711110031');
    const forKarim = {
      name: 'Karim',
      phone: '01711110031',
      address: 'Dhanmondi',
      areaId: 301,
      isBuyer: false,
    };
    const forRahim = {
      name: 'Rahim',
      phone: '01711110032',
      address: 'Mirpur',
      areaId: 301,
      isBuyer: false,
    };
    const request = editor();
    const first = await orders.createOrder(
      f.a,
      draft(variantId, { buyer: { contactId: rahimId }, recipient: forKarim }),
      request,
    );
    const second = await orders.createOrder(
      f.a,
      draft(variantId, { buyer: { contactId: karimId }, recipient: forRahim }),
      editor(),
    );
    expect(first).toMatchObject({
      buyerContactId: rahimId,
      buyerName: 'Rahim',
      recipientName: 'Karim',
      recipientPhone: forKarim.phone,
    });
    expect(second).toMatchObject({
      buyerContactId: karimId,
      buyerName: 'Karim',
      recipientName: 'Rahim',
      recipientPhone: forRahim.phone,
    });
    const edited = await orders.editOrder(
      f.a,
      first.id,
      editOrderSchema.parse({
        items: [{ variantId, quantity: 1 }],
        recipient: { ...forKarim, phone: '01711110033' },
      }),
      request,
    );
    expect(edited).toMatchObject({ buyerContactId: rahimId, recipientPhone: '01711110033' });
    await orders.changeStage(f.a, first.id, { to: 'to_pack' }, request);
    expect(await f.row('contacts', rahimId)).toMatchObject({ phone: null });
    expect(await f.row('contacts', karimId)).toMatchObject({ phone: forKarim.phone });
    const purchases = await f.connection.pool.query(
      'select buyer_contact_id, count(*)::int as purchases from orders where store_id=$1 and buyer_contact_id=any($2) group by buyer_contact_id',
      [f.a, [rahimId, karimId]],
    );
    expect(purchases.rows).toEqual(
      expect.arrayContaining([
        { buyer_contact_id: rahimId, purchases: 1 },
        { buyer_contact_id: karimId, purchases: 1 },
      ]),
    );
  });

  it('saves an unused own phone, keeps its snapshot, and suggests a match when the phone is taken', async () => {
    const variantId = await variant(3);
    const rahimId = await buyer('Rahim');
    const phone = '01711110034';
    const request = editor();
    const initial = await orders.createOrder(
      f.a,
      draft(variantId, {
        buyer: { contactId: rahimId },
        recipient: { name: 'Rahim', phone, address: 'Mirpur', areaId: 301, isBuyer: true },
      }),
      request,
    );
    expect(await f.row('contacts', rahimId)).toMatchObject({ phone, phone_verified_at: null });
    const editedPhone = '01711110035';
    await f.connection.pool.query('update contacts set phone=$1 where store_id=$2 and id=$3', [
      editedPhone,
      f.a,
      rahimId,
    ]);
    expect(await orders.getById(f.a, initial.id, request.access)).toMatchObject({
      recipientPhone: phone,
    });
    const karimId = await buyer('Karim');
    const conflicting = await orders.createOrder(
      f.a,
      draft(variantId, {
        buyer: { contactId: karimId },
        recipient: {
          name: 'Karim',
          phone: editedPhone,
          address: 'Dhanmondi',
          areaId: 301,
          isBuyer: true,
        },
      }),
      editor(),
    );
    expect(conflicting).toMatchObject({ buyerContactId: karimId, recipientPhone: editedPhone });
    expect(await f.row('contacts', rahimId)).toMatchObject({ phone: editedPhone });
    expect(await f.row('contacts', karimId)).toMatchObject({ phone: null });
    const suggestions = await f.connection.pool.query(
      'select contact_id,matched_contact_id,reason from contact_match_suggestions where store_id=$1 and order_id=$2',
      [f.a, conflicting.id],
    );
    expect(suggestions.rows).toEqual([
      { contact_id: karimId, matched_contact_id: rahimId, reason: 'same_phone' },
    ]);
    const consents = await f.connection.pool.query(
      'select id from consents where store_id=$1 and contact_id=any($2)',
      [f.a, [rahimId, karimId]],
    );
    expect(consents.rows).toEqual([]);
    expect(await orders.changeStage(f.a, conflicting.id, { to: 'to_pack' }, request)).toMatchObject(
      {
        stage: 'to_pack',
        buyerContactId: karimId,
      },
    );
  });

  it('warns of a matching phone and variant during the last day without blocking', async () => {
    const variantId = await variant(3);
    const input = draft(variantId, { deliveryChargePoisha: 7000 });
    const first = await orders.createOrder(f.a, input, editor());
    const second = await orders.createOrder(f.a, input, editor());
    expect(second).toMatchObject({
      possibleDuplicateOfOrderId: first.id,
      deliveryChargePoisha: 7000,
      isDeliveryChargeOverridden: true,
    });
    expect(await orders.getById(f.a, second.id, { seeFullPhone: false })).toMatchObject({
      possibleDuplicateOfOrderId: null,
      recipientPhone: '01712-XXX903',
    });
    const changed = await orders.editOrder(
      f.a,
      second.id,
      editOrderSchema.parse({
        items: input.items,
        recipient: { address: 'Mirpur' },
      }),
      { ...editor(), access: { seeFullPhone: false } },
    );
    expect(changed).toMatchObject({
      recipientAddress: 'Mirpur',
      recipientPhone: '01712-XXX903',
      deliveryChargePoisha: 7000,
      isDeliveryChargeOverridden: true,
    });
    await expect(
      orders.editOrder(
        f.a,
        second.id,
        editOrderSchema.parse({ items: input.items, recipient: { phone: '01712458904' } }),
        editor(),
      ),
    ).resolves.toMatchObject({ possibleDuplicateOfOrderId: null });
    await f.connection.pool.query(
      "update orders set created_at=created_at - interval '25 hours' where store_id=$1 and id=any($2)",
      [f.a, [first.id, second.id]],
    );
    expect(await orders.createOrder(f.a, input, editor())).toMatchObject({
      possibleDuplicateOfOrderId: null,
    });
  });

  it('locks an untracked variant before accepting it on an order', async () => {
    const variantId = await variant(0);
    await f.connection.pool.query(
      'update products set is_stock_tracked=false where id=(select product_id from product_variants where id=$1)',
      [variantId],
    );
    const lock = await f.connection.pool.connect();
    await lock.query('begin');
    await lock.query('select id from product_variants where id=$1 for no key update', [variantId]);
    const holder = (await lock.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]!;
    const pending = orders.createOrder(f.a, draft(variantId), editor());
    try {
      await expect
        .poll(async () => {
          const result = await f.connection.pool.query<{ blocked: boolean }>(
            'select exists(select 1 from pg_stat_activity where $1=any(pg_blocking_pids(pid))) as blocked',
            [holder.pid],
          );
          return result.rows[0]?.blocked;
        })
        .toBe(true);
    } finally {
      await lock.query('rollback');
      lock.release();
    }
    expect(await pending).toMatchObject({ items: [{ variantId, isStockTracked: false }] });
    expect(await f.row('product_variants', variantId)).toMatchObject({ reserved: 0 });
  });

  it('lets only one request reserve the last unit', async () => {
    const variantId = await variant(1);
    const input = draft(variantId);
    const results = await Promise.allSettled([
      orders.createOrder(f.a, input, editor()),
      orders.createOrder(f.a, input, editor()),
    ]);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'fulfilled' }),
        expect.objectContaining({
          status: 'rejected',
          reason: expect.objectContaining({ code: 'STOCK_NOT_AVAILABLE' }),
        }),
      ]),
    );
    expect(await f.row('product_variants', variantId)).toMatchObject({ reserved: 1, on_hand: 1 });
  });
});
