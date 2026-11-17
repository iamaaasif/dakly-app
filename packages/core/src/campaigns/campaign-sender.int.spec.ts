import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { CampaignSenderService } from './campaign-sender.service';
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
});
