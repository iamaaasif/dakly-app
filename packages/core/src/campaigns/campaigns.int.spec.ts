import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { campaignListQuerySchema, createCampaignSchema } from '@dakly/contracts/campaigns';
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

  it('pages by creation time down to the microsecond and breaks ties by descending id', async () => {
    const suffix = randomUUID().slice(8);
    const newest = `10000000${suffix}`;
    const lowerTie = `20000000${suffix}`;
    const higherTie = `30000000${suffix}`;
    await admin.pool.query(
      `insert into campaigns(id, store_id, name, channel, content, created_at)
       values ($1, $4, 'নববর্ষের অফার', 'sms', '{}', '2026-04-14T00:00:00.000002Z'),
              ($2, $4, 'নববর্ষের অফার', 'sms', '{}', '2026-04-14T00:00:00.000001Z'),
              ($3, $4, 'নববর্ষের অফার', 'sms', '{}', '2026-04-14T00:00:00.000001Z')`,
      [newest, lowerTie, higherTie, storeId],
    );

    const query = { limit: 1, search: 'নববর্ষের অফার' };
    const first = await service.list(storeId, query);
    expect(first.items.map(({ id }) => id)).toEqual([newest]);
    expect(first.nextCursor).toBe(newest);
    const second = await service.list(storeId, { ...query, cursor: newest });
    expect(second.items.map(({ id }) => id)).toEqual([higherTie]);
    expect(second.nextCursor).toBe(higherTie);
    const third = await service.list(storeId, { ...query, cursor: higherTie });
    expect(third.items.map(({ id }) => id)).toEqual([lowerTie]);
    expect(third.nextCursor).toBeNull();
  });

  it('filters names literally, includes the start date and excludes the end date', async () => {
    const matching = await draft('VIP 20%');
    const earlier = await draft('VIP 20% earlier');
    const later = await draft('VIP 20% later');
    const wildcard = await draft('VIP 200');
    const otherStatus = await draft('VIP 20% sent');
    await admin.pool.query('update campaigns set created_at=$1 where id=any($2::uuid[])', [
      '2026-11-18T00:00:00.000Z',
      [matching.id, wildcard.id, otherStatus.id],
    ]);
    await admin.pool.query('update campaigns set created_at=$1 where id=$2', [
      '2026-11-17T23:59:59.999Z',
      earlier.id,
    ]);
    await admin.pool.query('update campaigns set created_at=$1 where id=$2', [
      '2026-11-19T00:00:00.000Z',
      later.id,
    ]);
    await admin.pool.query("update campaigns set status='sent' where id=$1", [otherStatus.id]);

    const query = campaignListQuerySchema.parse({
      search: 'vip 20%',
      status: 'draft',
      channel: 'sms',
      createdFrom: '2026-11-18T00:00:00.000Z',
      createdBefore: '2026-11-19T00:00:00.000Z',
    });
    const result = await service.list(storeId, query);
    expect(result.items.map(({ id }) => id)).toEqual([matching.id]);
    expect(result.nextCursor).toBeNull();
    expect((await service.list(storeId, { ...query, channel: 'whatsapp' })).items).toEqual([]);
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
