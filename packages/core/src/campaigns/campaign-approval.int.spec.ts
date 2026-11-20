import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createCampaignSchema } from '@dakly/contracts/campaigns';
import type { StoreAccess } from '@dakly/contracts/team';
import { createDatabase } from '@dakly/db/client';

import { runApprovalJob } from '../../test/approve-campaign';
import { resetEnvForTests } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { SegmentsService } from '../segments/segments.service';
import { StoresService } from '../stores/stores.service';
import { WalletService } from '../wallets/wallet.service';
import { CampaignApprovalService } from './campaign-approval.service';
import { CampaignsModule } from './campaigns.module';
import { CampaignsService } from './campaigns.service';

class TestModule {}
Module({ imports: [DatabaseModule, CampaignsModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const userId = randomUUID();
const actor = { kind: 'user', userId } as const;
const access = (role: 'owner' | 'marketer'): StoreAccess => ({
  role,
  areas: { campaigns: 'edit' },
  seeFullPhone: false,
  exportLists: false,
  refund: false,
});
const owner = { access: access('owner'), actor };
const HOUR = 60 * 60 * 1000;
const SHORT_LINK_BASE = 'https://s.example.test/l';
// Tomorrow at 12:00 in Dhaka (UTC+6), outside quiet hours, so the cap is checked.
const today = new Date();
const sendAt = new Date(
  Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 6),
);
const dhaka = {
  match: 'all',
  conditions: [{ field: 'district', operator: 'is_any_of', values: ['ঢাকা'] }],
} as const;
let app: INestApplicationContext;
let service: CampaignsService;
let phone = 0;

async function dhakaContact(tags: string[] = []) {
  const id = randomUUID();
  await admin.pool.query(
    "insert into contacts(id,store_id,name,phone,source,kind,district,tags) values($1,$2,'সুমি',$3,'manual','customer','ঢাকা',$4)",
    [id, storeId, `0171${String(++phone).padStart(7, '0')}`, tags],
  );
  return id;
}

async function grantSms(contactId: string) {
  await admin.pool.query(
    "insert into consents(id,store_id,contact_id,channel,status,source) values(gen_random_uuid(),$1,$2,'sms','granted','checkout')",
    [storeId, contactId],
  );
}

// A marketing SMS two hours before the send time puts the contact over the daily cap.
async function sentEarlier(contactId: string) {
  const campaignId = randomUUID();
  await admin.pool.query(
    "insert into campaigns(id,store_id,name,channel,content,status) values($1,$2,'আগের অফার','sms','{}','sent')",
    [campaignId, storeId],
  );
  await admin.pool.query(
    "insert into campaign_recipients(id,store_id,campaign_id,contact_id,status,sent_at) values(gen_random_uuid(),$1,$2,$3,'sent',$4)",
    [storeId, campaignId, contactId, new Date(sendAt.getTime() - 2 * HOUR)],
  );
}

async function smsCredits(quantity: number, revision: number) {
  const id = randomUUID();
  const balance = (await app.get(WalletService).balance(storeId, 'sms_credits')) + quantity;
  await admin.pool.query(
    "insert into wallet_ledger(id,store_id,wallet,revision,kind,quantity_delta,balance_quantity_after,idempotency_key,actor_type) values($1::uuid,$2,'sms_credits',$3,'top_up',$4,$5,$1::text,'system')",
    [id, storeId, revision, quantity, balance],
  );
}

async function recipientRows(campaignId: string) {
  const { rows } = await admin.pool.query(
    'select contact_id, status, skip_reason, destination_address from campaign_recipients where campaign_id=$1 order by contact_id',
    [campaignId],
  );
  return rows;
}

describe('Campaign estimate and approval (Postgres)', () => {
  let campaignId: string;
  let includeId: string;
  let estimate: Awaited<ReturnType<CampaignsService['estimate']>>;

  beforeAll(async () => {
    vi.stubEnv('SHORT_LINK_BASE_URL', SHORT_LINK_BASE);
    resetEnvForTests();
    await admin.pool.query("insert into stores(id,name) values($1,'রিনার দোকান')", [storeId]);
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'রিনা',$1::text || '@example.test')",
      [userId],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(CampaignsService);
    const segments = app.get(SegmentsService);

    // 130 in Dhaka, 2 excluded as VIP: 128 in the audience. 109 have SMS consent and 6 of
    // them got a marketing SMS today, which leaves 103.
    const audience = [];
    for (let index = 0; index < 128; index++) audience.push(await dhakaContact());
    for (const vip of [await dhakaContact(['vip']), await dhakaContact(['vip'])])
      await grantSms(vip);
    for (const contactId of audience.slice(0, 109)) await grantSms(contactId);
    for (const contactId of audience.slice(0, 6)) await sentEarlier(contactId);

    includeId = (await segments.create(storeId, { name: 'ঢাকা', rules: dhaka }, actor)).id;
    const vipRules = {
      match: 'all',
      conditions: [{ field: 'tag', operator: 'is_any_of', values: ['vip'] }],
    } as const;
    const excludeId = (await segments.create(storeId, { name: 'ভিআইপি', rules: vipRules }, actor))
      .id;
    const draft = createCampaignSchema.parse({
      name: 'ফিরে আসুন',
      channel: 'sms',
      // The 150-character message needs a second part only once the opt-out link is included.
      content: { text: `Rina's shop: ${'a'.repeat(137)}` },
      includeSegmentIds: [includeId],
      excludeSegmentIds: [excludeId],
      scheduledFor: sendAt.toISOString(),
    });
    campaignId = (await service.create(storeId, draft, actor)).id;
  });

  afterAll(async () => {
    try {
      await app?.close();
      for (const table of ['campaigns', 'segments', 'wallet_ledger', 'outbox_events', 'contacts'])
        await admin.pool.query(`delete from ${table} where store_id=$1`, [storeId]);
      await admin.pool.query('delete from stores where id=$1', [storeId]);
      await admin.pool.query('delete from users where id=$1', [userId]);
    } finally {
      vi.unstubAllEnvs();
      resetEnvForTests();
      await admin.pool.end();
    }
  });

  it('estimates 128 in the audience, 6 over the cap and 19 without consent, giving 103', async () => {
    estimate = await service.estimate(storeId, campaignId);

    expect(estimate).toEqual({
      isComplete: true,
      audienceCount: 128,
      skippedByReason: { no_consent: 19, frequency_cap: 6 },
      recipientsCount: 103,
      smsParts: 2,
      smsCredits: 206,
      costPoisha: 0,
    });
  });

  it('refuses a Marketer while only owners and admins approve', async () => {
    await expect(
      service.approve(storeId, campaignId, { access: access('marketer'), actor }),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_APPROVAL_DENIED', status: 403 });

    expect((await service.get(storeId, campaignId)).status).toBe('draft');
  });

  it('keeps a custom role with campaigns and settings edit from turning approval off', async () => {
    const custom: StoreAccess = {
      role: 'custom',
      areas: { campaigns: 'edit', storeSettings: 'edit' },
      seeFullPhone: false,
      exportLists: false,
      refund: false,
    };
    const sending = {
      quietHours: { startHour: 21, endHour: 9 },
      frequencyCap: { perChannelPerDay: 1, perSevenDays: 3 },
      onlyOwnersAndAdminsApprove: false,
    };

    await expect(
      app.get(StoresService).changeSettings(storeId, { sending }, { userId, access: custom }),
    ).rejects.toMatchObject({ code: 'STORE_APPROVAL_SETTING_DENIED', status: 403 });
    await expect(
      service.approve(storeId, campaignId, { access: custom, actor }),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_APPROVAL_DENIED' });
    expect((await app.get(StoresService).sendingSettings(storeId)).onlyOwnersAndAdminsApprove).toBe(
      true,
    );
  });

  it('returns the draft with the reason when the balance cannot cover the approval', async () => {
    await smsCredits(205, 1);

    const started = await service.approve(storeId, campaignId, owner);
    expect(started.status).toBe('approving');
    await runApprovalJob(app.get(CampaignApprovalService), admin.pool, storeId, campaignId);

    expect(await service.get(storeId, campaignId)).toMatchObject({
      status: 'draft',
      approval: null,
      approvalFailureCode: 'WALLET_BALANCE_TOO_LOW',
    });
    expect(await recipientRows(campaignId)).toEqual([]);
    expect(await app.get(WalletService).balance(storeId, 'sms_credits')).toBe(205);
    const events = await admin.pool.query(
      "select 1 from outbox_events where store_id=$1 and type='campaign.approved'",
      [storeId],
    );
    expect(events.rowCount).toBe(0);
  });

  it('freezes the audience, reserves the estimated credits and schedules the campaign', async () => {
    await smsCredits(95, 2);

    expect((await service.approve(storeId, campaignId, owner)).status).toBe('approving');
    await runApprovalJob(app.get(CampaignApprovalService), admin.pool, storeId, campaignId);
    const approved = await service.get(storeId, campaignId);

    expect(approved).toMatchObject({ status: 'scheduled', approvalFailureCode: null });
    const { rows: times } = await admin.pool.query(
      'select approved_at, started_at, short_link_base from campaigns where id=$1',
      [campaignId],
    );
    expect(times).toEqual([
      {
        approved_at: expect.any(Date),
        started_at: null,
        short_link_base: SHORT_LINK_BASE,
      },
    ]);
    const [counts] = (
      await admin.pool.query('select recipients_count, skipped_count from campaigns where id=$1', [
        campaignId,
      ])
    ).rows;
    expect(counts).toEqual({ recipients_count: 103, skipped_count: 25 });
    expect(300 - (await app.get(WalletService).balance(storeId, 'sms_credits'))).toBe(
      estimate.smsCredits,
    );
    const rows = await recipientRows(campaignId);
    expect(rows).toHaveLength(128);
    expect(rows.filter((row) => row.status === 'queued')).toHaveLength(103);
    expect(rows.filter((row) => row.skip_reason === 'no_consent')).toHaveLength(19);
    expect(rows.filter((row) => row.skip_reason === 'frequency_cap')).toHaveLength(6);
    expect(rows.every((row) => /^0171\d{7}$/.test(row.destination_address))).toBe(true);
    const events = await admin.pool.query(
      "select payload from outbox_events where store_id=$1 and type='campaign.approved'",
      [storeId],
    );
    expect(events.rows).toEqual([{ payload: { campaignId, status: 'scheduled' } }]);
  });

  it('keeps the frozen audience when the segment and contacts change after approval', async () => {
    const before = await recipientRows(campaignId);
    await grantSms(await dhakaContact());
    await app.get(SegmentsService).change(
      storeId,
      includeId,
      {
        rules: {
          match: 'all',
          conditions: [{ field: 'kind', operator: 'is_any_of', values: ['lead'] }],
        },
      },
      actor,
    );

    expect(await recipientRows(campaignId)).toEqual(before);
    await expect(service.approve(storeId, campaignId, owner)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_DRAFT',
    });
  });

  it('refuses an estimate for a segment that does not exist', async () => {
    const draft = createCampaignSchema.parse({
      name: 'হারানো সেগমেন্ট',
      channel: 'sms',
      includeSegmentIds: [randomUUID()],
    });
    const { id } = await service.create(storeId, draft, actor);

    await expect(service.estimate(storeId, id)).rejects.toMatchObject({
      code: 'SEGMENT_NOT_FOUND',
    });
  });
});
