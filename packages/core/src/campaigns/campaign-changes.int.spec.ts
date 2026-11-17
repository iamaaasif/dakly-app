import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCampaignSchema } from '@dakly/contracts/campaigns';
import { createDatabase } from '@dakly/db/client';

import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { SegmentsService } from '../segments/segments.service';
import { WalletService } from '../wallets/wallet.service';
import { CampaignsModule } from './campaigns.module';
import { CampaignsService } from './campaigns.service';

class TestModule {}
Module({ imports: [DatabaseModule, CampaignsModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const userId = randomUUID();
const actor = { kind: 'user', userId } as const;
const owner = {
  access: {
    role: 'owner',
    areas: { campaigns: 'edit' },
    seeFullPhone: false,
    exportLists: false,
    refund: false,
  },
  actor,
} as const;
const MINUTE = 60 * 1000;
// Tomorrow at 12:00 in Dhaka (UTC+6), outside quiet hours.
const today = new Date();
const sendAt = new Date(
  Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 6),
);
let app: INestApplicationContext;
let service: CampaignsService;
let wallets: WalletService;
let segmentId: string;
let clockNow: Date;

async function recipientRows(campaignId: string) {
  const { rows } = await admin.pool.query(
    'select contact_id, status from campaign_recipients where campaign_id=$1 order by contact_id',
    [campaignId],
  );
  return rows;
}

// A campaign to three consented Dhaka contacts, one SMS part each: 3 credits.
async function approvedCampaign(scheduledFor: Date | null) {
  const draft = createCampaignSchema.parse({
    name: 'শীতের অফার',
    channel: 'sms',
    content: { text: 'শীতের সব চাদরে ১৫% ছাড়' },
    includeSegmentIds: [segmentId],
    scheduledFor: scheduledFor?.toISOString() ?? null,
  });
  const { id } = await service.create(storeId, draft, actor);
  await service.approve(storeId, id, owner);
  return id;
}

describe('Campaign edit, cancel, pause and resume (Postgres)', () => {
  beforeAll(async () => {
    await admin.pool.query("insert into stores(id,name) values($1,'সুমির দোকান')", [storeId]);
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'সুমি',$1::text || '@example.test')",
      [userId],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(CampaignsService);
    wallets = app.get(WalletService);
    vi.spyOn(app.get(Clock), 'now').mockImplementation(() => clockNow);

    for (const phone of ['01711000001', '01711000002', '01711000003']) {
      const contactId = randomUUID();
      await admin.pool.query(
        "insert into contacts(id,store_id,name,phone,source,kind,district) values($1,$2,'রাশেদ',$3,'manual','customer','ঢাকা')",
        [contactId, storeId, phone],
      );
      await admin.pool.query(
        "insert into consents(id,store_id,contact_id,channel,status,source) values(gen_random_uuid(),$1,$2,'sms','granted','checkout')",
        [storeId, contactId],
      );
    }
    const rules = {
      match: 'all',
      conditions: [{ field: 'district', operator: 'is_any_of', values: ['ঢাকা'] }],
    } as const;
    segmentId = (await app.get(SegmentsService).create(storeId, { name: 'ঢাকা', rules }, actor)).id;
    await admin.pool.query(
      "insert into wallet_ledger(id,store_id,wallet,revision,kind,quantity_delta,balance_quantity_after,idempotency_key,actor_type) values(gen_random_uuid(),$1,'sms_credits',1,'top_up',100,100,'top-up-1','system')",
      [storeId],
    );
  });

  beforeEach(() => {
    clockNow = new Date();
  });

  afterAll(async () => {
    try {
      await app?.close();
      for (const table of ['campaigns', 'segments', 'wallet_ledger', 'outbox_events', 'contacts'])
        await admin.pool.query(`delete from ${table} where store_id=$1`, [storeId]);
      await admin.pool.query('delete from stores where id=$1', [storeId]);
      await admin.pool.query('delete from users where id=$1', [userId]);
    } finally {
      await admin.pool.end();
    }
  });

  it('refuses to cancel 4 minutes before the send and keeps the reservation', async () => {
    const id = await approvedCampaign(sendAt);
    const balance = await wallets.balance(storeId, 'sms_credits');
    clockNow = new Date(sendAt.getTime() - 4 * MINUTE);

    await expect(service.cancel(storeId, id, actor)).rejects.toMatchObject({
      code: 'CAMPAIGN_CHANGE_TOO_LATE',
    });
    await expect(service.unschedule(storeId, id, actor)).rejects.toMatchObject({
      code: 'CAMPAIGN_CHANGE_TOO_LATE',
    });

    expect((await service.get(storeId, id)).status).toBe('scheduled');
    expect(await wallets.balance(storeId, 'sms_credits')).toBe(balance);
    expect((await recipientRows(id)).every((row) => row.status === 'queued')).toBe(true);
  });

  it('cancels 6 minutes before the send and gives the credits back', async () => {
    const before = await wallets.balance(storeId, 'sms_credits');
    const id = await approvedCampaign(sendAt);
    expect(await wallets.balance(storeId, 'sms_credits')).toBe(before - 3);
    clockNow = new Date(sendAt.getTime() - 6 * MINUTE);

    expect((await service.cancel(storeId, id, actor)).status).toBe('cancelled');

    expect(await wallets.balance(storeId, 'sms_credits')).toBe(before);
    const rows = await recipientRows(id);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.status === 'cancelled')).toBe(true);
    await expect(service.cancel(storeId, id, actor)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_SCHEDULED',
    });
  });

  it('returns a scheduled campaign to draft, then approves it again', async () => {
    const before = await wallets.balance(storeId, 'sms_credits');
    const id = await approvedCampaign(sendAt);
    clockNow = new Date(sendAt.getTime() - 6 * MINUTE);

    expect((await service.unschedule(storeId, id, actor)).status).toBe('draft');
    expect(await wallets.balance(storeId, 'sms_credits')).toBe(before);
    expect(await recipientRows(id)).toEqual([]);
    const [cleared] = (
      await admin.pool.query(
        'select approved_at, approved_by_user_id, estimated_cost_poisha, recipients_count, skipped_count from campaigns where id=$1',
        [id],
      )
    ).rows;
    expect(cleared).toEqual({
      approved_at: null,
      approved_by_user_id: null,
      estimated_cost_poisha: null,
      recipients_count: 0,
      skipped_count: 0,
    });

    await service.changeDraft(storeId, id, { content: { text: 'শীতের সব চাদরে ২০% ছাড়' } }, actor);
    expect((await service.approve(storeId, id, owner)).status).toBe('scheduled');
    expect(await wallets.balance(storeId, 'sms_credits')).toBe(before - 3);
    expect(await recipientRows(id)).toHaveLength(3);
  });

  it('pauses a sending campaign, resumes it and refuses the moves its state does not allow', async () => {
    const id = await approvedCampaign(null);

    await expect(service.resume(storeId, id, actor)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_PAUSED',
    });
    expect((await service.pause(storeId, id, actor)).status).toBe('paused');
    const [paused] = (
      await admin.pool.query('select status, pause_reason from campaigns where id=$1', [id])
    ).rows;
    expect(paused).toEqual({ status: 'paused', pause_reason: 'manual' });
    await expect(service.pause(storeId, id, actor)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_SENDING',
    });
    expect((await service.resume(storeId, id, actor)).status).toBe('sending');
    const [resumed] = (
      await admin.pool.query('select status, pause_reason from campaigns where id=$1', [id])
    ).rows;
    expect(resumed).toEqual({ status: 'sending', pause_reason: null });
  });
});
