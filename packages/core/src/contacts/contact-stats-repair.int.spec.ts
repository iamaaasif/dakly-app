import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { ContactStatsRepairModule } from './contact-stats-repair.module';
import { RECONCILE_CONTACT_STATS } from './contact-stats-sweep.service';
import { ContactStatsService } from './contact-stats.service';
import { ReconcileContactStatsJob } from './jobs/reconcile-contact-stats.job';

class TestModule {}
Module({
  imports: [
    DatabaseModule,
    ContactStatsRepairModule,
    BullModule.forRootAsync({
      useFactory: () => {
        const env = loadEnv();
        return { connection: toRedisConnection(env.REDIS_URL), prefix: env.QUEUE_PREFIX };
      },
    }),
  ],
})(TestModule);

describe('Nightly contact stats repair', () => {
  const fixture = new OwnerIsolationFixture();
  const day = '2026-11-19';
  let app: INestApplicationContext;
  let worker: ReconcileContactStatsJob;
  let queue: Queue;

  beforeAll(async () => {
    await fixture.setup();
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    vi.spyOn(app.get(Clock), 'now').mockReturnValue(new Date(day + 'T06:00:00Z'));
    worker = app.get(ReconcileContactStatsJob);
    queue = app.get(getQueueToken(QUEUES.bulk));
  });

  afterAll(async () => {
    await app?.close();
    await fixture.connection.pool.query('delete from orders where store_id=$1', [fixture.b]);
    await fixture.connection.pool.query('delete from outbox_events where store_id=$1', [fixture.b]);
    await fixture.close();
  });

  async function importedContacts(storeId: string, count: number) {
    const { rows } = await fixture.connection.pool.query(
      `insert into contacts (id,store_id,name,source,kind,created_at)
       select gen_random_uuid(),$1,'নাবিলা','import','customer','2026-11-01T06:00:00Z'
       from generate_series(1,$2::integer) returning id`,
      [storeId, count],
    );
    return rows.map(({ id }) => String(id)).sort();
  }

  async function stored(contactId: string) {
    const { rows } = await fixture.connection.pool.query(
      'select lifecycle_stage, net_spend_poisha from contact_stats where contact_id=$1',
      [contactId],
    );
    return rows[0];
  }

  async function totalsPage(storeId: string) {
    await worker.handle({ storeId, day, after: null, ranking: { kind: 'totals' } });
  }

  it('queues another totals page and repairs the stage of a soft-deleted contact', async () => {
    const ids = await importedContacts(fixture.a, 101);
    const removedId = ids[100]!;
    await fixture.connection.pool.query(
      "update contacts set deleted_at='2026-11-18T06:00:00Z' where id=$1",
      [removedId],
    );
    await fixture.connection.pool.query(
      "insert into contact_stats (contact_id,store_id,lifecycle_stage) values ($1,$2,'best')",
      [removedId, fixture.a],
    );
    await totalsPage(fixture.a);
    expect(await stored(removedId)).toMatchObject({ lifecycle_stage: 'best' });
    expect(await stored(ids[99]!)).toMatchObject({ lifecycle_stage: 'bought_once' });
    const next = await queue.getJob(
      `${RECONCILE_CONTACT_STATS}-${fixture.a}-${day}-totals-${ids[99]}`,
    );
    expect(next?.data).toMatchObject({
      storeId: fixture.a,
      day,
      after: ids[99],
      ranking: { kind: 'totals' },
    });
    await worker.handle(next?.data);
    expect(await stored(removedId)).toMatchObject({ lifecycle_stage: 'none' });
    const rank = await queue.getJob(`${RECONCILE_CONTACT_STATS}-${fixture.a}-${day}-rank-start`);
    expect(rank?.data).toMatchObject({ after: null, ranking: { kind: 'rank' } });
  });

  it('ranks the top tenth above ৳20,000 and checks current orders before changing a stage', async () => {
    const [firstId, secondId] = await importedContacts(fixture.b, 20);
    const firstOrder = randomUUID();
    await fixture.connection.pool.query(
      `insert into orders(id,store_id,number,buyer_contact_id,source,created_by_type,stage,
         recipient_name,recipient_phone,recipient_address,recipient_district,
         items_subtotal_poisha,cod_amount_poisha,payment_status,created_at)
       values
         ($1,$2,1001,$3,'manual','user','delivered','রিনা','01710000005','Mirpur','Dhaka',2500000,2500000,'paid','2026-11-11T06:00:00Z'),
         ($4,$2,1002,$5,'manual','user','delivered','নাবিলা','01710000006','Mirpur','Dhaka',2400000,2400000,'paid','2026-11-11T06:00:00Z')`,
      [firstOrder, fixture.b, firstId, randomUUID(), secondId],
    );
    await fixture.connection.pool.query(
      "update stores set time_zone='Atlantic/Azores' where id=$1",
      [fixture.b],
    );
    vi.mocked(app.get(Clock).now).mockReturnValue(new Date(day + 'T00:15:00Z'));
    await totalsPage(fixture.b);
    const rank = await queue.getJob(`${RECONCILE_CONTACT_STATS}-${fixture.b}-${day}-rank-start`);
    expect(rank?.data.ranking.cutoff).toEqual({
      contactId: secondId,
      netSpendPoisha: '2400000',
    });
    await fixture.connection.pool.query(
      "update orders set stage='returned', return_reason='Did not accept' where id=$1",
      [firstOrder],
    );
    await worker.handle(rank?.data);
    expect(await stored(firstId!)).toMatchObject({ lifecycle_stage: 'new', net_spend_poisha: '0' });
    const completion = async () => {
      const { rows } = await fixture.connection.pool.query(
        "select payload from outbox_events where store_id=$1 and type='contact_stats.repaired' order by occurred_at",
        [fixture.b],
      );
      return rows;
    };
    const completed = [{ payload: { day: '2026-11-18' } }];
    expect(await completion()).toEqual(completed);
    expect(await stored(secondId!)).toMatchObject({
      lifecycle_stage: 'best',
      net_spend_poisha: '2400000',
    });
    vi.mocked(app.get(Clock).now).mockReturnValue(new Date(day + 'T01:15:00Z'));
    await worker.handle(rank?.data);
    expect(await stored(secondId!)).toMatchObject({ lifecycle_stage: 'best' });
    expect(await completion()).toEqual([...completed, { payload: { day } }]);

    await fixture.connection.pool.query(
      "update orders set stage='delivered', return_reason=null where id=$1",
      [firstOrder],
    );
    await app.get(ContactStatsService).refresh(fixture.b, firstId!);
    expect(await stored(firstId!)).toMatchObject({
      lifecycle_stage: 'new',
      net_spend_poisha: '2500000',
    });
    vi.mocked(app.get(Clock).now)
      .mockReturnValueOnce(new Date(day + 'T23:59:59Z'))
      .mockReturnValue(new Date('2026-11-20T00:00:00Z'));
    await worker.handle(rank?.data);
    expect(await stored(firstId!)).toMatchObject({ lifecycle_stage: 'new' });
    expect(await completion()).toEqual([...completed, { payload: { day } }]);
  });
});
