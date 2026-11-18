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
    await app
      .get(ValkeyClient)
      .connection.del('campaign-start:store', `campaign-start:campaign:${storeId}`);
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

  it('starts the other due campaigns when one fails', async () => {
    const [failing, other] = [randomUUID(), randomUUID()];
    for (const id of [failing, other])
      await admin.pool.query(
        `insert into campaigns(id,store_id,name,channel,content,status,scheduled_for,approved_at)
         values($1,$2,'নতুন কালেকশন','sms','{"text":"নতুন"}','scheduled',$3,now())`,
        [id, storeId, sendAt],
      );
    const start = CampaignSendingRepository.prototype.start;
    const failStart = vi
      .spyOn(CampaignSendingRepository.prototype, 'start')
      .mockImplementation(async function (this: CampaignSendingRepository, ...args) {
        if (args[1] === failing) throw new Error('database unavailable');
        return start.apply(this, args);
      });
    const quiet = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const report = vi
      .spyOn(app.get(ErrorReporter), 'reportJob')
      .mockImplementation(() => undefined);
    clockNow = sendAt;

    await runWithJobContext(() => sender.startDue(), 'sweep-job-1');

    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ errorClass: 'Error' }),
      'sweep-job-1',
    );
    expect(await campaignRow(failing)).toMatchObject({ status: 'scheduled' });
    expect(await campaignRow(other)).toMatchObject({ status: 'sending' });
    failStart.mockRestore();
    quiet.mockRestore();
    report.mockRestore();
  });

  it('continues to the next store when the first store page fails', async () => {
    const store = randomUUID();
    const [firstStore, nextStore] = [storeId, store].sort() as [string, string];
    const firstCampaign = randomUUID();
    const nextCampaign = randomUUID();
    const connection = app.get(ValkeyClient).connection;
    const cursor = `campaign-start:campaign:${firstStore}`;
    await admin.pool.query("insert into stores(id,name) values($1,'নতুন দোকান')", [store]);
    try {
      await admin.pool.query(
        `insert into campaigns(id,store_id,name,channel,content,status,scheduled_for,approved_at)
         values($1,$2,'নতুন কালেকশন','sms','{"text":"নতুন"}','scheduled',$5,$5),
               ($3,$4,'নতুন কালেকশন','sms','{"text":"নতুন"}','scheduled',$5,$5)`,
        [firstCampaign, firstStore, nextCampaign, nextStore, sendAt],
      );
      await connection.set(cursor, 'invalid-campaign-id');
      clockNow = sendAt;

      await sender.startDue();

      expect(await campaignRow(firstCampaign)).toMatchObject({ status: 'scheduled' });
      expect(await campaignRow(nextCampaign)).toMatchObject({ status: 'sending' });
      expect(await connection.get('campaign-start:store')).toBe(nextStore);
    } finally {
      await connection.del(cursor, `campaign-start:campaign:${nextStore}`);
      await admin.pool.query('delete from campaigns where id in ($1,$2)', [
        firstCampaign,
        nextCampaign,
      ]);
      await admin.pool.query('delete from stores where id=$1', [store]);
    }
  });

  it('backfills another store while the first legacy start is locked', async () => {
    const store = randomUUID();
    const [firstStore, nextStore] = [storeId, store].sort() as [string, string];
    const first = randomUUID();
    const next = randomUUID();
    const connection = app.get(ValkeyClient).connection;
    const cursor = 'campaign-start:backfill-store';
    const discover = vi
      .spyOn(app.get(CampaignSendingRepository), 'nextBackfillStore')
      .mockImplementation(async (after) =>
        [firstStore, nextStore].find((id) => !after || id > after),
      );
    const blocker = await admin.pool.connect();
    try {
      await connection.del(cursor);
      await admin.pool.query("insert into stores(id,name) values($1,'নতুন দোকান')", [store]);
      await admin.pool.query(
        `insert into campaigns(id,store_id,name,channel,content,status,approved_at)
         values($1,$2,'পুরানো প্রচারণা','sms','{"text":"নতুন"}','sending',$5),
               ($3,$4,'পুরানো প্রচারণা','sms','{"text":"নতুন"}','sending',$5)`,
        [first, firstStore, next, nextStore, sendAt],
      );
      await blocker.query('begin');
      await blocker.query('select id from campaigns where id=$1 for update', [first]);

      await sender.backfillStarts();
      await sender.backfillStarts();
      expect(await campaignRow(first)).toMatchObject({ started_at: null });
      expect(await campaignRow(next)).toMatchObject({ started_at: sendAt });

      await blocker.query('commit');
      await sender.backfillStarts();
      await sender.backfillStarts();
      expect(await campaignRow(first)).toMatchObject({ started_at: sendAt });
    } finally {
      await blocker.query('rollback');
      blocker.release();
      discover.mockRestore();
      await connection.del(cursor);
      await admin.pool.query('delete from campaigns where id in ($1,$2)', [first, next]);
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

  it('keeps an older immediate campaign first when its start time is missing', async () => {
    const store = randomUUID();
    const [legacy, newer] = [randomUUID(), randomUUID()];
    await admin.pool.query("insert into stores(id,name) values($1,'নতুন দোকান')", [store]);
    try {
      await admin.pool.query(
        `insert into campaigns(id,store_id,name,channel,content,status,approved_at,started_at)
         values($1,$3,'পুরানো','sms','{"text":"নতুন"}','sending',$4,null),
               ($2,$3,'নতুন','sms','{"text":"নতুন"}','sending',$5,$5)`,
        [legacy, newer, store, new Date(sendAt.getTime() - 60_000), sendAt],
      );
      const names = await admin.pool.query<{ campaign_id: string }>(
        'select campaign_id from sending_campaigns() where store_id=$1',
        [store],
      );
      expect(names.rows).toEqual([{ campaign_id: legacy }]);
    } finally {
      await admin.pool.query('delete from campaigns where store_id=$1', [store]);
      await admin.pool.query('delete from stores where id=$1', [store]);
    }
  });

  it('starts another store’s campaign while the first due row is locked', async () => {
    const store = randomUUID();
    const [locked, other] = [randomUUID(), randomUUID()];
    await admin.pool.query("insert into stores(id,name) values($1,'নতুন দোকান')", [store]);
    const blocker = await admin.pool.connect();
    let sweep: Promise<void> | undefined;
    try {
      for (const [id, owner] of [
        [locked, storeId],
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

  it('gives a second store a turn inside the due campaign limit', async () => {
    const store = randomUUID();
    await admin.pool.query("insert into stores(id,name) values($1,'আরেকটি দোকান')", [store]);
    const backlog = Array.from({ length: 5 }, () => randomUUID());
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
    } finally {
      await admin.pool.query('delete from campaigns where id=any($1::uuid[])', [
        [...backlog, outsideBacklog],
      ]);
      await admin.pool.query('delete from stores where id=$1', [store]);
    }
  });

  it('advances past a page whose campaigns keep failing', async () => {
    const [first, second, healthy] = [randomUUID(), randomUUID(), randomUUID()];
    const fixtureTime = new Date(sendAt.getTime() - 60_000);
    for (const [id, scheduled] of [
      [first, fixtureTime],
      [second, fixtureTime],
      [healthy, new Date(fixtureTime.getTime() + 1000)],
    ] as const)
      await admin.pool.query(
        `insert into campaigns(id,store_id,name,channel,content,status,scheduled_for,approved_at)
         values($1,$2,'পরের ক্যাম্পেইন','sms','{"text":"নতুন"}','scheduled',$3,$3)`,
        [id, storeId, scheduled],
      );
    const start = CampaignSendingRepository.prototype.start;
    const hook = vi
      .spyOn(CampaignSendingRepository.prototype, 'start')
      .mockImplementation(async function (this: CampaignSendingRepository, ...args) {
        if (args[1] === first || args[1] === second) throw new Error('database unavailable');
        return start.apply(this, args);
      });
    clockNow = sendAt;
    try {
      await sender.startDue();
      expect(await campaignRow(healthy)).toMatchObject({ status: 'scheduled' });
      await sender.startDue();
      expect(await campaignRow(healthy)).toMatchObject({ status: 'sending' });
      expect(await campaignRow(first)).toMatchObject({ status: 'scheduled' });
      expect(await campaignRow(second)).toMatchObject({ status: 'scheduled' });
    } finally {
      hook.mockRestore();
    }
  });
});
