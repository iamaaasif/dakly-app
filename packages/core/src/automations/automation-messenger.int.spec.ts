import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';
import { automationTemplates } from '@dakly/contracts/automations/templates';
import { createDatabase } from '@dakly/db/client';
import { MetaRequestError } from '@dakly/providers/channel/channel-driver';
import { FakeMetaChannelDriver } from '@dakly/providers/channel/meta/fake-meta-channel-driver';
import { MailpitSmsDriver } from '@dakly/providers/sms/mailpit/mailpit-sms-driver';

import { BillingModule } from '../billing/billing.module';
import { OrdersService } from '../orders/orders.service';
import { Clock } from '../platform/clock';
import { loadEnv, resetEnvForTests } from '../platform/config/env';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { DatabaseModule } from '../platform/database/database.module';
import { runWithJobContext } from '../platform/logging/job-context';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { AutomationRunsModule } from './automation-runs.module';
import { AutomationsModule } from './automations.module';
import { AnswerAutomationConfirmationTap } from './jobs/answer-automation-confirmation-tap.job';
import { ContinueAutomationRunJob } from './jobs/continue-automation-run.job';
import { WakeDueRunsJob } from './jobs/wake-due-runs.job';

class TestModule {}
Module({
  imports: [
    DatabaseModule,
    AutomationRunsModule,
    AutomationsModule,
    BillingModule,
    BullModule.forRoot({
      connection: toRedisConnection(loadEnv().REDIS_URL),
      prefix: `${loadEnv().QUEUE_PREFIX}-workflow-messenger-${randomUUID()}`,
    }),
    BullModule.registerQueue({ name: QUEUES.workflow }),
  ],
  providers: [WakeDueRunsJob, ContinueAutomationRunJob],
})(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const otherStoreId = randomUUID();
const HOUR = 60 * 60 * 1000;
// Tomorrow at 12:00 in Dhaka (UTC+6): outside quiet hours.
const today = new Date();
const noon = new Date(
  Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 6),
);
const end: AutomationStep = { kind: 'exit' };
const pages = { older: randomUUID(), newer: randomUUID() };
let app: INestApplicationContext;

async function connect(id: string, shop = storeId) {
  const secret = app
    .get(EnvelopeEncryption)
    .encrypt(
      { owner: 'store', storeId: shop, purpose: 'channel-access-token' },
      Buffer.from('fixture-page-credential'),
    );
  await admin.pool.query(
    `insert into channel_connections(id,store_id,kind,external_account_id,display_name,connected_at,
      access_token_ciphertext,key_version)
     values($1::uuid,$2,'facebook_page',$1::text,'পেজ', now() - interval '30 days',$3,$4)`,
    [id, shop, secret.ciphertext, secret.keyVersion],
  );
}

// A consented contact who wrote to `pageId` `hoursAgo` hours before the mocked now.
async function shopper(
  writes: { pageId: string; psid: string; hoursAgo: number }[],
  shop = storeId,
) {
  const contactId = randomUUID();
  await admin.pool.query(
    "insert into contacts(id,store_id,name,phone,source,kind) values($1,$2,'সুমি আক্তার',$3,'messenger','customer')",
    [contactId, shop, `0171${Math.floor(Math.random() * 1e7)}`.padEnd(11, '0')],
  );
  for (const channel of ['messenger', 'sms'])
    await admin.pool.query(
      "insert into consents(id,store_id,contact_id,channel,status,source) values(gen_random_uuid(),$1,$2,$3,'granted','checkout')",
      [shop, contactId, channel],
    );
  for (const { pageId, psid, hoursAgo } of writes) {
    await admin.pool.query(
      "insert into contact_identities(id,store_id,contact_id,channel_connection_id,channel,external_id) values(gen_random_uuid(),$1,$2,$3,'messenger',$4)",
      [shop, contactId, pageId, `${psid}-${contactId}`],
    );
    await admin.pool.query(
      "insert into conversations(id,store_id,contact_id,channel_connection_id,channel,last_inbound_at) values(gen_random_uuid(),$1,$2,$3,'messenger',$4)",
      [shop, contactId, pageId, new Date(noon.getTime() - hoursAgo * HOUR)],
    );
  }
  return contactId;
}

function sendStep(channels: ('messenger' | 'sms')[]): AutomationStep {
  return {
    kind: 'send',
    category: 'marketing',
    channels,
    message: { text: 'নতুন কালেকশন এসেছে', buttons: [{ key: 'yes', label: 'দেখুন' }] },
    ifNotReachable: 'skip',
    reviewBeforeSending: false,
    next: 'end',
  };
}

// A run due on the send step now; returns what the worker needs to run it.
async function dueRun(step: AutomationStep, contactId: string, orderId?: string) {
  const confirmation = automationTemplates.cod_order_confirmation.graph;
  const graph: AutomationGraph = orderId
    ? {
        ...confirmation,
        firstStepKey: 'first',
        steps: { ...confirmation.steps, first: step },
      }
    : {
        trigger: { key: 'consent_given', filters: [] },
        reEntry: { rule: 'once' },
        workflowFilters: [],
        goal: null,
        exitConditions: [],
        firstStepKey: 'first',
        steps: { first: step, end },
      };
  const automationId = randomUUID();
  const versionId = randomUUID();
  const runId = randomUUID();
  await admin.pool.query(
    "insert into automations(id,store_id,name,trigger_type,draft_graph,status,template_key) values($1,$2,'স্বাগতম',$3,'{}','active',$4)",
    [automationId, storeId, graph.trigger.key, orderId ? 'cod_order_confirmation' : null],
  );
  await admin.pool.query(
    'insert into automation_versions(id,store_id,automation_id,version,graph) values($1,$2,$3,1,$4)',
    [versionId, storeId, automationId, JSON.stringify(graph)],
  );
  await admin.pool.query('update automations set published_version_id=$1 where id=$2', [
    versionId,
    automationId,
  ]);
  await admin.pool.query(
    `insert into automation_runs(id,store_id,automation_id,version_id,contact_id,trigger_key,current_step_key,status,wake_at,trigger_order_id)
     values($1,$2,$3,$4,$5,$6,'first','waiting',now() - interval '1 minute',$7)`,
    [runId, storeId, automationId, versionId, contactId, `event-${runId}`, orderId ?? null],
  );
  return runId;
}

async function confirmationRun(number: number, hoursAgo = 2) {
  const contactId = await shopper([{ pageId: pages.newer, psid: 'cod', hoursAgo }]);
  const orderId = randomUUID();
  await admin.pool.query(
    `insert into orders(id,store_id,number,buyer_contact_id,source,created_by_type,stage,recipient_name,
      recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,delivery_charge_poisha,cod_amount_poisha)
     values($1,$2,$3,$4,'manual','user','to_confirm','সুমি','01811000001','Mirpur','Dhaka',120000,6000,126000)`,
    [orderId, storeId, number, contactId],
  );
  const runId = await dueRun(
    automationTemplates.cod_order_confirmation.graph.steps.ask!,
    contactId,
    orderId,
  );
  return { contactId, orderId, runId };
}

async function tapEvent(shop: string, contactId: string, postback: string, pageId = pages.newer) {
  const {
    rows: [conversation],
  } = await admin.pool.query<{ id: string; identityId: string }>(
    `select c.id, i.id as "identityId" from conversations c join contact_identities i
     on i.store_id=c.store_id and i.contact_id=c.contact_id and i.channel_connection_id=c.channel_connection_id
     where c.store_id=$1 and c.contact_id=$2 and c.channel_connection_id=$3`,
    [shop, contactId, pageId],
  );
  return {
    id: randomUUID(),
    type: 'message.postback_received',
    storeId: shop,
    occurredAt: noon.toISOString(),
    payload: {
      channel: 'messenger',
      contactId,
      conversationId: conversation!.id,
      postback,
      identityId: conversation!.identityId,
      tapKey: randomBytes(32).toString('hex'),
    },
  };
}

async function orderState(orderId: string) {
  const {
    rows: [order],
  } = await admin.pool.query('select stage, confirmation_method from orders where id=$1', [
    orderId,
  ]);
  return order;
}

async function runStep(runId: string) {
  await app.get(WakeDueRunsJob).handle({});
  const jobs = await app.get<Queue>(getQueueToken(QUEUES.workflow)).getJobs(['waiting']);
  const job = jobs.find((candidate) => candidate.data.automationRunId === runId)!;
  await job.remove();
  await runWithJobContext(() => app.get(ContinueAutomationRunJob).handle(job.data));
}

async function outcome(runId: string) {
  const run = await admin.pool.query(
    'select status, current_step_key from automation_runs where id=$1',
    [runId],
  );
  const steps = await admin.pool.query(
    "select outcome, channel, skip_reason, provider_message_id from automation_run_steps where run_id=$1 and kind='send'",
    [runId],
  );
  return { run: run.rows[0] as { status: string; current_step_key: string }, steps: steps.rows };
}

describe('Workflow Messenger send steps (Postgres and Valkey)', () => {
  beforeAll(async () => {
    vi.stubEnv('META_CHANNEL_DRIVER', 'fake');
    vi.stubEnv('META_OAUTH_REDIRECT_URI', 'http://localhost:3000/integrations/meta');
    vi.stubEnv('CODE_HASH_KEY', Buffer.alloc(32, 5).toString('base64'));
    resetEnvForTests();
    await admin.pool.query("insert into stores(id,name) values($1,'রিনার দোকান')", [storeId]);
    await admin.pool.query(
      "insert into wallet_ledger(id,store_id,wallet,revision,kind,quantity_delta,balance_quantity_after,idempotency_key,actor_type) values(gen_random_uuid(),$1,'sms_credits',1,'top_up',1000,1000,$2,'system')",
      [storeId, `seed-${storeId}`],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    await connect(pages.older);
    await connect(pages.newer);
  });

  beforeEach(() => {
    vi.spyOn(Clock.prototype, 'now').mockReturnValue(noon);
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    try {
      await app?.close();
      await admin.pool.query('delete from automation_runs where store_id=$1', [storeId]);
      await admin.pool.query('delete from order_confirmations where store_id=$1', [storeId]);
      await admin.pool.query('delete from orders where store_id=$1', [storeId]);
      await admin.pool.query('delete from audit_log where store_id=$1', [storeId]);
      await admin.pool.query('delete from messages where store_id=$1', [storeId]);
      await admin.pool.query('delete from conversations where store_id=$1', [storeId]);
      await admin.pool.query('delete from contact_identities where store_id=$1', [storeId]);
      await admin.pool.query('update automations set published_version_id=null where store_id=$1', [
        storeId,
      ]);
      await admin.pool.query('delete from automation_versions where store_id=$1', [storeId]);
      await admin.pool.query('delete from automations where store_id=$1', [storeId]);
      await admin.pool.query('delete from wallet_ledger where store_id=$1', [storeId]);
      await admin.pool.query('delete from outbox_events where store_id=$1', [storeId]);
      await admin.pool.query('delete from tracked_links where store_id=$1', [storeId]);
      await admin.pool.query('delete from channel_connections where store_id=$1', [storeId]);
      await admin.pool.query('delete from contacts where store_id=$1', [storeId]);
      await admin.pool.query('delete from stores where id=$1', [storeId]);
      await admin.pool.query('delete from conversations where store_id=$1', [otherStoreId]);
      await admin.pool.query('delete from contact_identities where store_id=$1', [otherStoreId]);
      await admin.pool.query('delete from channel_connections where store_id=$1', [otherStoreId]);
      await admin.pool.query('delete from consents where store_id=$1', [otherStoreId]);
      await admin.pool.query('delete from contacts where store_id=$1', [otherStoreId]);
      await admin.pool.query('delete from stores where id=$1', [otherStoreId]);
    } finally {
      vi.unstubAllEnvs();
      resetEnvForTests();
      await admin.pool.end();
    }
  });

  it.each([
    {
      key: 'confirm',
      number: 1043,
      stage: 'to_pack',
      reply: 'অর্ডার নিশ্চিত হয়েছে। দোকান শীঘ্রই পাঠানোর ব্যবস্থা করবে।',
    },
    {
      key: 'cancel',
      number: 1044,
      stage: 'cancelled',
      reply: 'অর্ডার বাতিল হয়েছে। দোকানকে জানিয়ে দেওয়া হয়েছে।',
    },
  ])(
    'answers $key in Messenger and leaves a repeated tap idempotent',
    async ({ key, number, stage, reply }) => {
      const { orderId, contactId, runId } = await confirmationRun(number);
      const provider = vi
        .spyOn(FakeMetaChannelDriver.prototype, 'send')
        .mockResolvedValue({ externalMessageId: `cod-${number}` });
      await runStep(runId);
      const sent = provider.mock.lastCall?.[1];
      expect(sent?.text).toContain(`#${number}`);
      expect(sent?.text).not.toContain('/c/');
      expect(sent?.buttons?.map(({ title }) => title)).toEqual(['Confirm order', 'Cancel order']);
      const postback = sent?.buttons?.find(({ payload }) => payload.endsWith(`:${key}`))?.payload;
      expect(postback).toMatch(new RegExp(`^workflow:[0-9a-f-]{36}:${key}$`, 'u'));
      const event = await tapEvent(storeId, contactId, postback!);
      const handler = app.get(AnswerAutomationConfirmationTap);
      await handler.handle({ ...event, id: randomUUID() });
      const result = await orderState(orderId);
      expect(result).toMatchObject({
        stage,
        confirmation_method: key === 'confirm' ? 'chat_reply' : null,
      });
      await handler.handle(event);
      expect(await orderState(orderId)).toEqual(result);
      const { rows } = await admin.pool.query(
        "select body from messages where conversation_id=$1 and direction='out' and status='queued'",
        [event.payload.conversationId],
      );
      expect(rows).toEqual([{ body: reply }]);

      await handler.handle(await tapEvent(storeId, contactId, postback!));
      expect(await orderState(orderId)).toEqual(result);
      const replies = await admin.pool.query(
        "select body from messages where conversation_id=$1 and direction='out' and status='queued'",
        [event.payload.conversationId],
      );
      expect(replies.rows).toEqual([{ body: reply }, { body: reply }]);

      await admin.pool.query(
        "update automation_runs set wake_at=now() - interval '1 minute' where id=$1",
        [runId],
      );
      await runStep(runId);
      expect((await outcome(runId)).run).toMatchObject({ status: 'exited' });
    },
  );

  it('reports the current stage after staff confirmed, and ignores taps from another buyer or shop', async () => {
    const { orderId, contactId, runId } = await confirmationRun(1045);
    const provider = vi
      .spyOn(FakeMetaChannelDriver.prototype, 'send')
      .mockResolvedValue({ externalMessageId: 'cod-staff' });
    await runStep(runId);
    const postback = provider.mock.lastCall?.[1].buttons?.[1]?.payload;
    expect(postback).toMatch(/:cancel$/u);
    const unlocked = await tapEvent(storeId, contactId, postback!);
    const otherBuyer = await shopper([{ pageId: pages.newer, psid: 'other-buyer', hoursAgo: 2 }]);
    const handler = app.get(AnswerAutomationConfirmationTap);
    await handler.handle(await tapEvent(storeId, otherBuyer, postback!));
    const otherPage = randomUUID();
    await admin.pool.query("insert into stores(id,name) values($1,'Other shop')", [otherStoreId]);
    await connect(otherPage, otherStoreId);
    const otherContact = await shopper(
      [{ pageId: otherPage, psid: 'other-shop', hoursAgo: 2 }],
      otherStoreId,
    );
    await handler.handle(await tapEvent(otherStoreId, otherContact, postback!, otherPage));
    await admin.pool.query(
      `insert into contact_identities(id,store_id,contact_id,channel_connection_id,channel,external_id)
       values(gen_random_uuid(),$1,$2::uuid,$3,'messenger',$2::uuid::text)`,
      [storeId, contactId, pages.older],
    );
    await admin.pool.query(
      `insert into conversations(id,store_id,contact_id,channel_connection_id,channel,last_inbound_at)
       values(gen_random_uuid(),$1,$2,$3,'messenger',$4)`,
      [storeId, contactId, pages.older, noon],
    );
    await handler.handle(await tapEvent(storeId, contactId, postback!, pages.older));
    expect(await orderState(orderId)).toMatchObject({ stage: 'to_confirm' });

    await app.get(OrdersService).changeStage(
      storeId,
      orderId,
      { to: 'to_pack' },
      {
        actor: { kind: 'system' },
        access: { seeFullPhone: false },
      },
    );
    await handler.handle(unlocked);
    expect(await orderState(orderId)).toMatchObject({
      stage: 'to_pack',
      confirmation_method: 'staff',
    });
    const { rows } = await admin.pool.query(
      "select body from messages where conversation_id=$1 and status='queued'",
      [unlocked.payload.conversationId],
    );
    expect(rows).toEqual([{ body: 'অর্ডার নিশ্চিত হয়েছে। দোকান শীঘ্রই পাঠানোর ব্যবস্থা করবে।' }]);
  });

  it('answers on the Page where the contact wrote last, with its buttons', async () => {
    const contactId = await shopper([
      { pageId: pages.older, psid: 'psid-older', hoursAgo: 10 },
      { pageId: pages.newer, psid: 'psid-newer', hoursAgo: 2 },
    ]);
    const provider = vi
      .spyOn(FakeMetaChannelDriver.prototype, 'send')
      .mockResolvedValue({ externalMessageId: 'fake-mid-1' });
    const runId = await dueRun(sendStep(['messenger']), contactId);

    await runStep(runId);

    expect(provider).toHaveBeenCalledOnce();
    expect(provider.mock.calls[0]![1]).toMatchObject({
      channel: 'messenger',
      externalConversationId: expect.stringMatching(/^psid-newer-/),
      text: 'নতুন কালেকশন এসেছে',
      buttons: [{ title: 'দেখুন', payload: expect.stringMatching(/^workflow:[0-9a-f-]{36}:yes$/) }],
    });
    expect(await outcome(runId)).toEqual({
      run: expect.objectContaining({ status: 'running', current_step_key: 'end' }),
      steps: [
        {
          outcome: 'sent',
          channel: 'messenger',
          skip_reason: null,
          provider_message_id: 'fake-mid-1',
        },
      ],
    });
  });

  it('skips as window_closed when the window is over, without sending', async () => {
    const contactId = await shopper([{ pageId: pages.newer, psid: 'psid-late', hoursAgo: 24 }]);
    const provider = vi.spyOn(FakeMetaChannelDriver.prototype, 'send');
    const runId = await dueRun(sendStep(['messenger']), contactId);

    await runStep(runId);

    expect(provider).not.toHaveBeenCalled();
    expect((await outcome(runId)).steps).toEqual([
      expect.objectContaining({ outcome: 'skipped', skip_reason: 'window_closed' }),
    ]);
  });

  it('skips as no_address when the contact never wrote on Messenger', async () => {
    const contactId = await shopper([]);
    const provider = vi.spyOn(FakeMetaChannelDriver.prototype, 'send');
    const runId = await dueRun(sendStep(['messenger']), contactId);

    await runStep(runId);

    expect(provider).not.toHaveBeenCalled();
    expect((await outcome(runId)).steps).toEqual([
      expect.objectContaining({ outcome: 'skipped', skip_reason: 'no_address' }),
    ]);
  });

  it('falls to SMS when the contact never wrote on Messenger and the step lists SMS', async () => {
    const contactId = await shopper([]);
    const messenger = vi.spyOn(FakeMetaChannelDriver.prototype, 'send');
    const sms = vi
      .spyOn(MailpitSmsDriver.prototype, 'send')
      .mockResolvedValue({ providerMessageId: 'fake-sms-2' });
    const runId = await dueRun(sendStep(['messenger', 'sms']), contactId);

    await runStep(runId);

    expect(messenger).not.toHaveBeenCalled();
    expect(sms).toHaveBeenCalledOnce();
    expect((await outcome(runId)).steps).toEqual([
      expect.objectContaining({ outcome: 'sent', channel: 'sms' }),
    ]);
  });

  it('falls back to SMS only when the step lists it', async () => {
    const contactId = await shopper([{ pageId: pages.newer, psid: 'psid-late', hoursAgo: 30 }]);
    const messenger = vi.spyOn(FakeMetaChannelDriver.prototype, 'send');
    const sms = vi
      .spyOn(MailpitSmsDriver.prototype, 'send')
      .mockResolvedValue({ providerMessageId: 'fake-sms-1' });
    const runId = await dueRun(sendStep(['messenger', 'sms']), contactId);

    await runStep(runId);

    expect(messenger).not.toHaveBeenCalled();
    expect(sms).toHaveBeenCalledOnce();
    expect((await outcome(runId)).steps).toEqual([
      expect.objectContaining({ outcome: 'sent', channel: 'sms' }),
    ]);
  });

  it('sends the COD confirmation link by SMS when the Messenger window is closed', async () => {
    const { runId } = await confirmationRun(1046, 30);
    const messenger = vi.spyOn(FakeMetaChannelDriver.prototype, 'send');
    const sms = vi
      .spyOn(MailpitSmsDriver.prototype, 'send')
      .mockResolvedValue({ providerMessageId: 'fake-cod-sms' });
    await runStep(runId);
    expect(messenger).not.toHaveBeenCalled();
    expect(sms.mock.lastCall?.[0].text).toMatch(/#1046.*\/c\/[\w-]{43}/u);
    expect((await outcome(runId)).steps).toEqual([
      expect.objectContaining({ outcome: 'sent', channel: 'sms' }),
    ]);
  });

  it('ignores a queued tap after the buyer has been deleted', async () => {
    const { orderId, contactId, runId } = await confirmationRun(1047);
    const provider = vi
      .spyOn(FakeMetaChannelDriver.prototype, 'send')
      .mockResolvedValue({ externalMessageId: 'cod-deleted-buyer' });
    await runStep(runId);
    const postback = provider.mock.lastCall?.[1].buttons?.[0]?.payload;
    const event = await tapEvent(storeId, contactId, postback!);
    await admin.pool.query('update contacts set deleted_at=now() where id=$1', [contactId]);
    await app.get(AnswerAutomationConfirmationTap).handle(event);
    expect(await orderState(orderId)).toMatchObject({ stage: 'to_confirm' });
  });

  it('ends the run and never sends again when Meta does not confirm', async () => {
    const contactId = await shopper([{ pageId: pages.newer, psid: 'psid-open', hoursAgo: 1 }]);
    const provider = vi
      .spyOn(FakeMetaChannelDriver.prototype, 'send')
      .mockRejectedValue(new MetaRequestError('unavailable'));
    const runId = await dueRun(sendStep(['messenger']), contactId);

    await runStep(runId);

    expect(provider).toHaveBeenCalledOnce();
    expect(await outcome(runId)).toEqual({
      run: expect.objectContaining({ status: 'failed' }),
      steps: [expect.objectContaining({ outcome: 'unconfirmed', channel: 'messenger' })],
    });
  });

  it('treats a step interrupted after it was written as unconfirmed, not sent again', async () => {
    const contactId = await shopper([{ pageId: pages.newer, psid: 'psid-open', hoursAgo: 1 }]);
    const provider = vi
      .spyOn(FakeMetaChannelDriver.prototype, 'send')
      .mockRejectedValue(new Error('worker lost'));
    const runId = await dueRun(sendStep(['messenger']), contactId);

    await expect(runStep(runId)).rejects.toThrow('worker lost');
    await admin.pool.query(
      "update automation_runs set status='waiting', wake_at=now() - interval '1 minute' where id=$1",
      [runId],
    );
    await runStep(runId);

    expect(provider).toHaveBeenCalledOnce();
    expect(await outcome(runId)).toEqual({
      run: expect.objectContaining({ status: 'failed' }),
      steps: [expect.objectContaining({ outcome: 'unconfirmed', channel: 'messenger' })],
    });
  });
});
