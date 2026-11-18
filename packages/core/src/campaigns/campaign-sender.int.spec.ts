import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Logger, Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { ValkeyClient } from '../platform/cache/valkey-client';
import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { ErrorReporter } from '../platform/logging/error-reporter';
import { runWithJobContext } from '../platform/logging/job-context';
import { DAY_MS } from '../platform/time';
import { CampaignSenderService } from './campaign-sender.service';
import { CampaignSendingRepository } from './campaign-sending.repository';
import { CampaignsModule } from './campaigns.module';

class TestModule {}
Module({ imports: [DatabaseModule, CampaignsModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const sendAt = new Date('2026-11-18T06:00:00Z');
let app: INestApplicationContext;
let sender: CampaignSenderService;
let clockNow: Date;

async function campaignRow(campaignId: string) {
  const { rows } = await admin.pool.query('select status, started_at from campaigns where id=$1', [
    campaignId,
  ]);
  return rows[0] as { status: string; started_at: Date | null };
}

describe('Campaign sweep (Postgres)', () => {
  beforeAll(async () => {
    await admin.pool.query("insert into stores(id,name) values($1,'সুমির দোকান')", [storeId]);
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    sender = app.get(CampaignSenderService);
    vi.spyOn(app.get(Clock), 'now').mockImplementation(() => clockNow);
  });

  beforeEach(async () => {
    await app.get(ValkeyClient).connection.del('campaign-start:store');
  });

  afterAll(async () => {
    try {
      await app?.close();
      await admin.pool.query('delete from campaigns where store_id=$1', [storeId]);
      await admin.pool.query('delete from stores where id=$1', [storeId]);
    } finally {
      await admin.pool.end();
    }
  });

  it('starts a scheduled campaign once its time has come', async () => {
    const id = randomUUID();
    await admin.pool.query(
      `insert into campaigns(id,store_id,name,channel,content,status,scheduled_for,approved_at)
       values($1,$2,'নতুন কালেকশন','sms','{"text":"নতুন"}','scheduled',$3,now())`,
      [id, storeId, sendAt],
    );

    clockNow = new Date(sendAt.getTime() - 60 * 1000);
    await sender.startDue();
    expect(await campaignRow(id)).toEqual({ status: 'scheduled', started_at: null });

    clockNow = sendAt;
    await sender.startDue();
    expect(await campaignRow(id)).toEqual({ status: 'sending', started_at: sendAt });
  });

  it('continues and advances the store cursor when one store fails', async () => {
    const store = randomUUID();
    const [first, next] = [storeId, store].sort() as [string, string];
    const [failing, healthy] = [randomUUID(), randomUUID()];
    await admin.pool.query("insert into stores(id,name) values($1,'নতুন দোকান')", [store]);
    const start = CampaignSendingRepository.prototype.startDueInStore;
    const failFirst = vi
      .spyOn(CampaignSendingRepository.prototype, 'startDueInStore')
      .mockImplementation(async function (this: CampaignSendingRepository, ...args) {
        if (args[0] === first) throw new Error('database unavailable');
        return start.apply(this, args);
      });
    const quiet = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const report = vi
      .spyOn(app.get(ErrorReporter), 'reportJob')
      .mockImplementation(() => undefined);
    const connection = app.get(ValkeyClient).connection;
    try {
      await admin.pool.query(
        `insert into campaigns(id,store_id,name,channel,content,status,scheduled_for,approved_at)
         values($1,$2,'নতুন কালেকশন','sms','{"text":"নতুন"}','scheduled',$5,$5),
               ($3,$4,'নতুন কালেকশন','sms','{"text":"নতুন"}','scheduled',$5,$5)`,
        [failing, first, healthy, next, sendAt],
      );
      clockNow = sendAt;

      await runWithJobContext(() => sender.startDue(), 'sweep-job-1');

      expect(report).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledWith(
        expect.objectContaining({ errorClass: 'Error' }),
        'sweep-job-1',
      );
      expect(await campaignRow(failing)).toMatchObject({ status: 'scheduled' });
      expect(await campaignRow(healthy)).toMatchObject({ status: 'sending' });
      expect(await connection.get('campaign-start:store')).toBe(next);
    } finally {
      failFirst.mockRestore();
      quiet.mockRestore();
      report.mockRestore();
      await admin.pool.query('delete from campaigns where id in ($1,$2)', [failing, healthy]);
      await admin.pool.query('delete from stores where id=$1', [store]);
    }
  });

  it('includes the nil store only on the first page', async () => {
    const nil = '00000000-0000-0000-0000-000000000000';
    await admin.pool.query("insert into stores(id,name) values($1,'নতুন দোকান')", [nil]);
    try {
      await admin.pool.query(
        `insert into campaigns(id,store_id,name,channel,content,status,scheduled_for,approved_at)
         values($1,$2,'নতুন প্রচারণা','sms','{"text":"নতুন"}','scheduled',$3,$3)`,
        [randomUUID(), nil, sendAt],
      );
      const repository = app.get(CampaignSendingRepository);
      expect(await repository.listDueStores(sendAt, null, 1)).toEqual([nil]);
      expect(await repository.listDueStores(sendAt, nil, 1)).not.toContain(nil);
    } finally {
      await admin.pool.query('delete from campaigns where store_id=$1', [nil]);
      await admin.pool.query('delete from stores where id=$1', [nil]);
    }
  });

  it('starts another store’s campaign while the first due row is locked', async () => {
    const store = randomUUID();
    const [locked, sameStore, other] = [randomUUID(), randomUUID(), randomUUID()];
    await admin.pool.query("insert into stores(id,name) values($1,'নতুন দোকান')", [store]);
    const blocker = await admin.pool.connect();
    let sweep: Promise<void> | undefined;
    try {
      for (const [id, owner] of [
        [locked, storeId],
        [sameStore, storeId],
        [other, store],
      ]) {
        await admin.pool.query(
          `insert into campaigns(id,store_id,name,channel,content,status,scheduled_for,approved_at)
           values($1,$2,'নতুন কালেকশন','sms','{"text":"নতুন"}','scheduled',$3,$3)`,
          [id, owner, sendAt],
        );
      }
      await blocker.query('begin');
      await blocker.query('select id from campaigns where id=$1 for update', [locked]);
      vi.spyOn(app.get(CampaignSendingRepository), 'listDueStores').mockResolvedValueOnce([
        storeId,
        store,
      ]);
      clockNow = sendAt;
      sweep = sender.startDue();
      await expect.poll(() => campaignRow(other)).toMatchObject({ status: 'sending' });
      expect(await campaignRow(sameStore)).toMatchObject({ status: 'sending' });
      expect(await campaignRow(locked)).toMatchObject({ status: 'scheduled' });
    } finally {
      await blocker.query('rollback');
      blocker.release();
      await sweep;
      vi.mocked(app.get(CampaignSendingRepository).listDueStores).mockRestore();
      await admin.pool.query('delete from campaigns where store_id=$1', [store]);
      await admin.pool.query('delete from stores where id=$1', [store]);
    }
  });

  it('starts up to 100 due campaigns per store in one sweep', async () => {
    const store = randomUUID();
    await admin.pool.query("insert into stores(id,name) values($1,'আরেকটি দোকান')", [store]);
    const backlog = Array.from({ length: 103 }, () => randomUUID());
    const outsideBacklog = randomUUID();
    try {
      for (const [owner, ids] of [
        [storeId, backlog],
        [store, [outsideBacklog]],
      ] as const) {
        await admin.pool.query(
          `insert into campaigns(id,store_id,name,channel,content,status,scheduled_for,approved_at)
           select id,$1,'নতুন কালেকশন','sms','{"text":"নতুন"}','scheduled',$2,$2
           from unnest($3::uuid[]) as id`,
          [owner, sendAt, ids],
        );
      }
      const repository = app.get(CampaignSendingRepository);
      const selected = await repository.listDueStores(sendAt, null, 2);
      expect(selected).toEqual([storeId, store].sort());
      expect(selected).toContain(store);
      const [first] = await repository.listDueStores(sendAt, null, 1);
      const [next] = await repository.listDueStores(sendAt, first!, 1);
      expect([first, next]).toEqual(selected);
      clockNow = sendAt;
      await sender.startDue();
      const { rows } = await admin.pool.query(
        `select count(*) filter (where status='sending')::int as sending,
                count(*) filter (where status='scheduled')::int as scheduled
         from campaigns where id=any($1::uuid[])`,
        [backlog],
      );
      expect(rows).toEqual([{ sending: 100, scheduled: 3 }]);
      expect(await campaignRow(outsideBacklog)).toMatchObject({ status: 'sending' });
      await sender.startDue();
      const remaining = await admin.pool.query(
        "select count(*)::int as count from campaigns where id=any($1::uuid[]) and status='scheduled'",
        [backlog],
      );
      expect(remaining.rows).toEqual([{ count: 0 }]);
    } finally {
      await admin.pool.query('delete from campaigns where id=any($1::uuid[])', [
        [...backlog, outsideBacklog],
      ]);
      await admin.pool.query('delete from stores where id=$1', [store]);
    }
  });

  it('passes future-only stores without spending the due-store page limit', async () => {
    const stores = Array.from({ length: 4 }, (_, i) => `00000000-0000-4000-8000-00000000020${i}`);
    const nextDay = new Date(sendAt.getTime() + DAY_MS);
    const [firstDue, nextDue] = [stores[1]!, stores[3]!];
    try {
      await admin.pool.query(
        "insert into stores(id,name) select id,'নতুন দোকান' from unnest($1::uuid[]) as id",
        [stores],
      );
      await admin.pool.query(
        `insert into campaigns(id,store_id,name,channel,content,status,scheduled_for,approved_at)
         select gen_random_uuid(),store_id,'নতুন প্রচারণা','sms','{"text":"নতুন"}',
                'scheduled',scheduled_for,$3
         from unnest($1::uuid[],$2::timestamptz[]) as fixture(store_id,scheduled_for)`,
        [stores, [nextDay, sendAt, nextDay, sendAt], sendAt],
      );

      const repository = app.get(CampaignSendingRepository);
      expect(await repository.listDueStores(sendAt, null, 2)).toEqual([firstDue, nextDue]);
      expect(await repository.listDueStores(sendAt, firstDue, 1)).toEqual([nextDue]);
    } finally {
      await admin.pool.query('delete from campaigns where store_id=any($1::uuid[])', [stores]);
      await admin.pool.query('delete from stores where id=any($1::uuid[])', [stores]);
    }
  });
});
