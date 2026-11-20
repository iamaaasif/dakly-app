import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createCampaignSchema } from '@dakly/contracts/campaigns';
import type { StoreAccess } from '@dakly/contracts/team';
import { createDatabase } from '@dakly/db/client';

import { runApprovalJob } from '../../test/approve-campaign';
import { Clock } from '../platform/clock';
import { resetEnvForTests } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { SegmentsService } from '../segments/segments.service';
import { SendPolicyService } from '../sending/send-policy.service';
import { WalletService } from '../wallets/wallet.service';
import { CampaignApprovalRepository } from './campaign-approval.repository';
import { CampaignApprovalService } from './campaign-approval.service';
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
  } satisfies StoreAccess,
  actor,
};
// The large audience is more than the 20,000 the approval request used to take. The small one
// takes three pages, so the other tests stay quick. Neither is a multiple of the 500-contact page.
const LARGE = 20_503;
const SMALL = 1_203;
const PAGE = 500;
let app: INestApplicationContext;
let service: CampaignsService;
let approval: CampaignApprovalService;
let approvals: CampaignApprovalRepository;
let largeId: string;
let smallId: string;

async function credits(quantity: number) {
  const id = randomUUID();
  const balance = (await app.get(WalletService).balance(storeId, 'sms_credits')) + quantity;
  const { rows } = await admin.pool.query(
    'select coalesce(max(revision), 0) + 1 as next from wallet_ledger where store_id=$1',
    [storeId],
  );
  await admin.pool.query(
    "insert into wallet_ledger(id,store_id,wallet,revision,kind,quantity_delta,balance_quantity_after,idempotency_key,actor_type) values($1::uuid,$2,'sms_credits',$3,'top_up',$4,$5,$1::text,'system')",
    [id, storeId, rows[0].next, quantity, balance],
  );
}

// Holds all but a few credits, so the next approval cannot be covered; the returned function lets go.
async function leaveCredits(left: number) {
  const wallets = app.get(WalletService);
  const held = await wallets.reserve(storeId, {
    wallet: 'sms_credits',
    quantity: (await wallets.balance(storeId, 'sms_credits')) - left,
    idempotencyKey: `hold-${randomUUID()}`,
    actor,
  });
  return () =>
    wallets.release(storeId, {
      reservationId: held.entryId,
      idempotencyKey: `release-${randomUUID()}`,
      actor,
    });
}

async function draft(segmentId = smallId) {
  const input = createCampaignSchema.parse({
    name: 'বড় অফার',
    channel: 'sms',
    content: { text: 'শীতের সব চাদরে ১৫% ছাড়' },
    includeSegmentIds: [segmentId],
  });
  return (await service.create(storeId, input, actor)).id;
}

async function approvedAt(campaignId: string) {
  const { rows } = await admin.pool.query('select approved_at from campaigns where id=$1', [
    campaignId,
  ]);
  return rows[0].approved_at as Date;
}

async function frozen(campaignId: string) {
  const { rows } = await admin.pool.query(
    'select count(*)::int as total, count(distinct contact_id)::int as contacts from campaign_recipients where campaign_id=$1',
    [campaignId],
  );
  return rows[0] as { total: number; contacts: number };
}

async function reservations() {
  const { rows } = await admin.pool.query(
    "select count(*)::int as count from wallet_ledger where store_id=$1 and kind='reserve'",
    [storeId],
  );
  return rows[0].count as number;
}

describe('Campaign approval job (Postgres)', () => {
  beforeAll(async () => {
    vi.stubEnv('SHORT_LINK_BASE_URL', 'https://s.example.test/l');
    resetEnvForTests();
    await admin.pool.query("insert into stores(id,name) values($1,'রিনার দোকান')", [storeId]);
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'রিনা',$1::text || '@example.test')",
      [userId],
    );
    for (const [district, count, offset] of [
      ['ঢাকা', LARGE, 0],
      ['সিলেট', SMALL, LARGE],
    ] as const)
      await admin.pool.query(
        `insert into contacts(id,store_id,name,phone,source,kind,district)
         select gen_random_uuid(), $1, 'সুমি', '0171' || lpad((n + $4)::text, 7, '0'), 'manual', 'customer', $3
         from generate_series(1, $2) n`,
        [storeId, count, district, offset],
      );
    await admin.pool.query(
      `insert into consents(id,store_id,contact_id,channel,status,source)
       select gen_random_uuid(), store_id, id, 'sms', 'granted', 'checkout' from contacts where store_id=$1`,
      [storeId],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(CampaignsService);
    approval = app.get(CampaignApprovalService);
    approvals = app.get(CampaignApprovalRepository);
    const segments = app.get(SegmentsService);
    const inDistrict = (district: string) =>
      ({
        match: 'all',
        conditions: [{ field: 'district', operator: 'is_any_of', values: [district] }],
      }) as const;
    largeId = (await segments.create(storeId, { name: 'ঢাকা', rules: inDistrict('ঢাকা') }, actor))
      .id;
    smallId = (await segments.create(storeId, { name: 'সিলেট', rules: inDistrict('সিলেট') }, actor))
      .id;
    await credits(1_000_000);
  }, 120_000);

  afterEach(() => vi.restoreAllMocks());

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
  }, 120_000);

  it('runs again after it finished without writing or reserving anything more', async () => {
    const campaignId = await draft();
    await service.approve(storeId, campaignId, owner);
    await runApprovalJob(approval, admin.pool, storeId, campaignId);
    const reservedBefore = await reservations();
    const before = await service.get(storeId, campaignId);

    await runApprovalJob(approval, admin.pool, storeId, campaignId);

    expect(await service.get(storeId, campaignId)).toEqual(before);
    expect(await reservations()).toBe(reservedBefore);
    expect(await frozen(campaignId)).toEqual({ total: SMALL, contacts: SMALL });
  });

  it('continues from the last committed page after a crash and freezes each contact once', async () => {
    const campaignId = await draft();
    await service.approve(storeId, campaignId, owner);
    const key = { id: campaignId, approvedAt: await approvedAt(campaignId) };
    const original = SendPolicyService.prototype.checkAudience;
    let calls = 0;
    vi.spyOn(SendPolicyService.prototype, 'checkAudience').mockImplementation(function (
      this: SendPolicyService,
      ...args
    ) {
      if (++calls === 3) throw new Error('worker stopped');
      return original.apply(this, args);
    });

    await expect(approval.build(storeId, key)).rejects.toThrow('worker stopped');

    expect(await service.get(storeId, campaignId)).toMatchObject({
      status: 'approving',
      approval: { checked: 2 * PAGE, estimatedTotal: SMALL },
    });
    expect(await frozen(campaignId)).toEqual({ total: 2 * PAGE, contacts: 2 * PAGE });
    vi.restoreAllMocks();

    await runApprovalJob(approval, admin.pool, storeId, campaignId);

    expect(await frozen(campaignId)).toEqual({ total: SMALL, contacts: SMALL });
    expect((await service.get(storeId, campaignId)).status).toBe('sending');
  });

  it('stops after its time and asks to run again, with progress the screen can read', async () => {
    const campaignId = await draft();
    await service.approve(storeId, campaignId, owner);
    const key = { id: campaignId, approvedAt: await approvedAt(campaignId) };
    const clock = app.get(Clock);
    const real = clock.now.bind(clock);
    let ticks = 0;
    vi.spyOn(clock, 'now').mockImplementation(() => new Date(real().getTime() + 6_000 * ticks++));

    const next = await approval.build(storeId, key);

    expect(next).toEqual({ delayUntil: expect.any(Number) });
    const { approval: progress } = await service.get(storeId, campaignId);
    expect(progress?.estimatedTotal).toBe(SMALL);
    expect(progress?.checked).toBeGreaterThan(0);
    expect(progress?.checked).toBeLessThan(SMALL);
    expect(progress!.checked % PAGE).toBe(0);
    vi.restoreAllMocks();

    await runApprovalJob(approval, admin.pool, storeId, campaignId);

    expect(await frozen(campaignId)).toEqual({ total: SMALL, contacts: SMALL });
  });

  it('goes back to draft with the reason and no rows when the balance is short', async () => {
    const letGo = await leaveCredits(10);
    const campaignId = await draft();
    await service.approve(storeId, campaignId, owner);
    const reservedBefore = await reservations();

    await runApprovalJob(approval, admin.pool, storeId, campaignId);

    expect(await service.get(storeId, campaignId)).toMatchObject({
      status: 'draft',
      approval: null,
      approvalFailureCode: 'WALLET_BALANCE_TOO_LOW',
    });
    expect(await frozen(campaignId)).toEqual({ total: 0, contacts: 0 });
    expect(await reservations()).toBe(reservedBefore);
    await letGo();
  });

  it('finishes undoing a failed approval after a crash instead of approving it', async () => {
    const letGo = await leaveCredits(10);
    const campaignId = await draft();
    await service.approve(storeId, campaignId, owner);
    const key = { id: campaignId, approvedAt: await approvedAt(campaignId) };
    vi.spyOn(CampaignApprovalRepository.prototype, 'removeRecipientsBatch').mockRejectedValueOnce(
      new Error('worker stopped'),
    );

    await expect(approval.build(storeId, key)).rejects.toThrow('worker stopped');
    expect(await frozen(campaignId)).toEqual({ total: SMALL, contacts: SMALL });
    // The balance now covers the audience, but the approval was already refused.
    await letGo();
    const reservedBefore = await reservations();
    await approval.build(storeId, key);

    expect(await service.get(storeId, campaignId)).toMatchObject({
      status: 'draft',
      approvalFailureCode: 'WALLET_BALANCE_TOO_LOW',
    });
    expect(await frozen(campaignId)).toEqual({ total: 0, contacts: 0 });
    expect(await reservations()).toBe(reservedBefore);
  });

  it('lists approvals whose progress stopped, only through ids', async () => {
    const campaignId = await draft();
    await service.approve(storeId, campaignId, owner);
    const fresh = await approvals.listStalled(new Date(Date.now() - 60_000), 100);
    expect(fresh.map(({ id }) => id)).not.toContain(campaignId);
    await admin.pool.query(
      "update campaigns set approval_progress_at = now() - interval '10 minutes' where id=$1",
      [campaignId],
    );

    const stalled = await approvals.listStalled(new Date(Date.now() - 5 * 60_000), 100);

    expect(stalled).toContainEqual({
      storeId,
      id: campaignId,
      approvedAt: await approvedAt(campaignId),
    });
  });

  it('goes back to draft with SEGMENT_NOT_FOUND when the segment is deleted after approval starts', async () => {
    const rules = {
      match: 'all',
      conditions: [{ field: 'district', operator: 'is_any_of', values: ['সিলেট'] }],
    } as const;
    const gone = (await app.get(SegmentsService).create(storeId, { name: 'সাময়িক', rules }, actor))
      .id;
    const campaignId = await draft(gone);
    await service.approve(storeId, campaignId, owner);
    await app.get(SegmentsService).remove(storeId, gone, actor);
    const reservedBefore = await reservations();

    await runApprovalJob(approval, admin.pool, storeId, campaignId);

    expect(await service.get(storeId, campaignId)).toMatchObject({
      status: 'draft',
      approval: null,
      approvalFailureCode: 'SEGMENT_NOT_FOUND',
    });
    expect(await frozen(campaignId)).toEqual({ total: 0, contacts: 0 });
    expect(await reservations()).toBe(reservedBefore);
  });

  it('refuses an approval for a segment that does not exist, before it starts', async () => {
    const input = createCampaignSchema.parse({
      name: 'হারানো সেগমেন্ট',
      channel: 'sms',
      content: { text: 'ঈদ মোবারক' },
      includeSegmentIds: [randomUUID()],
    });
    const { id } = await service.create(storeId, input, actor);

    await expect(service.approve(storeId, id, owner)).rejects.toMatchObject({
      code: 'SEGMENT_NOT_FOUND',
    });
    expect((await service.get(storeId, id)).status).toBe('draft');
  });

  // Last, so the 20,000 contacts it freezes do not slow the other tests.
  it('freezes an audience over 20,000 in pages and reserves once at the end', async () => {
    const campaignId = await draft(largeId);
    const started = await service.approve(storeId, campaignId, owner);
    expect(started).toMatchObject({
      status: 'approving',
      approval: { checked: 0, estimatedTotal: LARGE },
    });
    const reservedBefore = await reservations();
    const pages = vi.spyOn(SendPolicyService.prototype, 'checkAudience');

    await runApprovalJob(approval, admin.pool, storeId, campaignId);

    expect(pages).toHaveBeenCalledTimes(Math.ceil(LARGE / PAGE));
    expect(await frozen(campaignId)).toEqual({ total: LARGE, contacts: LARGE });
    const approved = await service.get(storeId, campaignId);
    expect(approved).toMatchObject({
      status: 'sending',
      approval: null,
      approvalFailureCode: null,
    });
    expect(approved.counts.recipients + approved.counts.skipped).toBe(LARGE);
    expect(await reservations()).toBe(reservedBefore + 1);
  }, 120_000);
});
