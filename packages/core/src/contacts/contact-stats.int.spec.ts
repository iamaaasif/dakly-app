import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { ContactStatsModule } from './contact-stats.module';
import { ContactStatsRepository } from './contact-stats.repository';
import { ContactStatsService } from './contact-stats.service';
import {} from './jobs/reconcile-contact-stats.job';
import { RefreshContactStatsOnOrderStageChanged } from './jobs/refresh-contact-stats-on-order-stage-changed.job';

class TestModule {}
Module({ imports: [DatabaseModule, ContactStatsModule] })(TestModule);

describe('Contact stats', () => {
  const fixture = new OwnerIsolationFixture();
  const contactId = randomUUID();
  const otherContactId = randomUUID();
  const firstOrderId = randomUUID();
  const now = new Date('2026-11-19T06:00:00Z');
  let app: INestApplicationContext;
  let stats: ContactStatsService;

  beforeAll(async () => {
    await fixture.setup();
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    vi.spyOn(app.get(Clock), 'now').mockReturnValue(now);
    stats = app.get(ContactStatsService);
  });

  beforeEach(async () => {
    await fixture.connection.pool.query('delete from orders where store_id=$1', [fixture.a]);
    await fixture.connection.pool.query('delete from contacts where store_id=any($1::uuid[])', [
      [fixture.a, fixture.b],
    ]);
    await fixture.connection.pool.query(
      `insert into contacts (id,store_id,name,source,kind) values
         ($1,$2,'রিনা','manual','customer'),($3,$4,'করিম','manual','customer')`,
      [contactId, fixture.a, otherContactId, fixture.b],
    );
    await fixture.connection.pool.query(
      `insert into orders(id,store_id,number,buyer_contact_id,source,created_by_type,stage,
         recipient_name,recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,
         order_discount_poisha,delivery_charge_poisha,cod_amount_poisha,payment_status,cod_collected_poisha,created_at,cancel_reason)
       values
         ($1,$2,1001,$3,'manual','user','delivered','রিনা','01710000005','Mirpur','Dhaka',125000,5000,6000,126000,'cod_collected',126000,'2026-11-01T09:00:00Z',null),
         ($4,$2,1002,$3,'manual','user','with_courier','রিনা','01710000005','Mirpur','Dhaka',50000,0,0,50000,'cod_pending',null,'2026-11-09T09:00:00Z',null),
         ($5,$2,1003,$3,'manual','user','cancelled','রিনা','01710000005','Mirpur','Dhaka',50000,0,0,50000,'cod_pending',null,'2026-11-16T09:00:00Z','other')`,
      [firstOrderId, fixture.a, contactId, randomUUID(), randomUUID()],
    );
  });

  afterAll(async () => {
    await app?.close();
    await fixture.connection.pool.query('delete from orders where store_id=$1', [fixture.a]);
    await fixture.close();
  });

  async function stored(contactId: string) {
    const result = await fixture.connection.pool.query(
      'select * from contact_stats where contact_id=$1',
      [contactId],
    );
    return result.rows[0];
  }

  it('refreshes totals from the buyer’s non-cancelled orders', async () => {
    await stats.refresh(fixture.a, contactId);
    expect(await stored(contactId)).toMatchObject({
      orders_count: 2,
      delivered_count: 1,
      returned_count: 0,
      net_spend_poisha: '120000',
      first_order_at: new Date('2026-11-01T09:00:00Z'),
      last_order_at: new Date('2026-11-09T09:00:00Z'),
      usual_gap_days: 8,
      lifecycle_stage: 'new',
    });
    expect(await stored(otherContactId)).toBeUndefined();
  });

  it('recalculates spend after a late return and leaves the row unchanged on replay', async () => {
    await stats.refresh(fixture.a, contactId);
    await fixture.connection.pool.query(
      "update orders set stage='returned', return_reason='Did not accept' where id=$1",
      [firstOrderId],
    );
    const event = {
      id: randomUUID(),
      type: 'order.stage_changed',
      storeId: fixture.a,
      occurredAt: now.toISOString(),
      payload: { orderId: firstOrderId, from: 'delivered', to: 'returned' },
    };
    const handler = app.get(RefreshContactStatsOnOrderStageChanged);
    await handler.handle(event);
    const afterReturn = await stored(contactId);
    expect(afterReturn).toMatchObject({
      orders_count: 2,
      delivered_count: 0,
      returned_count: 1,
      net_spend_poisha: '0',
    });
    vi.mocked(app.get(Clock).now).mockReturnValueOnce(new Date('2026-11-19T06:01:00Z'));
    await handler.handle(event);
    expect(await stored(contactId)).toEqual(afterReturn);
  });

  it('keeps Best customers until paid spend falls to ৳20,000', async () => {
    await fixture.connection.pool.query(
      `insert into contact_stats (store_id,contact_id,lifecycle_stage)
       values ($1,$2,'best')`,
      [fixture.a, contactId],
    );
    await fixture.connection.pool.query(
      "update orders set payment_status='paid',items_subtotal_poisha=2205000 where id=$1",
      [firstOrderId],
    );
    await stats.refresh(fixture.a, contactId);
    expect(await stored(contactId)).toMatchObject({ lifecycle_stage: 'best' });
    await fixture.connection.pool.query(
      'update orders set items_subtotal_poisha=2005000 where id=$1',
      [firstOrderId],
    );
    await stats.refresh(fixture.a, contactId);
    expect(await stored(contactId)).toMatchObject({ lifecycle_stage: 'new' });
  });

  it('leaves New after 30 store-local days', async () => {
    await fixture.connection.pool.query(
      "update orders set created_at='2026-10-20T18:00:00Z', items_subtotal_poisha=125000 where id=$1",
      [firstOrderId],
    );
    await fixture.connection.pool.query(
      "update orders set stage='cancelled', cancel_reason='other' where buyer_contact_id=$1 and id<>$2",
      [contactId, firstOrderId],
    );
    await stats.refresh(fixture.a, contactId);
    expect(await stored(contactId)).toMatchObject({ lifecycle_stage: 'new' });
    vi.mocked(app.get(Clock).now).mockReturnValueOnce(new Date('2026-11-20T06:00:00Z'));
    await stats.refresh(fixture.a, contactId);
    expect(await stored(contactId)).toMatchObject({ lifecycle_stage: 'bought_once' });
  });

  it('keeps sums in exact poisha when two orders exceed the safe integer range', async () => {
    await fixture.connection.pool.query(
      `update orders set stage='delivered', payment_status='paid',
        items_subtotal_poisha=case number when 1001 then 9007199254740991 else 2 end,
        order_discount_poisha=0 where buyer_contact_id=$1 and stage <> 'cancelled'`,
      [contactId],
    );
    await stats.refresh(fixture.a, contactId);
    expect(await stored(contactId)).toMatchObject({ net_spend_poisha: '9007199254740993' });
  });

  it('ignores foreign order and contact ids', async () => {
    await stats.refresh(fixture.a, contactId);
    const before = await stored(contactId);
    await stats.refreshOrder(fixture.b, firstOrderId);
    await stats.refresh(fixture.b, contactId);
    const ownerRepository = new ContactStatsRepository(fixture.tenant);
    expect(await ownerRepository.lockContact(fixture.b, contactId)).toBeUndefined();
    expect(await stored(contactId)).toEqual(before);
  });
});
