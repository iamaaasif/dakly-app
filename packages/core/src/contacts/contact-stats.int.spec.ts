import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { ContactStatsModule } from './contact-stats.module';
import { ContactStatsRepository } from './contact-stats.repository';
import { ContactStatsService } from './contact-stats.service';
import {
  ReconcileContactStatsJob,
  RECONCILE_CONTACT_STATS,
} from './jobs/reconcile-contact-stats.job';
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

  it('repairs totals from the buyer’s non-cancelled orders', async () => {
    await stats.reconcilePage(fixture.a, null, { kind: 'keep' });
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
    await stats.reconcilePage(fixture.a, null, { kind: 'keep' });
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
    await stats.reconcilePage(fixture.a, null, { kind: 'keep' });
    expect(await stored(oldCustomerId)).toMatchObject({
      orders_count: 0,
      lifecycle_stage: 'stopped_buying',
    });
    expect(await stored(leadId)).toMatchObject({ lifecycle_stage: 'none' });
  });

  async function seedRank() {
    await fixture.connection.pool.query(
      `insert into contacts (id,store_id,name,source,kind,created_at)
       select gen_random_uuid(),$1,'নাবিলা','import','customer','2026-11-01T06:00:00Z'
       from generate_series(1, 9)`,
      [fixture.a],
    );
  }

  it('selects the smaller of the top tenth and customers over ৳20,000', async () => {
    await seedRank();
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

  it('revises a best customer’s spend without counting their stale total as a rival', async () => {
    await seedRank();
    await fixture.connection.pool.query(
      "update orders set items_subtotal_poisha=3005000, payment_status='paid' where id=$1",
      [firstOrderId],
    );
    await stats.refresh(fixture.a, contactId);
    expect(await stored(contactId)).toMatchObject({ lifecycle_stage: 'best' });
    await fixture.connection.pool.query(
      'update orders set items_subtotal_poisha=2505000 where id=$1',
      [firstOrderId],
    );
    await stats.refresh(fixture.a, contactId);
    expect(await stored(contactId)).toMatchObject({
      lifecycle_stage: 'best',
      net_spend_poisha: '2500000',
    });
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

  it('queues the next cursor page and clears an excluded lifecycle stage during repair', async () => {
    await stats.refresh(fixture.a, contactId);
    await fixture.connection.pool.query('update contacts set deleted_at=$2 where id=$1', [
      contactId,
      now,
    ]);
    await fixture.connection.pool.query(
      `insert into contacts (id,store_id,name,source,kind)
       select gen_random_uuid(),$1,'নাবিলা','import','customer' from generate_series(1, 100)`,
      [fixture.a],
    );
    const handler = app.get(ReconcileContactStatsJob);
    const bulk = app.get<Queue>(getQueueToken(QUEUES.bulk));
    const day = '2026-11-19';
    const { rows } = await fixture.connection.pool.query(
      'select id from contacts where store_id=$1 order by id offset 99 limit 1',
      [fixture.a],
    );
    const after = rows[0].id;
    const repair = { storeId: fixture.a, day, after: null, ranking: { kind: 'keep' } };
    await handler.handle(repair);
    const next = await bulk.getJob(`${RECONCILE_CONTACT_STATS}-${fixture.a}-${day}-keep-${after}`);
    expect(next?.data).toEqual({ ...repair, after });
    await handler.handle(next?.data);
    const measure = await bulk.getJob(
      `${RECONCILE_CONTACT_STATS}-${fixture.a}-${day}-measure-start`,
    );
    await handler.handle(measure?.data);
    const rank = await bulk.getJob(`${RECONCILE_CONTACT_STATS}-${fixture.a}-${day}-cutoff-start`);
    expect(rank?.data).toMatchObject({ ...repair, ranking: { kind: 'cutoff' } });
    await handler.handle(rank?.data);
    expect(await stored(contactId)).toMatchObject({ lifecycle_stage: 'none' });
  });

  it('keeps a newer live rank when a pending page has an older cutoff', async () => {
    await seedRank();
    const { rows } = await fixture.connection.pool.query(
      "select id from contacts where store_id=$1 and source='import' order by id limit 1",
      [fixture.a],
    );
    const otherBuyerId = rows[0].id;
    await fixture.connection.pool.query(
      `update orders set stage='delivered', payment_status='paid', order_discount_poisha=0,
        items_subtotal_poisha=case number when 1001 then 2500000 else 2400000 end,
        buyer_contact_id=case number when 1001 then $2::uuid else $3::uuid end
        where store_id=$1 and stage <> 'cancelled'`,
      [fixture.a, contactId, otherBuyerId],
    );
    await stats.reconcilePage(fixture.a, null, { kind: 'keep' });
    const handler = app.get(ReconcileContactStatsJob);
    const bulk = app.get<Queue>(getQueueToken(QUEUES.bulk));
    const day = '2026-11-20';
    await handler.handle({ storeId: fixture.a, day, after: null, ranking: { kind: 'measure' } });
    const rank = await bulk.getJob(`${RECONCILE_CONTACT_STATS}-${fixture.a}-${day}-cutoff-start`);
    expect(rank?.data.ranking.cutoff).toEqual({
      contactId,
      netSpendPoisha: '2500000',
    });
    await fixture.connection.pool.query(
      "update orders set stage='returned', return_reason='Did not accept' where id=$1",
      [firstOrderId],
    );
    await stats.refresh(fixture.a, contactId);
    vi.mocked(app.get(Clock).now).mockReturnValueOnce(new Date('2026-11-19T06:01:00Z'));
    await stats.refresh(fixture.a, otherBuyerId);
    expect(await stored(otherBuyerId)).toMatchObject({ lifecycle_stage: 'best' });
    await handler.handle(rank?.data);
    expect(await stored(otherBuyerId)).toMatchObject({ lifecycle_stage: 'best' });
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
