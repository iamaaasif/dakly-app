import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { OrderStage } from '@dakly/contracts/orders';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { DatabaseModule } from '../platform/database/database.module';
import { OrdersModule } from './orders.module';
import { OrdersService } from './orders.service';

class TestModule {}
Module({ imports: [DatabaseModule, OrdersModule] })(TestModule);

describe('Manual dispatch and delivery', () => {
  const f = new OwnerIsolationFixture();
  let app: INestApplicationContext;
  let service: OrdersService;
  let number = 1001;
  const editor = () => ({
    actor: { kind: 'user', userId: f.userA } as const,
    access: { seeFullPhone: true },
  });

  beforeAll(async () => {
    await f.setup();
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(OrdersService);
  });

  afterAll(async () => {
    for (const table of [
      'orders',
      'outbox_events',
      'stock_movements',
      'product_variants',
      'products',
    ])
      await f.connection.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [f.a, f.b],
      ]);
    await app.close();
    await f.close();
  });

  async function order(
    storeId: string,
    stage: OrderStage,
    { phone = '01710000005', advance = 0 }: { phone?: string; advance?: number } = {},
  ) {
    const id = randomUUID();
    await f.connection.pool.query(
      `insert into orders (id,store_id,number,source,created_by_type,stage,recipient_name,
        recipient_phone,recipient_address,recipient_district,payment_status,advance_paid_poisha,
        items_subtotal_poisha,delivery_charge_poisha,cod_amount_poisha)
        values ($1,$2,$3,'manual','user',$4,'Rahim',$5,'Mirpur','Dhaka',$6,$7,375000,6000,381000::bigint-$7::bigint)`,
      [id, storeId, number++, stage, phone, advance > 0 ? 'advance_paid' : 'cod_pending', advance],
    );
    return id;
  }

  async function trackedLine(orderId: string, quantity: number) {
    const productId = randomUUID();
    const variantId = randomUUID();
    const itemId = randomUUID();
    await f.connection.pool.query(
      "insert into products (id,store_id,name,is_stock_tracked) values ($1,$2,'Panjabi',true)",
      [productId, f.a],
    );
    await f.connection.pool.query(
      "insert into product_variants (id,store_id,product_id,title,on_hand,reserved) values ($1,$2,$3,'M',$4,$4)",
      [variantId, f.a, productId, quantity],
    );
    await f.connection.pool.query(
      `insert into order_items (id,store_id,order_id,variant_id,product_name,variant_title,
         quantity,unit_price_poisha,is_stock_tracked)
       values ($1,$2,$3,$4,'Panjabi','M',$5,125000,true)`,
      [itemId, f.a, orderId, variantId, quantity],
    );
    return { variantId, itemId };
  }

  it('ships the reservation, records the parcel, and returns only the delivered units on a late return', async () => {
    const orderId = await order(f.a, 'to_pack', { advance: 20000 });
    const { variantId, itemId } = await trackedLine(orderId, 3);
    await f.connection.pool.query(
      'update orders set items_subtotal_poisha=374000,order_discount_poisha=3001,cod_amount_poisha=356999 where id=$1',
      [orderId],
    );
    await f.connection.pool.query('update order_items set line_discount_poisha=1000 where id=$1', [
      itemId,
    ]);
    await expect(
      service.changeStage(f.a, orderId, { to: 'delivered' }, editor()),
    ).rejects.toMatchObject({
      code: 'ORDER_STAGE_NOT_ALLOWED',
    });
    const sent = await service.changeStage(
      f.a,
      orderId,
      {
        to: 'with_courier',
        courier: 'pathao',
        trackingCode: 'DP123',
      },
      editor(),
    );
    expect(sent).toMatchObject({
      stage: 'with_courier',
      courier: 'pathao',
      trackingCode: 'DP123',
      shippedByUserId: f.userA,
    });
    expect(await f.row('product_variants', variantId)).toMatchObject({ on_hand: 0, reserved: 0 });
    await expect(
      service.changeStage(
        f.a,
        orderId,
        {
          to: 'partially_delivered',
          note: 'The customer kept two items',
          items: [{ itemId, quantity: 4 }],
        },
        editor(),
      ),
    ).rejects.toMatchObject({ code: 'ORDER_DELIVERED_QUANTITY_INVALID' });
    const partial = await service.changeStage(
      f.a,
      orderId,
      {
        to: 'partially_delivered',
        note: 'The customer kept two items',
        items: [{ itemId, quantity: 2 }],
      },
      editor(),
    );
    expect(partial).toMatchObject({
      stage: 'partially_delivered',
      itemsSubtotalPoisha: 374000,
      orderDiscountPoisha: 3001,
      deliveredItemsSubtotalPoisha: 249334,
      deliveredOrderDiscountPoisha: 2000,
      codAmountPoisha: 233334,
      items: [
        {
          deliveredQuantity: 2,
          quantity: 3,
          lineDiscountPoisha: 1000,
          deliveredLineDiscountPoisha: 666,
        },
      ],
    });
    expect(partial.timeline.at(-1)).toMatchObject({ reason: 'The customer kept two items' });
    expect(await f.row('product_variants', variantId)).toMatchObject({ on_hand: 1, reserved: 0 });
    const returned = await service.changeStage(
      f.a,
      orderId,
      {
        to: 'returned',
        reason: 'Returned after delivery',
        isDamaged: false,
      },
      editor(),
    );
    expect(returned).toMatchObject({
      stage: 'returned',
      paymentStatus: 'refund_due',
      returnReason: 'Returned after delivery',
    });
    expect(await f.row('product_variants', variantId)).toMatchObject({ on_hand: 3, reserved: 0 });
  });

  it('keeps damaged stock out of inventory after a return', async () => {
    const orderId = await order(f.a, 'to_pack');
    const { variantId } = await trackedLine(orderId, 1);
    await service.changeStage(f.a, orderId, { to: 'with_courier' }, editor());
    await service.changeStage(
      f.a,
      orderId,
      {
        to: 'returned',
        reason: 'Damaged parcel',
        isDamaged: true,
      },
      editor(),
    );
    expect(await f.row('product_variants', variantId)).toMatchObject({ on_hand: 0, reserved: 0 });
  });

  it('records COD once after delivery', async () => {
    const orderId = await order(f.a, 'to_pack');
    await trackedLine(orderId, 1);
    await expect(
      service.recordCodCollected(f.a, orderId, { amountPoisha: 1000 }, editor()),
    ).rejects.toMatchObject({ code: 'ORDER_COD_NOT_COLLECTABLE' });
    await service.changeStage(f.a, orderId, { to: 'with_courier' }, editor());
    await service.changeStage(f.a, orderId, { to: 'delivered' }, editor());
    expect(
      await service.recordCodCollected(f.a, orderId, { amountPoisha: 125000 }, editor()),
    ).toMatchObject({
      stage: 'delivered',
      paymentStatus: 'cod_collected',
      codCollectedPoisha: 125000,
      items: [{ deliveredQuantity: 1 }],
    });
    await expect(
      service.recordCodCollected(f.a, orderId, { amountPoisha: 0 }, editor()),
    ).rejects.toMatchObject({ code: 'ORDER_COD_NOT_COLLECTABLE' });
    const { rows } = await f.connection.pool.query(
      "select payload from outbox_events where store_id=$1 and type='order.cod_collected' and payload->>'orderId'=$2",
      [f.a, orderId],
    );
    expect(rows).toEqual([{ payload: { orderId } }]);
  });

  it('sets refund due on a late return after COD collection', async () => {
    const orderId = await order(f.a, 'to_pack');
    const { variantId } = await trackedLine(orderId, 1);
    await service.changeStage(f.a, orderId, { to: 'with_courier' }, editor());
    await service.changeStage(f.a, orderId, { to: 'delivered' }, editor());
    await service.recordCodCollected(f.a, orderId, { amountPoisha: 125000 }, editor());
    const returned = await service.changeStage(
      f.a,
      orderId,
      { to: 'returned', reason: 'Customer returned the parcel', isDamaged: false },
      editor(),
    );
    expect(returned).toMatchObject({
      stage: 'returned',
      paymentStatus: 'refund_due',
      codCollectedPoisha: 125000,
    });
    expect(await f.row('product_variants', variantId)).toMatchObject({ on_hand: 1, reserved: 0 });
  });
  it('uses only the recipient phone and this store’s completed parcels for risk', async () => {
    const phone = '01710000006';
    await order(f.a, 'returned', { phone });
    const own = await order(f.a, 'to_confirm', { phone });
    expect((await service.getById(f.a, own, editor().access)).returnRisk).toBeNull();
    await order(f.a, 'partially_delivered', { phone });
    for (let i = 0; i < 4; i++) await order(f.b, 'delivered', { phone });
    const newPhone = await order(f.a, 'to_confirm', { phone: '01710000007' });
    expect((await service.getById(f.a, own, editor().access)).returnRisk).toBe('high');
    const page = await service.list(f.a, { stage: 'to_confirm', limit: 20 });
    expect(page.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: own, returnRisk: 'high' }),
        expect.objectContaining({ id: newPhone, returnRisk: 'new_customer' }),
      ]),
    );
    expect(page.items[0]).not.toHaveProperty('recipientPhone');
  });
});
