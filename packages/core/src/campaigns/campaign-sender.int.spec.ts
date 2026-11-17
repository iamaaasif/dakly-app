import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Logger, Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCampaignSchema } from '@dakly/contracts/campaigns';
import { createDatabase } from '@dakly/db/client';
import { FakeSmsDriver } from '@dakly/providers/sms/fake-sms-driver';
import { MailpitSmsDriver } from '@dakly/providers/sms/mailpit/mailpit-sms-driver';
import { type SmsMessage, SmsSendRefused } from '@dakly/providers/sms/sms-driver';

import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { ErrorReporter } from '../platform/logging/error-reporter';
import { runWithJobContext } from '../platform/logging/job-context';
import { SegmentsService } from '../segments/segments.service';
import { WalletService } from '../wallets/wallet.service';
import { CampaignSenderService } from './campaign-sender.service';
import { CampaignSendingRepository } from './campaign-sending.repository';
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
async function sendingCampaign(count: number, scheduledFor: Date | null = null) {
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
    content: { text: TEXT },
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

async function settledAt(campaignId: string) {
  const { rows } = await admin.pool.query('select settled_at from campaigns where id=$1', [
    campaignId,
  ]);
  return (rows[0] as { settled_at: Date | null }).settled_at;
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
        'contacts',
      ])
        await admin.pool.query(`delete from ${table} where store_id=$1`, [storeId]);
      await admin.pool.query('delete from stores where id=$1', [storeId]);
      await admin.pool.query('delete from users where id=$1', [userId]);
    } finally {
      await admin.pool.end();
    }
  });

  it('sends each recipient its opt-out link, then charges what was sent and emits campaign.sent', async () => {
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
    const { rows: events } = await admin.pool.query(
      "select payload from outbox_events where store_id=$1 and type='campaign.sent' and payload->>'campaignId'=$2",
      [storeId, id],
    );
    expect(events).toHaveLength(1);
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

    clockNow = new Date(noon.getTime() + 6 * MINUTE);
    expect(await sender.sendBatch(storeId, id)).toBeNull();

    expect(driver.messages.map((message) => message.to).sort()).toEqual(phones);
    const [first, ...resends] = calls.filter((call) => call.to === calls[0]!.to);
    expect(resends).toHaveLength(1);
    expect(resends[0]).toEqual(first);
    expect((await recipients(id)).map((row) => row.status)).toEqual(['sent', 'sent']);
    // Each provider call counts toward the ceiling, the resend included.
    expect((await sendAttempts(id)).sort()).toEqual([1, 2]);
    expect(await settlementRows(id)).toEqual([
      { kind: 'release', quantity_delta: 2 },
      { kind: 'charge', quantity_delta: -2 },
    ]);
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
    async function unknownFirstSend() {
      const campaign = await sendingCampaign(1);
      vi.mocked(MailpitSmsDriver.prototype.send).mockImplementationOnce(async (message) => {
        calls.push({ ...message });
        throw new Error('provider timed out');
      });
      await expect(sender.sendBatch(storeId, campaign.id)).rejects.toThrow('provider timed out');
      return campaign;
    }

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

    it('fails a resend whose contact withdrew meanwhile, charged and not sent', async () => {
      const { id, phones } = await unknownFirstSend();
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

    it('never queues a resend again when messaging refuses it', async () => {
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
  });

  it('sends nothing for a paused campaign and keeps its reservation', async () => {
    const { id } = await sendingCampaign(2);
    await campaigns.pause(storeId, id, actor);

    expect(await sender.sendBatch(storeId, id)).toBeNull();

    expect(calls).toEqual([]);
    expect(await settlementRows(id)).toEqual([]);
  });

  it('starts a scheduled campaign once its time has come', async () => {
    const sendAt = new Date(noon.getTime() + 60 * MINUTE);
    const { id } = await sendingCampaign(1, sendAt);

    await sender.startDue();
    expect(await campaignRow(id)).toMatchObject({ status: 'scheduled', started_at: null });

    clockNow = sendAt;
    await sender.startDue();
    expect(await campaignRow(id)).toMatchObject({ status: 'sending', started_at: sendAt });
  });

  it('keeps the counts on the campaign equal to its recipient rows', async () => {
    const { id, phones } = await sendingCampaign(3);
    await admin.pool.query(
      "insert into consents(id,store_id,contact_id,channel,status,source,captured_at) select gen_random_uuid(),$1,id,'sms','withdrawn','opt_out_link',now()+interval '1 second' from contacts where store_id=$1 and phone=$2",
      [storeId, phones[0]],
    );

    await sender.sendBatch(storeId, id);

    const { rows } = await admin.pool.query(
      'select status, count(*)::int as count from campaign_recipients where campaign_id=$1 group by status order by status',
      [id],
    );
    expect(rows).toEqual([
      { status: 'sent', count: 2 },
      { status: 'skipped', count: 1 },
    ]);
    expect((await campaigns.get(storeId, id)).counts).toEqual({
      recipients: 3,
      skipped: 1,
      sent: 2,
      delivered: 0,
      read: 0,
      tapped: 0,
      failed: 0,
      countedAt: noon.toISOString(),
    });
  });

  it('cancels a sending campaign and settles once the message left in sending resolves', async () => {
    const before = await wallets.balance(storeId, 'sms_credits');
    const { id } = await sendingCampaign(3);
    const change = CampaignSendingRepository.prototype.changeRecipient;
    const passThrough = function (
      this: CampaignSendingRepository,
      ...args: Parameters<typeof change>
    ) {
      return change.apply(this, args);
    };
    // The second message reaches the provider, then the worker stops before recording it.
    const crash = vi
      .spyOn(CampaignSendingRepository.prototype, 'changeRecipient')
      .mockImplementationOnce(passThrough)
      .mockImplementationOnce(passThrough)
      .mockImplementationOnce(passThrough)
      .mockImplementationOnce(async () => {
        throw new Error('worker stopped');
      });
    await expect(sender.sendBatch(storeId, id)).rejects.toThrow('worker stopped');
    crash.mockRestore();

    expect((await campaigns.cancel(storeId, id, actor)).status).toBe('cancelled');

    expect(await campaignRow(id)).toMatchObject({ finished_at: noon });
    expect((await recipients(id)).map((row) => row.status).sort()).toEqual([
      'cancelled',
      'sending',
      'sent',
    ]);
    // The message in sending may be with the provider, so the reservation stays held.
    expect(await settlementRows(id)).toEqual([]);
    expect((await campaigns.get(storeId, id)).counts).toMatchObject({ sent: 1, skipped: 0 });
    expect(await settledAt(id)).toBeNull();

    // Its claim expires and it is resent under the same key, which sends nothing new.
    clockNow = new Date(noon.getTime() + 6 * MINUTE);
    expect(await sender.sendBatch(storeId, id)).toBeNull();

    expect(calls).toHaveLength(3);
    expect(driver.messages).toHaveLength(2);
    expect((await recipients(id)).map((row) => row.status).sort()).toEqual([
      'cancelled',
      'sent',
      'sent',
    ]);
    expect(await campaignRow(id)).toMatchObject({ status: 'cancelled', finished_at: noon });
    expect(await settlementRows(id)).toEqual([
      { kind: 'release', quantity_delta: 3 },
      { kind: 'charge', quantity_delta: -2 },
    ]);
    expect(await wallets.balance(storeId, 'sms_credits')).toBe(before - 2);
    expect((await campaigns.get(storeId, id)).counts).toMatchObject({ sent: 2 });
    expect(await settledAt(id)).toEqual(new Date(noon.getTime() + 6 * MINUTE));
    // A later batch replays the same settlement and writes nothing.
    expect(await sender.sendBatch(storeId, id)).toBeNull();
    expect(await settlementRows(id)).toHaveLength(2);
  });

  it('refuses to cancel a sent campaign and writes no wallet rows', async () => {
    const { id } = await sendingCampaign(1);
    expect(await sender.sendBatch(storeId, id)).toBeNull();
    expect(await campaignRow(id)).toMatchObject({ status: 'sent' });
    const ledger = async () =>
      (
        await admin.pool.query(
          'select count(*)::int as count from wallet_ledger where store_id=$1',
          [storeId],
        )
      ).rows[0].count;
    const before = await ledger();

    await expect(campaigns.cancel(storeId, id, actor)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_CANCELLABLE',
    });

    expect(await ledger()).toBe(before);
    expect(await campaignRow(id)).toMatchObject({ status: 'sent' });
  });

  it('sends nothing after a cancel when the provider recovers from refusing', async () => {
    const { id } = await sendingCampaign(2);
    vi.mocked(SmsService.prototype.send).mockImplementation(async (message) => {
      calls.push({ ...message });
      throw new SmsSendRefused();
    });
    await expect(sender.sendBatch(storeId, id)).rejects.toThrow(SmsSendRefused);
    await campaigns.pause(storeId, id, actor);
    await campaigns.cancel(storeId, id, actor);
    vi.mocked(SmsService.prototype.send).mockImplementation(async (message) => {
      calls.push({ ...message });
      return driver.send(message);
    });

    clockNow = new Date(noon.getTime() + 6 * MINUTE);
    expect(await sender.sendBatch(storeId, id)).toBeNull();

    expect(calls).toHaveLength(1);
    expect(driver.messages).toEqual([]);
    expect((await recipients(id)).map((row) => row.status)).toEqual(['cancelled', 'cancelled']);
    expect(await settlementRows(id)).toEqual([{ kind: 'release', quantity_delta: 2 }]);
    expect(await settledAt(id)).toEqual(noon);
  });

  it('cancels a paused campaign and gives back every credit', async () => {
    const before = await wallets.balance(storeId, 'sms_credits');
    const { id } = await sendingCampaign(2);
    await campaigns.pause(storeId, id, actor);

    expect((await campaigns.cancel(storeId, id, actor)).status).toBe('cancelled');

    expect(await campaignRow(id)).toMatchObject({ status: 'cancelled', finished_at: noon });
    // A cancelled campaign keeps no pause reason, so nothing reads it as a system pause later.
    const { rows: paused } = await admin.pool.query(
      'select pause_reason from campaigns where id=$1',
      [id],
    );
    expect(paused).toEqual([{ pause_reason: null }]);
    expect((await recipients(id)).map((row) => row.status)).toEqual(['cancelled', 'cancelled']);
    expect(await settlementRows(id)).toEqual([{ kind: 'release', quantity_delta: 2 }]);
    expect(await wallets.balance(storeId, 'sms_credits')).toBe(before);
    await expect(campaigns.cancel(storeId, id, actor)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_CANCELLABLE',
    });
  });

  it('names one sending campaign per store, the earliest started, then the next', async () => {
    const otherStore = randomUUID();
    const [first, second] = [randomUUID(), randomUUID()];
    await admin.pool.query("insert into stores(id,name) values($1,'রনির দোকান')", [otherStore]);
    for (const [id, startedAt] of [
      [second, '2026-11-18T07:00:00Z'],
      [first, '2026-11-18T06:00:00Z'],
    ])
      await admin.pool.query(
        `insert into campaigns(id,store_id,name,channel,content,status,approved_at,started_at)
         values($1,$2,'নতুন কালেকশন','sms','{"text":"নতুন"}','sending',now(),$3)`,
        [id, otherStore, startedAt],
      );
    const named = async () =>
      (await sender.startDue()).filter((campaign) => campaign.storeId === otherStore);
    try {
      expect(await named()).toEqual([{ storeId: otherStore, campaignId: first }]);
      await admin.pool.query("update campaigns set status='sent' where id=$1", [first]);
      expect(await named()).toEqual([{ storeId: otherStore, campaignId: second }]);
    } finally {
      await admin.pool.query('delete from campaigns where store_id=$1', [otherStore]);
      await admin.pool.query('delete from stores where id=$1', [otherStore]);
    }
  });

  it('starts the other due campaigns when one fails', async () => {
    const sendAt = new Date(noon.getTime() + 60 * MINUTE);
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
});
