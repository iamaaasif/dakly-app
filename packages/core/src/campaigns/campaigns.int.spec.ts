import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCampaignSchema } from '@dakly/contracts/campaigns';
import { createDatabase } from '@dakly/db/client';

import { DatabaseModule } from '../platform/database/database.module';
import { CampaignsModule } from './campaigns.module';
import { CampaignsService } from './campaigns.service';

class TestModule {}
Module({ imports: [DatabaseModule, CampaignsModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const userId = randomUUID();
const actor = { kind: 'user', userId } as const;
let app: INestApplicationContext;
let service: CampaignsService;

function draft(name: string) {
  return service.create(storeId, createCampaignSchema.parse({ name, channel: 'sms' }), actor);
}

describe('CampaignsService drafts (Postgres)', () => {
  beforeAll(async () => {
    await admin.pool.query("insert into stores(id,name) values($1,'রিনার দোকান')", [storeId]);
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'রিনা',$1::text || '@example.test')",
      [userId],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(CampaignsService);
  });

  afterAll(async () => {
    try {
      await app?.close();
      await admin.pool.query('delete from campaigns where store_id=$1', [storeId]);
      await admin.pool.query('delete from stores where id=$1', [storeId]);
      await admin.pool.query('delete from users where id=$1', [userId]);
    } finally {
      await admin.pool.end();
    }
  });

  it('saves a draft with an empty message and lists the newest first, a page at a time', async () => {
    const first = await draft('শীতের অফার');
    const second = await draft('ঈদের অফার');
    expect(first).toMatchObject({
      status: 'draft',
      channel: 'sms',
      goal: null,
      content: { text: '' },
      includeSegmentIds: [],
      scheduledFor: null,
    });
    const page = await service.list(storeId, { limit: 1 });
    expect(page.items.map((item) => item.id)).toEqual([second.id]);
    const next = await service.list(storeId, { limit: 1, cursor: page.nextCursor! });
    expect(next.items.map((item) => item.id)).toEqual([first.id]);
  });

  it('changes only the fields sent', async () => {
    const campaign = await draft('ফিরে আসুন');
    const segmentId = randomUUID();
    const changed = await service.changeDraft(
      storeId,
      campaign.id,
      { content: { text: 'আপনার জন্য ১৫% ছাড়' }, includeSegmentIds: [segmentId] },
      actor,
    );
    expect(changed).toMatchObject({
      name: 'ফিরে আসুন',
      content: { text: 'আপনার জন্য ১৫% ছাড়' },
      includeSegmentIds: [segmentId],
    });
    const scheduled = await service.changeDraft(
      storeId,
      campaign.id,
      { scheduledFor: '2026-11-20T13:30:00.000Z' },
      actor,
    );
    expect(scheduled).toMatchObject({
      scheduledFor: '2026-11-20T13:30:00.000Z',
      content: { text: 'আপনার জন্য ১৫% ছাড়' },
    });
  });

  it('refuses to change or delete a campaign that is no longer a draft', async () => {
    const campaign = await draft('ভিআইপি অফার');
    await admin.pool.query("update campaigns set status='scheduled' where id=$1", [campaign.id]);
    await expect(
      service.changeDraft(storeId, campaign.id, { name: 'নতুন নাম' }, actor),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_DRAFT' });
    await expect(service.removeDraft(storeId, campaign.id, actor)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_DRAFT',
    });
    expect(await service.get(storeId, campaign.id)).toMatchObject({
      name: 'ভিআইপি অফার',
      status: 'scheduled',
    });
  });

  it('deletes a draft and then reports it missing', async () => {
    const campaign = await draft('পুরনো খসড়া');
    await service.removeDraft(storeId, campaign.id, actor);
    await expect(service.get(storeId, campaign.id)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
    await expect(
      service.changeDraft(storeId, campaign.id, { name: 'আবার' }, actor),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
  });
});
