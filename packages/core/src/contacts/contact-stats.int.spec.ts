import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule } from '@nestjs/bullmq';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { ContactStatsModule } from './contact-stats.module';
import { ContactStatsRepository } from './contact-stats.repository';
import { ContactStatsService } from './contact-stats.service';
import { RefreshContactStatsOnOrderStageChanged } from './jobs/refresh-contact-stats-on-order-stage-changed.job';

class TestModule {}
Module({
  imports: [
    DatabaseModule,
    ContactStatsModule,
    BullModule.forRootAsync({
      useFactory: () => {
        const env = loadEnv();
        return { connection: toRedisConnection(env.REDIS_URL), prefix: env.QUEUE_PREFIX };
      },
    }),
  ],
})(TestModule);

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
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    vi.spyOn(app.get(Clock), 'now').mockReturnValue(now);
    stats = app.get(ContactStatsService);
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

  it('repairs totals from the buyer’s non-cancelled orders', async () => {
    await stats.reconcile(fixture.a);
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
    await stats.reconcile(fixture.a);
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

  it('ages deliberate customers without orders and leaves leads out', async () => {
    const oldCustomerId = randomUUID();
    const leadId = randomUUID();
    await fixture.connection.pool.query(
      `insert into contacts (id,store_id,name,source,kind,created_at) values
         ($1,$3,'নাবিলা','import','customer','2026-09-19T17:59:00Z'),
         ($2,$3,'সুমন','messenger','lead','2026-09-19T17:59:00Z')`,
      [oldCustomerId, leadId, fixture.a],
    );
    await stats.reconcile(fixture.a);
    expect(await stored(oldCustomerId)).toMatchObject({
      orders_count: 0,
      lifecycle_stage: 'stopped_buying',
    });
    expect(await stored(leadId)).toMatchObject({ lifecycle_stage: 'none' });
  });

  it('selects the smaller of the top tenth and customers over ৳20,000', async () => {
    await fixture.connection.pool.query(
      `insert into contacts (id,store_id,name,source,kind,created_at)
       select gen_random_uuid(),$1,'নাবিলা','import','customer','2026-11-01T06:00:00Z'
       from generate_series(1, 9)`,
      [fixture.a],
    );
    await fixture.connection.pool.query(
      `update orders set stage='delivered', payment_status='paid', return_reason=null,
        items_subtotal_poisha=2105000, cod_amount_poisha=2106000 where id=$1`,
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

  it('ignores foreign order and contact ids', async () => {
    await stats.refresh(fixture.a, contactId);
    const before = await stored(contactId);
    await stats.refreshOrder(fixture.b, firstOrderId);
    await stats.refresh(fixture.b, contactId);
    const ownerRepository = new ContactStatsRepository(fixture.tenant);
    expect(await ownerRepository.lockContact(fixture.b, contactId)).toBeUndefined();
    expect(await ownerRepository.contactIds(fixture.b, null, 100)).toEqual([
      { id: otherContactId },
    ]);
    expect(await stored(contactId)).toEqual(before);
  });
});
