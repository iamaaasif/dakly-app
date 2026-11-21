import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';
import { createDatabase } from '@dakly/db/client';
import { MetaRequestError } from '@dakly/providers/channel/channel-driver';
import { FakeMetaChannelDriver } from '@dakly/providers/channel/meta/fake-meta-channel-driver';
import { MailpitSmsDriver } from '@dakly/providers/sms/mailpit/mailpit-sms-driver';

import { BillingModule } from '../billing/billing.module';
import { Clock } from '../platform/clock';
import { loadEnv, resetEnvForTests } from '../platform/config/env';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { DatabaseModule } from '../platform/database/database.module';
import { runWithJobContext } from '../platform/logging/job-context';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { AutomationRunsModule } from './automation-runs.module';
import { AutomationsModule } from './automations.module';
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
const HOUR = 60 * 60 * 1000;
// Tomorrow at 12:00 in Dhaka (UTC+6): outside quiet hours.
const today = new Date();
const noon = new Date(
  Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 6),
);
const end: AutomationStep = { kind: 'exit' };
const pages = { older: randomUUID(), newer: randomUUID() };
let app: INestApplicationContext;

async function connect(id: string) {
  const secret = app
    .get(EnvelopeEncryption)
    .encrypt(
      { owner: 'store', storeId, purpose: 'channel-access-token' },
      Buffer.from('fixture-page-credential'),
    );
  await admin.pool.query(
    `insert into channel_connections(id,store_id,kind,external_account_id,display_name,connected_at,
      access_token_ciphertext,key_version)
     values($1::uuid,$2,'facebook_page',$1::text,'পেজ', now() - interval '30 days',$3,$4)`,
    [id, storeId, secret.ciphertext, secret.keyVersion],
  );
}

// A consented contact who wrote to `pageId` `hoursAgo` hours before the mocked now.
async function shopper(writes: { pageId: string; psid: string; hoursAgo: number }[]) {
  const contactId = randomUUID();
  await admin.pool.query(
    "insert into contacts(id,store_id,name,phone,source,kind) values($1,$2,'সুমি আক্তার',$3,'messenger','customer')",
    [contactId, storeId, `0171${Math.floor(Math.random() * 1e7)}`.padEnd(11, '0')],
  );
  for (const channel of ['messenger', 'sms'])
    await admin.pool.query(
      "insert into consents(id,store_id,contact_id,channel,status,source) values(gen_random_uuid(),$1,$2,$3,'granted','checkout')",
      [storeId, contactId, channel],
    );
  for (const { pageId, psid, hoursAgo } of writes) {
    await admin.pool.query(
      "insert into contact_identities(id,store_id,contact_id,channel_connection_id,channel,external_id) values(gen_random_uuid(),$1,$2,$3,'messenger',$4)",
      [storeId, contactId, pageId, `${psid}-${contactId}`],
    );
    await admin.pool.query(
      "insert into conversations(id,store_id,contact_id,channel_connection_id,channel,last_inbound_at) values(gen_random_uuid(),$1,$2,$3,'messenger',$4)",
      [storeId, contactId, pageId, new Date(noon.getTime() - hoursAgo * HOUR)],
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
async function dueRun(step: AutomationStep, contactId: string) {
  const graph: AutomationGraph = {
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
    "insert into automations(id,store_id,name,trigger_type,draft_graph,status) values($1,$2,'স্বাগতম','consent_given','{}','active')",
    [automationId, storeId],
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
    `insert into automation_runs(id,store_id,automation_id,version_id,contact_id,trigger_key,current_step_key,status,wake_at)
     values($1,$2,$3,$4,$5,$6,'first','waiting',now() - interval '1 minute')`,
    [runId, storeId, automationId, versionId, contactId, `event-${runId}`],
  );
  return runId;
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
    } finally {
      vi.unstubAllEnvs();
      resetEnvForTests();
      await admin.pool.end();
    }
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
