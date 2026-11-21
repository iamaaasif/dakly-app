import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { DatabaseModule } from '../platform/database/database.module';
import { OrderPaymentLinksService } from './order-payment-links.service';
import { PaymentsModule } from './payments.module';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

class TestModule {}
Module({ imports: [DatabaseModule, PaymentsModule] })(TestModule);

// Order total: 3,750 + 60 delivery = 3,810 taka.
describe('Order payment links (Postgres)', () => {
  const f = new OwnerIsolationFixture();
  let app: INestApplicationContext;
  let links: OrderPaymentLinksService;
  let payments: PaymentsService;
  let repository: PaymentsRepository;
  let number = 5001;
  let credentialId: string;

  beforeAll(async () => {
    await f.setup();
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    links = app.get(OrderPaymentLinksService);
    payments = app.get(PaymentsService);
    repository = app.get(PaymentsRepository);
    credentialId = randomUUID();
    await f.connection.pool.query(
      `insert into payment_gateway_credentials (id,store_id,gateway,mode,account_label,ciphertext,key_version)
       values ($1,$2,'bkash','live','Shop merchant','\\x00',1)`,
      [credentialId, f.a],
    );
  });

  afterAll(async () => {
    for (const table of ['payment_events', 'payment_intents', 'payment_gateway_credentials'])
      await f.connection.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [f.a, f.b],
      ]);
    for (const table of ['audit_log', 'orders', 'outbox_events'])
      await f.connection.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [f.a, f.b],
      ]);
    await app.close();
    await f.close();
  });

  async function order(storeId = f.a, stage = 'to_confirm') {
    const id = randomUUID();
    await f.connection.pool.query(
      `insert into orders (id,store_id,number,source,created_by_type,stage,recipient_name,
        recipient_phone,recipient_address,recipient_district,payment_status,advance_paid_poisha,
        items_subtotal_poisha,delivery_charge_poisha,cod_amount_poisha)
        values ($1,$2,$3,'manual','user',$4,'Rahim','01710000005','Mirpur','Dhaka','cod_pending',0,375000,6000,381000)`,
      [id, storeId, number++, stage],
    );
    return id;
  }

  const link = (orderId: string, input: Record<string, unknown> = {}) =>
    links.create(
      f.a,
      orderId,
      { gateway: 'bkash', credentialId, kind: 'advance', expiresInHours: 24, ...input } as never,
      f.userA,
    );

  async function pay(intentId: string, amountPoisha: number) {
    const intent = (await repository.find(f.a, intentId))!;
    await payments.redirected(f.a, intentId, `gw-${intentId}`);
    const pending = (await repository.find(f.a, intentId))!;
    await payments.applyStatus(
      f.a,
      intentId,
      {
        status: 'paid',
        merchantReference: intent.merchantReference,
        amountPoisha,
        currency: 'BDT',
        transactionId: `trx-${intentId}`,
      },
      pending.nextCheckAt!,
    );
    await links.recordPaid(f.a, intentId);
  }

  it('asks for the delivery charge and marks the order as waiting for an advance', async () => {
    const orderId = await order();
    const created = await link(orderId);
    expect(created).toMatchObject({ amountPoisha: 6000, kind: 'advance', status: 'created' });
    expect(await f.row('orders', orderId)).toMatchObject({ payment_status: 'advance_requested' });
  });

  it('refuses an advance above what is unpaid and writes no link', async () => {
    const orderId = await order();
    await expect(link(orderId, { amountPoisha: 381001 })).rejects.toThrow('no more than');
    expect(await links.list(f.a, orderId)).toEqual([]);
  });

  it('voids the older unpaid link when a new one is made', async () => {
    const orderId = await order();
    const first = await link(orderId);
    const second = await link(orderId, { amountPoisha: 10000 });
    const listed = await links.list(f.a, orderId);
    expect(listed.find(({ id }) => id === first.id)?.isVoided).toBe(true);
    expect(listed.find(({ id }) => id === second.id)).toMatchObject({
      isVoided: false,
      amountPoisha: 10000,
    });
  });

  it('records a verified advance on the order once, however often the job runs', async () => {
    const orderId = await order();
    const created = await link(orderId);
    await pay(created.id, 6000);
    await links.recordPaid(f.a, created.id);
    expect(await f.row('orders', orderId)).toMatchObject({
      payment_status: 'advance_paid',
      advance_paid_poisha: 6000,
      cod_amount_poisha: 375000,
    });
  });

  it('marks the order paid after a full payment', async () => {
    const orderId = await order();
    const created = await link(orderId, { kind: 'full' });
    expect(created.amountPoisha).toBe(381000);
    await pay(created.id, 381000);
    expect(await f.row('orders', orderId)).toMatchObject({
      payment_status: 'paid',
      cod_amount_poisha: 0,
    });
  });

  it('shows refund due when the order was cancelled before the payment landed', async () => {
    const orderId = await order();
    const created = await link(orderId);
    await f.connection.pool.query(
      "update orders set stage='cancelled', cancel_reason='not_confirmed', cancelled_at=now() where id=$1",
      [orderId],
    );
    await pay(created.id, 6000);
    expect(await f.row('orders', orderId)).toMatchObject({ payment_status: 'refund_due' });
  });

  it('refuses a link for an order in another shop', async () => {
    const other = await order(f.b);
    await expect(link(other)).rejects.toThrow('Order not found');
  });

  it('refuses a link for a delivered order', async () => {
    await expect(link(await order(f.a, 'delivered'))).rejects.toThrow('cannot take a payment link');
  });
});
