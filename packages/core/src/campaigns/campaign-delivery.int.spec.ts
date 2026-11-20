import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCampaignSchema } from '@dakly/contracts/campaigns';
import { createDatabase } from '@dakly/db/client';
import { FakeSmsDriver } from '@dakly/providers/sms/fake-sms-driver';
import { MailpitSmsDriver } from '@dakly/providers/sms/mailpit/mailpit-sms-driver';
import { type SmsMessage, SmsSendRefused } from '@dakly/providers/sms/sms-driver';

import { LinksService } from '../links/links.service';
import { Clock } from '../platform/clock';
import { loadEnv, resetEnvForTests } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { StoreTransaction } from '../platform/database/store-transaction';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { SegmentsService } from '../segments/segments.service';
import { SendPolicyService } from '../sending/send-policy.service';
import { StoresService } from '../stores/stores.service';
import { WalletService } from '../wallets/wallet.service';
import { CampaignSenderService } from './campaign-sender.service';
import { CampaignSendingRepository } from './campaign-sending.repository';
import { CampaignsModule } from './campaigns.module';
import { CampaignsService } from './campaigns.service';
import { ResumeCampaignsOnWalletCredited } from './jobs/resume-campaigns-on-wallet-credited.job';
import { SEND_CAMPAIGN_BATCH, SendCampaignBatchJob } from './jobs/send-campaign-batch.job';
import { StartDueCampaignsJob } from './jobs/start-due-campaigns.job';

class TestModule {}
Module({
  imports: [
    DatabaseModule,
    CampaignsModule,
    BullModule.registerQueue({ name: QUEUES.campaign }),
    BullModule.forRoot({
      connection: toRedisConnection(loadEnv().REDIS_URL),
      prefix: `${loadEnv().QUEUE_PREFIX}-campaign-delivery-${randomUUID()}`,
    }),
  ],
  providers: [ResumeCampaignsOnWalletCredited, SendCampaignBatchJob, StartDueCampaignsJob],
})(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const userId = randomUUID();
const staffUserId = randomUUID();
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
const noon = new Date(
  Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 6),
);
// One Unicode part with the opt-out link added.
const TEXT = 'নতুন শাড়ি এসেছে';
let app: INestApplicationContext;
let campaigns: CampaignsService;
let sender: CampaignSenderService;
let wallets: WalletService;
let driver: FakeSmsDriver;
let calls: SmsMessage[];
let clockNow: Date;
let phoneSeed = 0;

// A campaign approved to send now to `count` new consented contacts, with their phones.
async function sendingCampaign(count: number, scheduledFor: Date | null = null, text = TEXT) {
  const district = `জেলা-${randomUUID()}`;
  const phones: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const contactId = randomUUID();
    const phone = `0171${String((phoneSeed += 1)).padStart(7, '0')}`;
    phones.push(phone);
    await admin.pool.query(
      "insert into contacts(id,store_id,name,phone,source,kind,district) values($1,$2,'রাশেদ',$3,'manual','customer',$4)",
      [contactId, storeId, phone, district],
    );
    await admin.pool.query(
      "insert into consents(id,store_id,contact_id,channel,status,source) values(gen_random_uuid(),$1,$2,'sms','granted','checkout')",
      [storeId, contactId],
    );
  }
  const rules = {
    match: 'all',
    conditions: [{ field: 'district', operator: 'is_any_of', values: [district] }],
  } as const;
  const segment = await app.get(SegmentsService).create(storeId, { name: district, rules }, actor);
  const draft = createCampaignSchema.parse({
    name: 'নতুন কালেকশন',
    channel: 'sms',
    content: { text },
    includeSegmentIds: [segment.id],
    scheduledFor: scheduledFor?.toISOString() ?? null,
  });
  const { id } = await campaigns.create(storeId, draft, actor);
  await campaigns.approve(storeId, id, owner);
  return { id, phones };
}

async function recipients(campaignId: string) {
  const { rows } = await admin.pool.query(
    `select r.status, r.skip_reason, r.sms_credits, c.phone from campaign_recipients r
     join contacts c on c.id = r.contact_id where r.campaign_id=$1 order by c.phone`,
    [campaignId],
  );
  return rows as {
    status: string;
    skip_reason: string | null;
    sms_credits: number | null;
    phone: string;
  }[];
}

async function sendAttempts(campaignId: string) {
  const { rows } = await admin.pool.query(
    `select r.send_attempts from campaign_recipients r join contacts c on c.id = r.contact_id
     where r.campaign_id=$1 order by c.phone`,
    [campaignId],
  );
  return rows.map((row: { send_attempts: number }) => row.send_attempts);
}

async function campaignRow(campaignId: string) {
  const { rows } = await admin.pool.query(
    'select status, started_at, finished_at from campaigns where id=$1',
    [campaignId],
  );
  return rows[0] as { status: string; started_at: Date | null; finished_at: Date | null };
}

async function settlementRows(campaignId: string) {
  const { rows } = await admin.pool.query(
    "select kind, quantity_delta::int as quantity_delta from wallet_ledger where store_id=$1 and idempotency_key like $2 and kind <> 'reserve' order by revision",
    [storeId, `campaign-approval:${campaignId}:%`],
  );
  return rows as { kind: string; quantity_delta: number }[];
}

describe('Campaign sender (Postgres)', () => {
  beforeAll(async () => {
    await admin.pool.query("insert into stores(id,name) values($1,'সুমির দোকান')", [storeId]);
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'সুমি',$1::text || '@example.test')",
      [userId],
    );
    await admin.pool.query(
      "insert into staff_users(id,email,name,role) values($1,$2,'Wallet staff','super_admin')",
      [staffUserId, `${staffUserId}@example.test`],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    campaigns = app.get(CampaignsService);
    sender = app.get(CampaignSenderService);
    wallets = app.get(WalletService);
    vi.spyOn(app.get(Clock), 'now').mockImplementation(() => clockNow);
    await admin.pool.query(
      "insert into wallet_ledger(id,store_id,wallet,revision,kind,quantity_delta,balance_quantity_after,idempotency_key,actor_type) values(gen_random_uuid(),$1,'sms_credits',1,'top_up',1000,1000,'top-up-1','system')",
      [storeId],
    );
  });

  beforeEach(() => {
    clockNow = noon;
    driver = new FakeSmsDriver();
    calls = [];
    vi.spyOn(MailpitSmsDriver.prototype, 'send').mockImplementation((message) => {
      calls.push({ ...message });
      return driver.send(message);
    });
  });

  afterEach(() => {
    vi.mocked(MailpitSmsDriver.prototype.send).mockRestore();
  });

  afterAll(async () => {
    try {
      await app?.close();
      for (const table of [
        'tracked_links',
        'campaigns',
        'segments',
        'wallet_ledger',
        'outbox_events',
        'notifications',
        'contacts',
      ])
        await admin.pool.query(`delete from ${table} where store_id=$1`, [storeId]);
      await admin.pool.query('delete from stores where id=$1', [storeId]);
      await admin.pool.query('delete from users where id=$1', [userId]);
      await admin.pool.query('delete from staff_users where id=$1', [staffUserId]);
    } finally {
      await admin.pool.end();
    }
  });

  async function unknownFirstSend() {
    const campaign = await sendingCampaign(1);
    vi.mocked(MailpitSmsDriver.prototype.send).mockImplementationOnce(async (message) => {
      calls.push({ ...message });
      throw new Error('provider timed out');
    });
    await expect(sender.sendBatch(storeId, campaign.id)).rejects.toThrow('provider timed out');
    return campaign;
  }

  it('queues expired cancellation recovery independently of the active campaign', async () => {
    const cancelled = await unknownFirstSend();
    await campaigns.cancel(storeId, cancelled.id, actor);
    const active = await sendingCampaign(1);
    const queue = app.get<Queue>(getQueueToken(QUEUES.campaign));
    const sweep = app.get(StartDueCampaignsJob);

    try {
      await sweep.handle({});
      let waiting = await queue.getWaiting();
      expect(waiting.map(({ data }) => data)).toEqual([{ storeId, lane: 'sending' }]);

      clockNow = new Date(noon.getTime() + 6 * MINUTE);
      await sweep.handle({});
      waiting = await queue.getWaiting();
      expect(waiting).toHaveLength(2);
      expect(waiting.every(({ name }) => name === SEND_CAMPAIGN_BATCH)).toBe(true);
      expect(waiting.map(({ data }) => data)).toEqual(
        expect.arrayContaining([
          { storeId, lane: 'sending' },
          { storeId, lane: 'cancelled' },
        ]),
      );
    } finally {
      for (const pending of await queue.getWaiting()) await pending.remove();
      await campaigns.cancel(storeId, active.id, actor);
      clockNow = new Date(noon.getTime() + 6 * MINUTE);
      await sender.sendBatch(storeId, cancelled.id);
    }
  });

  it('selects an older approved campaign without a recorded start before newer work', async () => {
    const legacy = await sendingCampaign(1);
    const newer = await sendingCampaign(1);
    try {
      await admin.pool.query(
        'update campaigns set short_link_base=null, started_at=null where id=$1',
        [legacy.id],
      );
      await admin.pool.query('update campaigns set started_at=$2 where id=$1', [
        newer.id,
        new Date(noon.getTime() + MINUTE),
      ]);

      expect(await app.get(CampaignSendingRepository).firstWork(storeId, noon)).toEqual([
        { campaignId: legacy.id, status: 'sending' },
      ]);
    } finally {
      await campaigns.cancel(storeId, legacy.id, actor);
      await campaigns.cancel(storeId, newer.id, actor);
    }
  });

  it('does not submit a claimed recipient after the batch loses its execution lease', async () => {
    const { id } = await sendingCampaign(1);
    const repository = app.get(CampaignSendingRepository);
    const check = repository.isCurrentClaim.bind(repository);
    let hasLease = true;
    const current = vi
      .spyOn(repository, 'isCurrentClaim')
      .mockImplementationOnce(async (...args) => {
        const result = await check(...args);
        hasLease = false;
        return result;
      });
    try {
      expect(await sender.sendBatch(storeId, id, () => hasLease)).toBeNull();
      expect(current).toHaveBeenCalledTimes(1);
      expect(calls).toHaveLength(0);
      expect(await settlementRows(id)).toEqual([]);
      expect(await sendAttempts(id)).toEqual([0]);
      expect((await recipients(id)).map(({ status }) => status)).toEqual(['queued']);
      await campaigns.cancel(storeId, id, actor);
      expect(await settlementRows(id)).toEqual([{ kind: 'release', quantity_delta: 1 }]);
    } finally {
      current.mockRestore();
    }
  });

  it('preserves the earlier ambiguous claim when a retry is stopped before the provider', async () => {
    const { id } = await unknownFirstSend();
    const readClaim = async () =>
      (
        await admin.pool.query(
          'select claimed_at, dispatch_started_at, send_attempts from campaign_recipients where campaign_id=$1',
          [id],
        )
      ).rows[0];
    const prior = await readClaim();
    clockNow = new Date(noon.getTime() + 6 * MINUTE);
    const repository = app.get(CampaignSendingRepository);
    const check = repository.isCurrentClaim.bind(repository);
    let hasLease = true;
    const current = vi
      .spyOn(repository, 'isCurrentClaim')
      .mockImplementationOnce(async (...args) => {
        const result = await check(...args);
        hasLease = false;
        return result;
      });
    try {
      expect(await sender.sendBatch(storeId, id, () => hasLease)).toBeNull();
      expect(calls).toHaveLength(1);
      expect(await readClaim()).toEqual(prior);
      await campaigns.cancel(storeId, id, actor);
      await sender.sendBatch(storeId, id);
      expect(await settlementRows(id)).toEqual([
        { kind: 'release', quantity_delta: 1 },
        { kind: 'charge', quantity_delta: -1 },
      ]);
    } finally {
      current.mockRestore();
    }
  });

  it('pauses an underfunded older approval and sends after a newer verified top-up', async () => {
    const sms = 'sms_credits';
    const sendCredit = (name: string) =>
      wallets.credit(storeId, {
        wallet: sms,
        quantity: 1,
        idempotencyKey: `campaign-test-${name}`,
        staffUserId,
        staffAuditId: randomUUID(),
      });
    const event = app.get(ResumeCampaignsOnWalletCredited);
    const deliverCredit = async (entryId: string) => {
      const { rows } = await admin.pool.query(
        "select id,payload,occurred_at from outbox_events where store_id=$1 and type='wallet.credited' and payload->>'entryId'=$2",
        [storeId, entryId],
      );
      expect(rows).toHaveLength(1);
      const [credit] = rows;
      await event.handle({
        id: credit.id,
        type: 'wallet.credited',
        storeId,
        occurredAt: credit.occurred_at.toISOString(),
        payload: credit.payload,
      });
    };
    vi.stubEnv('SHORT_LINK_BASE_URL', 'https://s.test');
    resetEnvForTests();
    let hold: string | undefined;
    let newerId: string | undefined;
    try {
      const before = await wallets.balance(storeId, sms);
      const { id, phones } = await sendingCampaign(2, null, 'a'.repeat(134));
      expect(await wallets.balance(storeId, sms)).toBe(before - 2);
      newerId = (await sendingCampaign(1)).id;
      await admin.pool.query('update campaigns set started_at=$2 where id=$1', [
        newerId,
        new Date(noon.getTime() + MINUTE),
      ]);
      const previous = await sendCredit('before-pause');
      const spare = await wallets.balance(storeId, sms);
      hold = (
        await wallets.reserve(storeId, {
          wallet: sms,
          quantity: spare,
          idempotencyKey: 'other-campaign-reservation',
          actor,
        })
      ).entryId;
      await admin.pool.query(
        'update campaigns set short_link_base=null, started_at=null where id=$1',
        [id],
      );
      vi.stubEnv('SHORT_LINK_BASE_URL', 'https://longer.example.test');
      resetEnvForTests();

      const queue = app.get<Queue>(getQueueToken(QUEUES.campaign));
      await app.get(StartDueCampaignsJob).handle({});
      const waiting = await queue.getWaiting();
      expect(waiting.map(({ data }) => data)).toContainEqual({ storeId, lane: 'sending' });
      for (const pending of waiting) await pending.remove();
      await expect(sender.sendBatch(storeId, id)).resolves.toBeNull();
      const readPause = async () =>
        (
          await admin.pool.query(
            'select status,pause_reason,balance_pause_revision,short_link_base,started_at from campaigns where id=$1',
            [id],
          )
        ).rows[0];
      expect(await readPause()).toMatchObject({
        status: 'paused',
        pause_reason: 'balance',
        short_link_base: null,
      });
      expect(calls).toHaveLength(0);
      expect(await settlementRows(id)).toEqual([]);
      await app.get(StartDueCampaignsJob).handle({});
      const [continuation] = await queue.getWaiting();
      expect(continuation?.data).toEqual({ storeId, lane: 'sending' });
      expect(await app.get(CampaignSendingRepository).firstWork(storeId, noon)).toEqual([
        { campaignId: newerId, status: 'sending' },
      ]);
      await deliverCredit(previous.entryId);
      expect(await readPause()).toMatchObject({ status: 'paused', pause_reason: 'balance' });

      const small = await sendCredit('insufficient');
      await deliverCredit(small.entryId);
      expect(await readPause()).toMatchObject({ status: 'paused', pause_reason: 'balance' });
      const enough = await sendCredit('enough');
      await deliverCredit(enough.entryId);
      await deliverCredit(enough.entryId);
      expect(await readPause()).toMatchObject({
        status: 'sending',
        pause_reason: null,
        balance_pause_revision: null,
        short_link_base: 'https://longer.example.test',
        started_at: noon,
      });
      expect(calls).toHaveLength(0);
      expect(await settlementRows(id)).toEqual([{ kind: 'release', quantity_delta: 2 }]);

      expect(await app.get(SendCampaignBatchJob).handle(continuation!.data)).toBeUndefined();
      await continuation!.remove();
      expect(calls.map(({ to }) => to).sort()).toEqual(phones);
      expect((await recipients(newerId)).map(({ status }) => status)).toEqual(['queued']);
      expect(await readPause()).toMatchObject({ status: 'sent', pause_reason: null });
      expect(await settlementRows(id)).toEqual([
        { kind: 'release', quantity_delta: 2 },
        { kind: 'release', quantity_delta: 4 },
        { kind: 'charge', quantity_delta: -4 },
      ]);
    } finally {
      if (newerId) await campaigns.cancel(storeId, newerId, actor);
      if (hold)
        await wallets.release(storeId, {
          reservationId: hold,
          idempotencyKey: 'release-other-campaign-reservation',
          actor,
        });
      vi.unstubAllEnvs();
      resetEnvForTests();
    }
  });

  it('sends each recipient its opt-out link and charges what was sent', async () => {
    const before = await wallets.balance(storeId, 'sms_credits');
    const { id, phones } = await sendingCampaign(3);
    expect(await wallets.balance(storeId, 'sms_credits')).toBe(before - 3);

    expect(await sender.sendBatch(storeId, id)).toBeNull();

    expect(driver.messages.map((message) => message.to).sort()).toEqual(phones);
    for (const message of driver.messages)
      expect(message.text).toMatch(
        new RegExp(`^${TEXT}\\nhttp://localhost:4000/l/s/[0-9A-Za-z]{8}$`),
      );
    const { rows: links } = await admin.pool.query(
      "select count(*)::int as count from tracked_links where source_id=$1 and kind='sms_opt_out'",
      [id],
    );
    expect(links[0].count).toBe(3);
    expect((await recipients(id)).map((row) => [row.status, row.sms_credits])).toEqual([
      ['sent', 1],
      ['sent', 1],
      ['sent', 1],
    ]);
    expect(await campaignRow(id)).toMatchObject({ status: 'sent', finished_at: noon });
    expect(await settlementRows(id)).toEqual([
      { kind: 'release', quantity_delta: 3 },
      { kind: 'charge', quantity_delta: -3 },
    ]);
    expect(await wallets.balance(storeId, 'sms_credits')).toBe(before - 3);
  });

  it.each(['sent', 'cancelled'] as const)(
    'caps a %s campaign’s charge at the reserved credits',
    async (status) => {
      const before = await wallets.balance(storeId, 'sms_credits');
      const { id } = await sendingCampaign(1);
      expect(await wallets.balance(storeId, 'sms_credits')).toBe(before - 1);
      await admin.pool.query(
        "update campaign_recipients set status='sent', sent_at=$2, sms_credits=2 where campaign_id=$1",
        [id, noon],
      );

      if (status === 'cancelled') await campaigns.cancel(storeId, id, actor);
      expect(await sender.sendBatch(storeId, id)).toBeNull();

      expect(await campaignRow(id)).toMatchObject({ status, finished_at: noon });
      expect(await settlementRows(id)).toEqual([
        { kind: 'release', quantity_delta: 1 },
        { kind: 'charge', quantity_delta: -1 },
      ]);
      expect(await wallets.balance(storeId, 'sms_credits')).toBe(before - 1);
    },
  );

  it('keeps the approved opt-out base and one-part charge when the worker URL changes', async () => {
    vi.stubEnv('SHORT_LINK_BASE_URL', 'https://s.test');
    resetEnvForTests();
    try {
      const creditBalance = await wallets.balance(storeId, 'sms_credits');
      const text = 'A'.repeat(130);
      const { id } = await sendingCampaign(1, null, text);
      expect(await wallets.balance(storeId, 'sms_credits')).toBe(creditBalance - 1);

      vi.stubEnv('SHORT_LINK_BASE_URL', 'https://messages.preview.long-domain.example.test/l');
      resetEnvForTests();
      expect(await sender.sendBatch(storeId, id)).toBeNull();

      expect(driver.messages).toHaveLength(1);
      expect(driver.messages[0]?.text).toMatch(
        new RegExp(`^${text}\\nhttps://s\\.test/s/[0-9A-Za-z]{8}$`),
      );
      expect(await campaignRow(id)).toMatchObject({ status: 'sent' });
      expect(await settlementRows(id)).toEqual([
        { kind: 'release', quantity_delta: 1 },
        { kind: 'charge', quantity_delta: -1 },
      ]);
    } finally {
      vi.unstubAllEnvs();
      resetEnvForTests();
    }
  });

  it('sends once and with the same text when a worker stops after the provider call', async () => {
    const { id, phones } = await sendingCampaign(2);
    const change = CampaignSendingRepository.prototype.changeRecipient;
    const crash = vi
      .spyOn(CampaignSendingRepository.prototype, 'changeRecipient')
      .mockImplementationOnce(function (this: CampaignSendingRepository, ...args) {
        return change.apply(this, args);
      })
      .mockImplementationOnce(async () => {
        throw new Error('worker stopped');
      });

    await expect(sender.sendBatch(storeId, id)).rejects.toThrow('worker stopped');
    crash.mockRestore();
    expect(calls).toHaveLength(1);
    expect((await recipients(id)).map((row) => row.status).sort()).toEqual(['queued', 'sending']);

    // The claim has not expired: the other recipient sends, the claimed one waits.
    clockNow = new Date(noon.getTime() + MINUTE);
    expect(await sender.sendBatch(storeId, id)).toBeNull();
    expect(driver.messages).toHaveLength(2);
    expect(await campaignRow(id)).toMatchObject({ status: 'sending' });

    clockNow = new Date(noon.getTime() + 24 * 60 * MINUTE);
    expect(await sender.sendBatch(storeId, id)).toBeNull();

    expect(driver.messages.map((message) => message.to).sort()).toEqual(phones);
    const [first, ...resends] = calls.filter((call) => call.to === calls[0]!.to);
    expect(resends).toHaveLength(1);
    expect(resends[0]).toEqual(first);
    expect((await recipients(id)).map((row) => row.status)).toEqual(['sent', 'sent']);
    // Each provider call counts toward the ceiling, the resend included.
    expect((await sendAttempts(id)).sort()).toEqual([1, 2]);
    const [retried] = (
      await admin.pool.query(
        'select dispatch_started_at, sent_at from campaign_recipients where campaign_id=$1 and send_attempts=2',
        [id],
      )
    ).rows;
    expect(retried).toEqual({ dispatch_started_at: clockNow, sent_at: clockNow });
    expect(await settlementRows(id)).toEqual([
      { kind: 'release', quantity_delta: 2 },
      { kind: 'charge', quantity_delta: -2 },
    ]);
  });

  it.each(['sending', 'cancelled'] as const)(
    'recovers the stored provider receipt in a %s campaign without resending',
    async (status) => {
      const { id } = await sendingCampaign(1);
      const change = CampaignSendingRepository.prototype.changeRecipient;
      const crash = vi
        .spyOn(CampaignSendingRepository.prototype, 'changeRecipient')
        .mockImplementation(function (this: CampaignSendingRepository, ...args) {
          if (args[3].status === 'sent') throw new Error('worker stopped after saving receipt');
          return change.apply(this, args);
        });
      try {
        await expect(sender.sendBatch(storeId, id)).rejects.toThrow(
          'worker stopped after saving receipt',
        );
      } finally {
        crash.mockRestore();
      }
      const [pending] = (
        await admin.pool.query(
          'select status, provider_message_id from campaign_recipients where campaign_id=$1',
          [id],
        )
      ).rows;
      expect(pending).toEqual({ status: 'sending', provider_message_id: expect.any(String) });
      if (status === 'cancelled') await campaigns.cancel(storeId, id, actor);
      clockNow = new Date(noon.getTime() + 24 * 60 * MINUTE);
      const receipt = vi
        .spyOn(MailpitSmsDriver.prototype, 'receiptStatus')
        .mockResolvedValue('sent');
      try {
        expect(await sender.sendBatch(storeId, id)).toBeNull();
        expect(receipt).toHaveBeenCalledExactlyOnceWith({
          providerMessageId: pending.provider_message_id,
          idempotencyKey: calls[0]?.idempotencyKey,
        });
        expect(calls).toHaveLength(1);
        expect((await recipients(id)).map((row) => row.status)).toEqual(['sent']);
        const [delivered] = (
          await admin.pool.query(
            'select dispatch_started_at, sent_at from campaign_recipients where campaign_id=$1',
            [id],
          )
        ).rows;
        expect(delivered).toEqual({ dispatch_started_at: noon, sent_at: noon });
      } finally {
        receipt.mockRestore();
      }
    },
  );

  it('yields after the elapsed batch budget so another job can run', async () => {
    const { id } = await sendingCampaign(2);
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.mocked(MailpitSmsDriver.prototype.send).mockImplementationOnce(async (message) => {
      calls.push({ ...message });
      now.mockReturnValue(16 * 1000);
      return driver.send(message);
    });
    try {
      expect(await sender.sendBatch(storeId, id)).toEqual(noon);
      expect(calls).toHaveLength(1);
      expect((await recipients(id)).map((row) => row.status).sort()).toEqual(['queued', 'sent']);
    } finally {
      now.mockRestore();
    }
    expect(await sender.sendBatch(storeId, id)).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('records the provider answer of a worker whose claim was taken meanwhile', async () => {
    const { id, phones } = await sendingCampaign(1);
    vi.mocked(MailpitSmsDriver.prototype.send).mockImplementation(async (message) => {
      calls.push({ ...message });
      // Another worker takes the claim while this one waits for the provider.
      await admin.pool.query(
        "update campaign_recipients set claimed_at=claimed_at + interval '6 minutes' where campaign_id=$1",
        [id],
      );
      return driver.send(message);
    });

    expect(await sender.sendBatch(storeId, id)).toBeNull();

    expect(calls.map((call) => call.to)).toEqual(phones);
    expect((await recipients(id)).map((row) => row.status)).toEqual(['sent']);
    expect(await campaignRow(id)).toMatchObject({ status: 'sent' });
  });

  it('records a late provider receipt after cancellation settled an expired claim', async () => {
    const { id, phones } = await sendingCampaign(1);
    const contacted = Promise.withResolvers<void>();
    const reply = Promise.withResolvers<{ providerMessageId: string }>();
    vi.mocked(MailpitSmsDriver.prototype.send).mockImplementationOnce(async (message) => {
      calls.push({ ...message });
      contacted.resolve();
      return reply.promise;
    });
    const batch = sender.sendBatch(storeId, id);
    const receipt = { providerMessageId: 'late-campaign-receipt' };
    try {
      await contacted.promise;
      await campaigns.cancel(storeId, id, actor);
      clockNow = new Date(noon.getTime() + 6 * MINUTE);
      await app.get(SendCampaignBatchJob).handle({ storeId, lane: 'cancelled' });
      expect((await recipients(id)).map((row) => row.status)).toEqual(['failed']);

      reply.resolve(receipt);
      await batch;

      expect(calls.map((message) => message.to)).toEqual(phones);
      expect((await recipients(id)).map((row) => row.status)).toEqual(['sent']);
      expect(await campaignRow(id)).toMatchObject({ status: 'cancelled' });
      expect(await settlementRows(id)).toEqual([
        { kind: 'release', quantity_delta: 1 },
        { kind: 'charge', quantity_delta: -1 },
      ]);
    } finally {
      reply.resolve(receipt);
      await batch.catch(() => undefined);
    }
  });

  it('settles a cancelled in-flight refusal without requeueing the recipient', async () => {
    const { id } = await sendingCampaign(1);
    const contacted = Promise.withResolvers<void>();
    const reply = Promise.withResolvers<{ providerMessageId: string }>();
    vi.mocked(MailpitSmsDriver.prototype.send).mockImplementationOnce(async (message) => {
      calls.push({ ...message });
      contacted.resolve();
      return reply.promise;
    });
    const batch = sender.sendBatch(storeId, id);
    void batch.catch(() => undefined);
    try {
      await Promise.race([
        contacted.promise,
        batch.then(() => {
          throw new Error('The batch ended before contacting the provider');
        }),
      ]);
      await campaigns.cancel(storeId, id, actor);
      reply.reject(new SmsSendRefused());
      await batch;
      await app.get(SendCampaignBatchJob).handle({ storeId, lane: 'cancelled' });

      expect(calls).toHaveLength(1);
      expect((await recipients(id)).map((row) => row.status)).toEqual(['failed']);
      expect(await settlementRows(id)).toEqual([{ kind: 'release', quantity_delta: 1 }]);
    } finally {
      reply.resolve({ providerMessageId: 'unused-refusal-receipt' });
      await batch.catch(() => undefined);
    }
  });

  it('releases a late definite refusal if cancellation settlement is still open', async () => {
    const { id } = await sendingCampaign(1);
    const contacted = Promise.withResolvers<void>();
    const reply = Promise.withResolvers<{ providerMessageId: string }>();
    vi.mocked(MailpitSmsDriver.prototype.send).mockImplementationOnce(async (message) => {
      calls.push({ ...message });
      contacted.resolve();
      return reply.promise;
    });
    const batch = sender.sendBatch(storeId, id);
    void batch.catch(() => undefined);
    try {
      await Promise.race([
        contacted.promise,
        batch.then(() => {
          throw new Error('The batch ended before contacting the provider');
        }),
      ]);
      await campaigns.cancel(storeId, id, actor);
      clockNow = new Date(noon.getTime() + 6 * MINUTE);
      const settle = vi
        .spyOn(campaigns, 'settleReservation')
        .mockRejectedValueOnce(new Error('worker stopped before settlement'));
      try {
        await expect(sender.sendBatch(storeId, id)).rejects.toThrow(
          'worker stopped before settlement',
        );
      } finally {
        settle.mockRestore();
      }
      expect((await recipients(id)).map((row) => [row.status, row.sms_credits])).toEqual([
        ['failed', 1],
      ]);
      expect(await settlementRows(id)).toEqual([]);

      reply.reject(new SmsSendRefused());
      await batch;
      expect((await recipients(id)).map((row) => [row.status, row.sms_credits])).toEqual([
        ['failed', null],
      ]);
      expect(await settlementRows(id)).toEqual([{ kind: 'release', quantity_delta: 1 }]);
      expect(calls).toHaveLength(1);
    } finally {
      reply.resolve({ providerMessageId: 'unused-late-refusal-receipt' });
      await batch.catch(() => undefined);
    }
  });

  it('releases a late definite refusal while the other recipient is still outstanding', async () => {
    const { id } = await sendingCampaign(2);
    const contacted = Promise.withResolvers<void>();
    const reply = Promise.withResolvers<{ providerMessageId: string }>();
    vi.mocked(MailpitSmsDriver.prototype.send)
      .mockImplementationOnce(async (message) => {
        calls.push({ ...message });
        contacted.resolve();
        return reply.promise;
      })
      .mockRejectedValueOnce(new Error('second recipient timed out'));
    const first = sender.sendBatch(storeId, id);
    void first.catch(() => undefined);
    try {
      await Promise.race([
        contacted.promise,
        first.then(() => {
          throw new Error('The batch ended before contacting the provider');
        }),
      ]);
      const phone = calls[0]!.to;
      await admin.pool.query('update contacts set is_blocked=true where store_id=$1 and phone=$2', [
        storeId,
        phone,
      ]);
      clockNow = new Date(noon.getTime() + 6 * MINUTE);
      await expect(sender.sendBatch(storeId, id)).rejects.toThrow('second recipient timed out');
      expect(await settlementRows(id)).toEqual([]);
      expect((await recipients(id)).find((row) => row.phone === phone)).toMatchObject({
        status: 'failed',
        sms_credits: 1,
      });

      reply.reject(new SmsSendRefused());
      await first;
      expect((await recipients(id)).find((row) => row.phone === phone)).toMatchObject({
        status: 'failed',
        sms_credits: null,
      });
      clockNow = new Date(noon.getTime() + 12 * MINUTE);
      await sender.sendBatch(storeId, id);
      expect(await settlementRows(id)).toEqual([
        { kind: 'release', quantity_delta: 2 },
        { kind: 'charge', quantity_delta: -1 },
      ]);
    } finally {
      reply.resolve({ providerMessageId: 'unused-late-refusal-receipt' });
      await first.catch(() => undefined);
    }
  });

  it.each([false, true])(
    'uses only a live claim when cancellation has committed (expired: %s)',
    async (expired) => {
      const { id } = await sendingCampaign(1);
      const waiting = Promise.withResolvers<void>();
      const proceed = Promise.withResolvers<void>();
      const repository = app.get(CampaignSendingRepository);
      const current = repository.isCurrentClaim.bind(repository);
      const gate = vi
        .spyOn(repository, 'isCurrentClaim')
        .mockImplementationOnce(async (...args) => {
          expect(app.get(StoreTransaction).isOpen()).toBe(false);
          waiting.resolve();
          await proceed.promise;
          return current(...args);
        });
      const first = sender.sendBatch(storeId, id);
      void first.catch(() => undefined);
      try {
        await Promise.race([
          waiting.promise,
          first.then(() => {
            throw new Error('The batch ended before checking the claim');
          }),
        ]);
        await campaigns.cancel(storeId, id, actor);
        if (expired) {
          clockNow = new Date(noon.getTime() + 6 * MINUTE);
          await sender.sendBatch(storeId, id);
        }
        proceed.resolve();
        await first;
        expect(calls).toHaveLength(expired ? 0 : 1);
        expect((await recipients(id)).map((row) => row.status)).toEqual([
          expired ? 'failed' : 'sent',
        ]);
      } finally {
        proceed.resolve();
        gate.mockRestore();
        await first.catch(() => undefined);
      }
    },
  );

  it('checks quiet hours again after preparing the opt-out link', async () => {
    clockNow = new Date(noon.getTime() + 9 * 60 * MINUTE - MINUTE);
    const { id } = await sendingCampaign(1);
    const links = app.get(LinksService);
    const create = links.create.bind(links);
    const waits = vi.spyOn(links, 'create').mockImplementationOnce(async (...args) => {
      const saved = await create(...args);
      clockNow = new Date(noon.getTime() + 9 * 60 * MINUTE);
      return saved;
    });
    try {
      const open = new Date(noon.getTime() + 21 * 60 * MINUTE);
      expect(await sender.sendBatch(storeId, id)).toEqual(open);
      expect(calls).toHaveLength(0);
      expect((await recipients(id)).map((row) => row.status)).toEqual(['queued']);

      clockNow = open;
      expect(await sender.sendBatch(storeId, id)).toBeNull();
      expect(calls).toHaveLength(1);
      expect(waits).toHaveBeenCalledTimes(1);
    } finally {
      waits.mockRestore();
    }
  });

  it('locks the store settings before it locks the recipient for dispatch', async () => {
    const { id } = await sendingCampaign(1);
    const policy = app.get(SendPolicyService);
    const lockForDispatch = policy.lockForDispatch.bind(policy);
    const settings = vi.spyOn(app.get(StoresService), 'sendingSettings');
    const contact = vi.spyOn(policy, 'lockForDispatch').mockImplementationOnce(async (...args) => {
      expect(settings).toHaveBeenCalledWith(storeId, 'share');
      return lockForDispatch(...args);
    });
    try {
      expect(await sender.sendBatch(storeId, id)).toBeNull();
      expect(contact).toHaveBeenCalledTimes(1);
      expect(calls).toHaveLength(1);
    } finally {
      contact.mockRestore();
      settings.mockRestore();
    }
  });

  it('skips a recipient whose phone changed after approval and releases its credit', async () => {
    const { id, phones } = await sendingCampaign(2);
    await admin.pool.query(
      "update contacts set phone='01999000001' where store_id=$1 and phone=$2",
      [storeId, phones[0]],
    );

    expect(await sender.sendBatch(storeId, id)).toBeNull();

    expect(calls.map((call) => call.to)).toEqual([phones[1]]);
    const { rows } = await admin.pool.query(
      'select status, skip_reason from campaign_recipients where campaign_id=$1 order by destination_address',
      [id],
    );
    expect(rows).toEqual([
      { status: 'skipped', skip_reason: 'no_address' },
      { status: 'sent', skip_reason: null },
    ]);
    expect(await settlementRows(id)).toEqual([
      { kind: 'release', quantity_delta: 2 },
      { kind: 'charge', quantity_delta: -1 },
    ]);
  });

  it('never gives one recipient to two workers', async () => {
    const { id, phones } = await sendingCampaign(12);

    await Promise.all([sender.sendBatch(storeId, id), sender.sendBatch(storeId, id)]);

    expect(calls.map((call) => call.to).sort()).toEqual(phones);
    expect(new Set(calls.map((call) => call.idempotencyKey)).size).toBe(12);
    expect(await campaignRow(id)).toMatchObject({ status: 'sent' });
    expect(await settlementRows(id)).toEqual([
      { kind: 'release', quantity_delta: 12 },
      { kind: 'charge', quantity_delta: -12 },
    ]);
  });

  it('skips a contact who withdrew after approval and releases its credit once', async () => {
    const before = await wallets.balance(storeId, 'sms_credits');
    const { id, phones } = await sendingCampaign(2);
    await admin.pool.query(
      "insert into consents(id,store_id,contact_id,channel,status,source,captured_at) select gen_random_uuid(),$1,id,'sms','withdrawn','opt_out_link',now()+interval '1 second' from contacts where store_id=$1 and phone=$2",
      [storeId, phones[0]],
    );

    expect(await sender.sendBatch(storeId, id)).toBeNull();
    expect(await sender.sendBatch(storeId, id)).toBeNull();

    expect(calls.map((call) => call.to)).toEqual([phones[1]]);
    expect((await recipients(id)).map((row) => [row.status, row.skip_reason])).toEqual([
      ['skipped', 'no_consent'],
      ['sent', null],
    ]);
    expect(await settlementRows(id)).toEqual([
      { kind: 'release', quantity_delta: 2 },
      { kind: 'charge', quantity_delta: -1 },
    ]);
    expect(await wallets.balance(storeId, 'sms_credits')).toBe(before - 1);
  });

  it('defers the rest to 09:00 in quiet hours and sends nothing', async () => {
    const { id } = await sendingCampaign(2);
    // 21:30 in Dhaka.
    clockNow = new Date(noon.getTime() + 9.5 * 60 * MINUTE);

    const next = await sender.sendBatch(storeId, id);

    expect(next).toEqual(new Date(noon.getTime() + 21 * 60 * MINUTE));
    expect(calls).toEqual([]);
    expect((await recipients(id)).map((row) => row.status)).toEqual(['queued', 'queued']);
  });

  it('fails a message the provider refuses three times and refunds its credit', async () => {
    const before = await wallets.balance(storeId, 'sms_credits');
    const { id, phones } = await sendingCampaign(2);
    vi.mocked(MailpitSmsDriver.prototype.send).mockImplementation(async (message) => {
      calls.push({ ...message });
      if (message.to === phones[0]) throw new SmsSendRefused();
      return driver.send(message);
    });

    // Each refusal puts the recipient back in the queue, so the job's retry tries it at once.
    for (let attempt = 0; attempt < 2; attempt += 1)
      await expect(sender.sendBatch(storeId, id)).rejects.toMatchObject({
        code: 'SMS_SEND_REFUSED',
      });
    expect((await sendAttempts(id))[0]).toBe(2);
    expect(await sender.sendBatch(storeId, id)).toBeNull();

    expect(calls.filter((call) => call.to === phones[0])).toHaveLength(3);
    expect((await recipients(id)).map((row) => row.status)).toEqual(['failed', 'sent']);
    expect(await sendAttempts(id)).toEqual([3, 1]);
    expect(await settlementRows(id)).toEqual([
      { kind: 'release', quantity_delta: 2 },
      { kind: 'charge', quantity_delta: -1 },
    ]);
    expect(await wallets.balance(storeId, 'sms_credits')).toBe(before - 1);
  });

  it('checks consent again after a refusal and skips a contact who withdrew meanwhile', async () => {
    const { id, phones } = await sendingCampaign(1);
    vi.mocked(MailpitSmsDriver.prototype.send).mockImplementation(async (message) => {
      calls.push({ ...message });
      throw new SmsSendRefused();
    });
    await expect(sender.sendBatch(storeId, id)).rejects.toMatchObject({ code: 'SMS_SEND_REFUSED' });
    await admin.pool.query(
      "insert into consents(id,store_id,contact_id,channel,status,source,captured_at) select gen_random_uuid(),$1,id,'sms','withdrawn','opt_out_link',now()+interval '1 second' from contacts where store_id=$1 and phone=$2",
      [storeId, phones[0]],
    );

    expect(await sender.sendBatch(storeId, id)).toBeNull();

    expect(calls).toHaveLength(1);
    expect((await recipients(id)).map((row) => [row.status, row.skip_reason])).toEqual([
      ['skipped', 'no_consent'],
    ]);
    expect(await settlementRows(id)).toEqual([{ kind: 'release', quantity_delta: 1 }]);
  });

  it('leaves an unknown outcome to expire and resends it under the same key later', async () => {
    const { id, phones } = await sendingCampaign(1);
    vi.mocked(MailpitSmsDriver.prototype.send).mockImplementationOnce(async (message) => {
      calls.push({ ...message });
      throw new Error('provider timed out');
    });
    await expect(sender.sendBatch(storeId, id)).rejects.toThrow('provider timed out');
    expect((await recipients(id)).map((row) => row.status)).toEqual(['sending']);
    expect(await sendAttempts(id)).toEqual([1]);
    // The claim holds the recipient until it expires.
    expect(await sender.sendBatch(storeId, id)).toBeNull();
    expect(calls).toHaveLength(1);

    clockNow = new Date(noon.getTime() + 6 * MINUTE);
    expect(await sender.sendBatch(storeId, id)).toBeNull();

    expect(calls.map((call) => [call.to, call.idempotencyKey])).toEqual([
      [phones[0], calls[0]!.idempotencyKey],
      [phones[0], calls[0]!.idempotencyKey],
    ]);
    expect((await recipients(id)).map((row) => row.status)).toEqual(['sent']);
    expect(await sendAttempts(id)).toEqual([2]);
    expect(await settlementRows(id)).toEqual([
      { kind: 'release', quantity_delta: 1 },
      { kind: 'charge', quantity_delta: -1 },
    ]);
  });

  describe('a resend after an expired claim (owner decision A)', () => {
    // The first call's outcome is unknown, so the provider may have sent and billed it.
    async function outcome(campaignId: string) {
      const { rows } = await admin.pool.query(
        'select status, error_code, sms_credits from campaign_recipients where campaign_id=$1',
        [campaignId],
      );
      return rows;
    }

    const charged = [
      { kind: 'release', quantity_delta: 1 },
      { kind: 'charge', quantity_delta: -1 },
    ];

    it('settles an expired cancelled claim without another provider call', async () => {
      const { id } = await unknownFirstSend();
      await campaigns.cancel(storeId, id, actor);
      const settle = app.get(SendCampaignBatchJob);

      await settle.handle({ storeId, lane: 'cancelled' });

      expect(await settlementRows(id)).toEqual([]);
      clockNow = new Date(noon.getTime() + 6 * MINUTE);
      await settle.handle({ storeId, lane: 'cancelled' });
      await settle.handle({ storeId, lane: 'cancelled' });

      expect(calls).toHaveLength(1);
      expect(await outcome(id)).toEqual([
        { status: 'failed', error_code: 'outcome_unknown', sms_credits: 1 },
      ]);
      expect(await settlementRows(id)).toEqual(charged);
    });

    it('uses a late definite receipt result before the cancellation settles', async () => {
      const { id } = await unknownFirstSend();
      await admin.pool.query(
        "update campaign_recipients set provider_message_id='late-known-receipt' where campaign_id=$1",
        [id],
      );
      await campaigns.cancel(storeId, id, actor);
      clockNow = new Date(noon.getTime() + 6 * MINUTE);
      const started = Promise.withResolvers<void>();
      const result = Promise.withResolvers<'not_sent'>();
      const lookup = vi
        .spyOn(MailpitSmsDriver.prototype, 'receiptStatus')
        .mockImplementationOnce(async () => {
          started.resolve();
          return result.promise;
        })
        .mockResolvedValueOnce('unknown');
      const first = sender.sendBatch(storeId, id);
      void first.catch(() => undefined);
      try {
        await Promise.race([
          started.promise,
          first.then(() => {
            throw new Error('The worker ended before checking the receipt');
          }),
        ]);
        clockNow = new Date(noon.getTime() + 12 * MINUTE);
        const settle = vi
          .spyOn(campaigns, 'settleReservation')
          .mockRejectedValueOnce(new Error('worker stopped before settlement'));
        try {
          await expect(sender.sendBatch(storeId, id)).rejects.toThrow(
            'worker stopped before settlement',
          );
        } finally {
          settle.mockRestore();
        }
        expect(await outcome(id)).toEqual([
          { status: 'failed', error_code: 'outcome_unknown', sms_credits: 1 },
        ]);
        expect(await settlementRows(id)).toEqual([]);

        result.resolve('not_sent');
        await first;
        expect(await outcome(id)).toEqual([
          { status: 'failed', error_code: 'provider_confirmed_not_sent', sms_credits: null },
        ]);
        expect(await settlementRows(id)).toEqual([{ kind: 'release', quantity_delta: 1 }]);
        expect(calls).toHaveLength(1);
        expect(lookup).toHaveBeenCalledTimes(2);
      } finally {
        result.resolve('not_sent');
        await first.catch(() => undefined);
        lookup.mockRestore();
      }
    });

    it.each([
      { state: 'sending', result: 'sent', expected: 'sent', error: null },
      {
        state: 'sending',
        result: 'not_sent',
        expected: 'failed',
        error: 'provider_confirmed_not_sent',
      },
      { state: 'cancelled', result: 'sent', expected: 'sent', error: null },
      {
        state: 'cancelled',
        result: 'not_sent',
        expected: 'failed',
        error: 'provider_confirmed_not_sent',
      },
      { state: 'cancelled', result: 'unknown', expected: 'failed', error: 'outcome_unknown' },
    ] as const)(
      'checks a $state campaign’s known receipt when the provider says $result',
      async ({ state, result, expected, error }) => {
        const { id } = await unknownFirstSend();
        const providerMessageId = 'known-campaign-receipt';
        await admin.pool.query(
          'update campaign_recipients set provider_message_id=$2 where campaign_id=$1',
          [id, providerMessageId],
        );
        if (state === 'cancelled') await campaigns.cancel(storeId, id, actor);
        clockNow = new Date(noon.getTime() + 6 * MINUTE);
        let lookupInsideTransaction: boolean | undefined;
        const lookup = vi
          .spyOn(MailpitSmsDriver.prototype, 'receiptStatus')
          .mockImplementationOnce(async () => {
            lookupInsideTransaction = app.get(StoreTransaction).isOpen();
            return result;
          });

        try {
          if (state === 'cancelled')
            await app.get(SendCampaignBatchJob).handle({ storeId, lane: 'cancelled' });
          else expect(await sender.sendBatch(storeId, id)).toBeNull();

          expect(lookup).toHaveBeenCalledExactlyOnceWith({
            providerMessageId,
            idempotencyKey: calls[0]?.idempotencyKey,
          });
          expect(lookupInsideTransaction).toBe(false);
          expect(calls).toHaveLength(1);
          expect(await outcome(id)).toEqual([
            { status: expected, error_code: error, sms_credits: result === 'not_sent' ? null : 1 },
          ]);
          expect(await settlementRows(id)).toEqual(
            result === 'not_sent' ? [{ kind: 'release', quantity_delta: 1 }] : charged,
          );
        } finally {
          lookup.mockRestore();
        }
      },
    );

    it.each([
      ['withdrawn', false],
      ['withdrawn while over the contact limit', true],
    ] as const)(
      'fails a resend whose contact is %s, charged and not sent',
      async (_, overLimit) => {
        const { id, phones } = await unknownFirstSend();
        if (overLimit)
          await admin.pool.query(
            'update contacts set is_over_plan_limit=true where store_id=$1 and phone=$2',
            [storeId, phones[0]],
          );
        await admin.pool.query(
          "insert into consents(id,store_id,contact_id,channel,status,source,captured_at) select gen_random_uuid(),$1,id,'sms','withdrawn','opt_out_link',now()+interval '1 second' from contacts where store_id=$1 and phone=$2",
          [storeId, phones[0]],
        );
        clockNow = new Date(noon.getTime() + 6 * MINUTE);

        expect(await sender.sendBatch(storeId, id)).toBeNull();

        expect(calls).toHaveLength(1);
        expect(await outcome(id)).toEqual([
          { status: 'failed', error_code: 'outcome_unknown', sms_credits: 1 },
        ]);
        expect(await settlementRows(id)).toEqual(charged);
      },
    );

    it('waits for a withdrawal already in progress before retrying', async () => {
      const { id, phones } = await unknownFirstSend();
      const writer = await admin.pool.connect();
      let sending: Promise<Date | null> | undefined;
      try {
        const {
          rows: [{ pid }],
        } = await writer.query<{ pid: number }>('select pg_backend_pid() as pid');
        await writer.query('begin');
        await writer.query(
          'select id from contacts where store_id=$1 and phone=$2 for no key update',
          [storeId, phones[0]],
        );
        await writer.query(
          "insert into consents(id,store_id,contact_id,channel,status,source,captured_at) select gen_random_uuid(),$1,id,'sms','withdrawn','opt_out_link',now()+interval '1 second' from contacts where store_id=$1 and phone=$2",
          [storeId, phones[0]],
        );
        clockNow = new Date(noon.getTime() + 6 * MINUTE);
        sending = sender.sendBatch(storeId, id);
        void sending.catch(() => undefined);
        await vi.waitFor(async () => {
          const {
            rows: [{ blocked }],
          } = await admin.pool.query<{ blocked: boolean }>(
            'select exists (select 1 from pg_stat_activity where $1 = any(pg_blocking_pids(pid))) as blocked',
            [pid],
          );
          expect(blocked).toBe(true);
        });
        await writer.query('commit');

        await expect(sending).resolves.toBeNull();
        expect(calls).toHaveLength(1);
        expect(await outcome(id)).toEqual([
          { status: 'failed', error_code: 'outcome_unknown', sms_credits: 1 },
        ]);
        expect(await settlementRows(id)).toEqual(charged);
      } finally {
        await writer.query('rollback');
        writer.release();
        await sending?.catch(() => undefined);
      }
    });

    it('defers an expired retry when quiet hours start during the consent lock wait', async () => {
      const { id, phones } = await unknownFirstSend();
      const writer = await admin.pool.connect();
      let sending: Promise<Date | null> | undefined;
      try {
        const {
          rows: [{ pid }],
        } = await writer.query<{ pid: number }>('select pg_backend_pid() as pid');
        await writer.query('begin');
        await writer.query(
          'select id from contacts where store_id=$1 and phone=$2 for no key update',
          [storeId, phones[0]],
        );
        clockNow = new Date(noon.getTime() + 9 * 60 * MINUTE - MINUTE);
        sending = sender.sendBatch(storeId, id);
        void sending.catch(() => undefined);
        await vi.waitFor(async () => {
          const {
            rows: [{ blocked }],
          } = await admin.pool.query<{ blocked: boolean }>(
            'select exists (select 1 from pg_stat_activity where $1 = any(pg_blocking_pids(pid))) as blocked',
            [pid],
          );
          expect(blocked).toBe(true);
        });
        clockNow = new Date(clockNow.getTime() + 2 * MINUTE);
        await writer.query('commit');

        await expect(sending).resolves.toEqual(new Date(noon.getTime() + 21 * 60 * MINUTE));
        expect(calls).toHaveLength(1);
        expect(await outcome(id)).toEqual([
          { status: 'sending', error_code: null, sms_credits: null },
        ]);
      } finally {
        await writer.query('rollback');
        writer.release();
        await sending?.catch(() => undefined);
      }
    });

    it('defers a resend in quiet hours and sends it once they end', async () => {
      const { id } = await unknownFirstSend();
      // 21:30 in Dhaka.
      clockNow = new Date(noon.getTime() + 9.5 * 60 * MINUTE);

      const next = await sender.sendBatch(storeId, id);

      expect(next).toEqual(new Date(noon.getTime() + 21 * 60 * MINUTE));
      expect(calls).toHaveLength(1);
      clockNow = next!;
      expect(await sender.sendBatch(storeId, id)).toBeNull();
      expect(calls).toHaveLength(2);
      expect(await outcome(id)).toEqual([{ status: 'sent', error_code: null, sms_credits: 1 }]);
    });

    it('stops at the ceiling and fails the recipient, charged', async () => {
      const { id } = await unknownFirstSend();
      vi.mocked(MailpitSmsDriver.prototype.send).mockImplementation(async (message) => {
        calls.push({ ...message });
        throw new Error('provider timed out');
      });
      for (const minutes of [6, 12]) {
        clockNow = new Date(noon.getTime() + minutes * MINUTE);
        await expect(sender.sendBatch(storeId, id)).rejects.toThrow('provider timed out');
      }
      clockNow = new Date(noon.getTime() + 18 * MINUTE);

      expect(await sender.sendBatch(storeId, id)).toBeNull();

      expect(calls).toHaveLength(3);
      expect(await sendAttempts(id)).toEqual([3]);
      expect(await outcome(id)).toEqual([
        { status: 'failed', error_code: 'outcome_unknown', sms_credits: 1 },
      ]);
      expect(await settlementRows(id)).toEqual(charged);
    });

    it('keeps the unknown outcome without resending after the frozen phone changes', async () => {
      const { id, phones } = await unknownFirstSend();
      await admin.pool.query(
        "update contacts set phone='01999000002' where store_id=$1 and phone=$2",
        [storeId, phones[0]],
      );
      clockNow = new Date(noon.getTime() + 6 * MINUTE);

      expect(await sender.sendBatch(storeId, id)).toBeNull();

      expect(calls).toHaveLength(1);
      expect(await outcome(id)).toEqual([
        { status: 'failed', error_code: 'outcome_unknown', sms_credits: 1 },
      ]);
      expect(await settlementRows(id)).toEqual(charged);
    });

    it('does not queue another attempt when the provider refuses an expired claim’s retry', async () => {
      const { id } = await unknownFirstSend();
      vi.mocked(MailpitSmsDriver.prototype.send).mockImplementationOnce(async (message) => {
        calls.push({ ...message });
        throw new SmsSendRefused();
      });
      clockNow = new Date(noon.getTime() + 6 * MINUTE);

      expect(await sender.sendBatch(storeId, id)).toBeNull();

      expect(calls).toHaveLength(2);
      expect(calls[1]?.idempotencyKey).toBe(calls[0]?.idempotencyKey);
      expect(await outcome(id)).toEqual([
        { status: 'failed', error_code: 'outcome_unknown', sms_credits: 1 },
      ]);
      expect(await settlementRows(id)).toEqual(charged);
    });
  });

  it('sends nothing for a paused campaign and keeps its reservation', async () => {
    const { id } = await sendingCampaign(2);
    await campaigns.pause(storeId, id, actor);

    expect(await sender.sendBatch(storeId, id)).toBeNull();

    expect(calls).toEqual([]);
    expect(await settlementRows(id)).toEqual([]);
  });
});
