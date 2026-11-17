import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';
import { createDatabase } from '@dakly/db/client';
import { FakeSmsDriver } from '@dakly/providers/sms/fake-sms-driver';
import { MailpitSmsDriver } from '@dakly/providers/sms/mailpit/mailpit-sms-driver';

import { ConsentService } from '../consents/consent.service';
import { EmailService } from '../email/email.service';
import { ValkeyClient } from '../platform/cache/valkey-client';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { SendPolicyService } from '../sending/send-policy.service';
import { TeamService } from '../team/team.service';
import { WalletService } from '../wallets/wallet.service';
import { AutomationRunsModule } from './automation-runs.module';
import { AutomationsModule } from './automations.module';
import { ContinueAutomationRunJob } from './jobs/continue-automation-run.job';
import { EmailOwnerOnAutomationPaused } from './jobs/email-owner-on-automation-paused.job';
import { ResumeWorkflowsOnWalletCredited } from './jobs/resume-workflows-on-wallet-credited.job';
import { WakeDueRunsJob } from './jobs/wake-due-runs.job';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const contactId = randomUUID();
const ownerId = randomUUID();
const staffUserId = randomUUID();
const ownerEmail = `owner-${ownerId}@example.test`;
const coOwnerId = randomUUID();
const MINUTE = 60 * 1000;
const end: AutomationStep = { kind: 'exit' };
const applications: INestApplicationContext[] = [];

type StepJobData = {
  storeId: string;
  automationRunId: string;
  stepKey: string;
  claimedAt: string;
};

// A worker without dispatchers: queued step jobs stay in the queue to be read and run by hand.
async function worker() {
  class TestModule {}
  Module({
    imports: [
      DatabaseModule,
      AutomationRunsModule,
      AutomationsModule,
      BullModule.forRoot({
        connection: toRedisConnection(loadEnv().REDIS_URL),
        prefix: `${loadEnv().QUEUE_PREFIX}-${randomUUID()}`,
      }),
      BullModule.registerQueue({ name: QUEUES.workflow }),
    ],
    providers: [
      WakeDueRunsJob,
      ContinueAutomationRunJob,
      EmailOwnerOnAutomationPaused,
      ResumeWorkflowsOnWalletCredited,
    ],
  })(TestModule);
  const application = await NestFactory.createApplicationContext(TestModule, { logger: false });
  applications.push(application);
  return {
    sweep: () => application.get(WakeDueRunsJob).handle({}),
    runStep: (data: StepJobData) => application.get(ContinueAutomationRunJob).handle(data),
    consents: application.get(ConsentService),
    emailOwner: (data: unknown) => application.get(EmailOwnerOnAutomationPaused).handle(data),
    resumeOnCredit: (data: unknown) =>
      application.get(ResumeWorkflowsOnWalletCredited).handle(data),
    wallets: application.get(WalletService),
    valkey: application.get(ValkeyClient).connection,
    queue: application.get<Queue>(getQueueToken(QUEUES.workflow)),
  };
}

async function queuedSteps(queue: Queue): Promise<StepJobData[]> {
  return (await queue.getJobs(['waiting'])).map((job) => job.data as StepJobData);
}

async function queuedStep(queue: Queue, runId: string) {
  const step = (await queuedSteps(queue)).find((data) => data.automationRunId === runId);
  expect(step).toBeDefined();
  return step!;
}

function graphWith(first: AutomationStep): AutomationGraph {
  return {
    trigger: { key: 'consent_given', filters: [] },
    reEntry: { rule: 'once' },
    workflowFilters: [],
    goal: null,
    exitConditions: [],
    firstStepKey: 'first',
    steps: { first, yes: end, no: end, end },
  };
}

async function workflow(status = 'active') {
  const automationId = randomUUID();
  await admin.pool.query(
    "insert into automations(id,store_id,name,trigger_type,draft_graph,status,pause_reason) values($1,$2,'স্বাগতম','consent_given','{}',$3,$4)",
    [automationId, storeId, status, status === 'paused' ? 'manual' : null],
  );
  return automationId;
}

async function publish(automationId: string, version: number, graph: AutomationGraph) {
  const versionId = randomUUID();
  await admin.pool.query(
    'insert into automation_versions(id,store_id,automation_id,version,graph) values($1,$2,$3,$4,$5)',
    [versionId, storeId, automationId, version, JSON.stringify(graph)],
  );
  await admin.pool.query('update automations set published_version_id=$1 where id=$2', [
    versionId,
    automationId,
  ]);
  return versionId;
}

// CAMP-11 starts runs from events; here they are due on a step now.
async function startRuns(
  automationId: string,
  versionId: string,
  { count = 1, stepKey = 'first', forContact = contactId } = {},
) {
  const result = await admin.pool.query<{ id: string }>(
    `insert into automation_runs(id,store_id,automation_id,version_id,contact_id,trigger_key,current_step_key,status,wake_at)
     select gen_random_uuid(),$1,$2,$3,$4,'event-' || n || '-' || $6,$5,'waiting',now() - interval '1 minute'
     from generate_series(1,$7::integer) n returning id`,
    [storeId, automationId, versionId, forContact, stepKey, randomUUID(), count],
  );
  return result.rows.map((row) => row.id);
}

async function dueRuns(
  first: AutomationStep,
  count = 1,
  status = 'active',
  forContact = contactId,
) {
  const automationId = await workflow(status);
  const versionId = await publish(automationId, 1, graphWith(first));
  return { automationId, runIds: await startRuns(automationId, versionId, { count, forContact }) };
}

async function run(runId: string) {
  const result = await admin.pool.query(
    'select status,current_step_key,wake_at,claimed_at,attempts from automation_runs where id=$1',
    [runId],
  );
  return result.rows[0];
}

async function steps(runId: string) {
  const result = await admin.pool.query(
    'select step_key,kind,outcome from automation_run_steps where run_id=$1 order by created_at',
    [runId],
  );
  return result.rows;
}

const wait: AutomationStep = {
  kind: 'wait',
  wait: { until: 'duration', minutes: 120 },
  next: 'end',
};

describe('Workflow runner (Postgres and Valkey)', () => {
  beforeAll(async () => {
    await admin.pool.query("insert into stores(id,name) values($1,'রিনার দোকান')", [storeId]);
    await admin.pool.query(
      "insert into contacts(id,store_id,name,phone,source,kind) values($1,$2,'সুমি আক্তার','01711000201','manual','customer')",
      [contactId, storeId],
    );
    await admin.pool.query(
      "insert into staff_users(id,email,name,role) values($1,$2,'Wallet staff','super_admin')",
      [staffUserId, `${staffUserId}@example.test`],
    );
    await admin.pool.query("insert into users(id,name,email) values($1,'রিনা',$2)", [
      ownerId,
      ownerEmail,
    ]);
    await admin.pool.query(
      "insert into memberships(id,store_id,user_id,built_in_role,status) values(gen_random_uuid(),$1,$2,'owner','active')",
      [storeId, ownerId],
    );
    await admin.pool.query(
      "insert into wallet_ledger(id,store_id,wallet,revision,kind,quantity_delta,balance_quantity_after,idempotency_key,actor_type) values(gen_random_uuid(),$1,'sms_credits',1,'top_up',1000,1000,$2,'system')",
      [storeId, `seed-${storeId}`],
    );
  });

  afterAll(async () => {
    try {
      await Promise.all(applications.map((application) => application.close()));
      await admin.pool.query('delete from automation_runs where store_id=$1', [storeId]);
      await admin.pool.query('delete from notifications where store_id=$1', [storeId]);
      await admin.pool.query('delete from outbox_events where store_id=$1', [storeId]);
      await admin.pool.query('delete from memberships where store_id=$1', [storeId]);
      await admin.pool.query('delete from users where id=any($1::uuid[])', [[ownerId, coOwnerId]]);
      await admin.pool.query('update automations set published_version_id=null where store_id=$1', [
        storeId,
      ]);
      await admin.pool.query('delete from automation_versions where store_id=$1', [storeId]);
      await admin.pool.query('delete from automations where store_id=$1', [storeId]);
      await admin.pool.query('delete from wallet_ledger where store_id=$1', [storeId]);
      await admin.pool.query('delete from tracked_links where store_id=$1', [storeId]);
      await admin.pool.query('delete from contacts where store_id=$1', [storeId]);
      await admin.pool.query('delete from stores where id=$1', [storeId]);
      await admin.pool.query('delete from staff_users where id=$1', [staffUserId]);
    } finally {
      await admin.pool.end();
    }
  });

  it('claims a due run once even with two sweepers at the same moment', async () => {
    // More than one claim batch, so both sweepers loop over the same rows.
    const { runIds } = await dueRuns(wait, 150);
    const [first, second] = [await worker(), await worker()];

    await Promise.all([first.sweep(), second.sweep()]);
    // A sweep takes at most 100 of one store's runs, so the rest come in the next sweep.
    await first.sweep();

    const queued = [
      ...(await queuedSteps(first.queue)),
      ...(await queuedSteps(second.queue)),
    ].filter((step) => runIds.includes(step.automationRunId));
    expect(queued.map((step) => step.automationRunId).sort()).toEqual([...runIds].sort());
    // Each job carries the run's one claim, and a sweep does not count attempts.
    const claims = await admin.pool.query(
      'select id,claimed_at,attempts from automation_runs where id=any($1::uuid[]) and status=$2',
      [runIds, 'running'],
    );
    expect(claims.rows).toHaveLength(150);
    for (const row of claims.rows) {
      const step = queued.find((queuedStep) => queuedStep.automationRunId === row.id)!;
      expect(new Date(step.claimedAt)).toEqual(row.claimed_at);
      expect(row.attempts).toBe(0);
    }
  });

  it('keeps a stale worker from advancing a run another sweep claimed again', async () => {
    const {
      runIds: [runId],
    } = await dueRuns(wait);
    const [first, second] = [await worker(), await worker()];
    await first.sweep();
    // The first worker stalls past its five-minute lease.
    const stale = await admin.pool.query(
      "update automation_runs set claimed_at=claimed_at - interval '6 minutes' where id=$1 returning claimed_at",
      [runId],
    );
    const staleStep = { ...(await queuedStep(first.queue, runId!)) };
    staleStep.claimedAt = stale.rows[0].claimed_at.toISOString();
    await second.sweep();
    const current = await queuedStep(second.queue, runId!);

    await first.runStep(staleStep);

    expect(await run(runId!)).toMatchObject({
      status: 'running',
      current_step_key: 'first',
      claimed_at: new Date(current.claimedAt),
      attempts: 0,
    });
    expect(await steps(runId!)).toEqual([]);

    await second.runStep(current);
    await first.runStep(staleStep);

    expect(await run(runId!)).toMatchObject({ status: 'waiting', current_step_key: 'end' });
    expect(await steps(runId!)).toEqual([
      { step_key: 'first', kind: 'wait', outcome: 'scheduled' },
    ]);
  });

  it('sets wake_at on a wait and leaves the run asleep until then', async () => {
    const {
      runIds: [runId],
    } = await dueRuns(wait);
    const runner = await worker();
    await runner.sweep();
    const before = Date.now();

    await runner.runStep(await queuedStep(runner.queue, runId!));

    const { wake_at: wakeAt } = await run(runId!);
    expect(wakeAt.getTime()).toBeGreaterThanOrEqual(before + 120 * MINUTE);
    expect(wakeAt.getTime()).toBeLessThanOrEqual(Date.now() + 120 * MINUTE);
    const again = await worker();
    await again.sweep();
    expect((await queuedSteps(again.queue)).map((step) => step.automationRunId)).not.toContain(
      runId,
    );
  });

  it('picks the same random path when the step runs again', async () => {
    const split: AutomationStep = {
      kind: 'random_split',
      paths: [
        { percent: 50, next: 'yes' },
        { percent: 50, next: 'no' },
      ],
    };
    const {
      runIds: [runId],
    } = await dueRuns(split);
    const runner = await worker();
    await runner.sweep();
    await runner.runStep(await queuedStep(runner.queue, runId!));
    const { current_step_key: path } = await run(runId!);
    expect(['yes', 'no']).toContain(path);
    // The next step went straight to the queue under the run's new claim.
    const next = (await queuedSteps(runner.queue)).find(
      (step) => step.automationRunId === runId && step.stepKey === path,
    );
    expect(new Date(next!.claimedAt)).toEqual((await run(runId!)).claimed_at);

    // As if that commit was lost and a later claim runs the split again.
    const retried = await admin.pool.query(
      "update automation_runs set current_step_key='first', status='running', claimed_at=date_trunc('milliseconds', now()) where id=$1 returning claimed_at",
      [runId],
    );
    await admin.pool.query('delete from automation_run_steps where run_id=$1', [runId]);
    await runner.runStep({
      storeId,
      automationRunId: runId!,
      stepKey: 'first',
      claimedAt: retried.rows[0].claimed_at.toISOString(),
    });

    expect((await run(runId!)).current_step_key).toBe(path);
  });

  it('claims no run of a paused workflow until it is enabled', async () => {
    const {
      automationId,
      runIds: [runId],
    } = await dueRuns(wait, 1, 'paused');
    const runner = await worker();

    await runner.sweep();
    expect((await queuedSteps(runner.queue)).map((step) => step.automationRunId)).not.toContain(
      runId,
    );

    await admin.pool.query(
      "update automations set status='active', pause_reason=null where id=$1",
      [automationId],
    );
    await runner.sweep();
    expect(await queuedStep(runner.queue, runId!)).toMatchObject({ stepKey: 'first' });
  });

  it('queues a step claimed again under one queue prefix while the first job is still queued', async () => {
    const {
      runIds: [runId],
    } = await dueRuns(wait);
    const runner = await worker();
    await runner.sweep();
    await admin.pool.query(
      "update automation_runs set claimed_at=claimed_at - interval '6 minutes' where id=$1",
      [runId],
    );

    await runner.sweep();

    const claims = (await queuedSteps(runner.queue)).filter(
      (step) => step.automationRunId === runId,
    );
    expect(claims).toHaveLength(2);
    const { claimed_at: claimedAt } = await run(runId!);
    const current = claims.find(
      (step) => new Date(step.claimedAt).getTime() === claimedAt.getTime(),
    );
    await runner.runStep(current!);
    expect(await run(runId!)).toMatchObject({ status: 'waiting', current_step_key: 'end' });
  });

  it('finishes 40 runs on a step a newer version deleted on the version they entered', async () => {
    const automationId = await workflow();
    const first = await publish(automationId, 1, {
      ...graphWith(wait),
      steps: {
        first: { kind: 'wait', wait: { until: 'duration', minutes: 120 }, next: 'goodbye' },
        goodbye: end,
        end,
      },
    });
    await publish(automationId, 2, graphWith(wait));
    const runIds = await startRuns(automationId, first, { count: 40, stepKey: 'goodbye' });
    const runner = await worker();

    await runner.sweep();
    for (const step of await queuedSteps(runner.queue))
      if (runIds.includes(step.automationRunId)) await runner.runStep(step);

    const finished = await admin.pool.query(
      `select count(*)::int as count from automation_runs r join automation_run_steps s on s.run_id=r.id
       where r.id=any($1::uuid[]) and r.status='done' and s.step_key='goodbye'`,
      [runIds],
    );
    expect(finished.rows).toEqual([{ count: 40 }]);
  });

  it('changes the delay only for runs whose wait is not scheduled yet', async () => {
    const automationId = await workflow();
    const before = await publish(automationId, 1, graphWith(wait));
    const [scheduled] = await startRuns(automationId, before);
    const runner = await worker();
    await runner.sweep();
    await runner.runStep(await queuedStep(runner.queue, scheduled!));
    const { wake_at: scheduledWake } = await run(scheduled!);

    const shorter: AutomationStep = {
      kind: 'wait',
      wait: { until: 'duration', minutes: 30 },
      next: 'end',
    };
    const after = await publish(automationId, 2, graphWith(shorter));
    const [entered] = await startRuns(automationId, after);
    const [waitingOnOld] = await startRuns(automationId, before);
    const startedAt = Date.now();
    await runner.sweep();
    await runner.runStep(await queuedStep(runner.queue, entered!));
    await runner.runStep(await queuedStep(runner.queue, waitingOnOld!));

    expect((await run(scheduled!)).wake_at).toEqual(scheduledWake);
    const newWake = (await run(entered!)).wake_at.getTime();
    expect(newWake).toBeGreaterThanOrEqual(startedAt + 30 * MINUTE);
    expect(newWake).toBeLessThan(startedAt + 31 * MINUTE);
    expect((await run(waitingOnOld!)).wake_at.getTime()).toBeGreaterThanOrEqual(
      startedAt + 120 * MINUTE,
    );
  });

  it('adds a tag with the step and reads it in the next condition', async () => {
    const automationId = await workflow();
    const versionId = await publish(automationId, 1, {
      ...graphWith(wait),
      steps: {
        first: { kind: 'action', action: { action: 'add_tag', tag: 'ঈদ-ক্রেতা' }, next: 'check' },
        check: {
          kind: 'condition',
          paths: [{ condition: { kind: 'has_tag', tag: 'ঈদ-ক্রেতা' }, next: 'yes' }],
          elseNext: 'no',
        },
        yes: end,
        no: end,
      },
    });
    const [runId] = await startRuns(automationId, versionId);
    const runner = await worker();
    await runner.sweep();

    await runner.runStep(await queuedStep(runner.queue, runId!));
    const next = (await queuedSteps(runner.queue)).find(
      (step) => step.automationRunId === runId && step.stepKey === 'check',
    );
    await runner.runStep(next!);

    const tags = await admin.pool.query('select tags from contacts where id=$1', [contactId]);
    expect(tags.rows[0].tags).toContain('ঈদ-ক্রেতা');
    expect(await steps(runId!)).toEqual([
      { step_key: 'first', kind: 'action', outcome: 'done' },
      { step_key: 'check', kind: 'condition', outcome: 'path_1' },
    ]);
    expect((await run(runId!)).current_step_key).toBe('yes');
  });

  it('does not count claims whose job never started toward the limit', async () => {
    const {
      runIds: [runId],
    } = await dueRuns(wait);
    const runner = await worker();
    for (let claim = 0; claim < 12; claim++) {
      await admin.pool.query(
        "update automation_runs set claimed_at=claimed_at - interval '6 minutes' where id=$1",
        [runId],
      );
      await runner.sweep();
    }
    const { claimed_at: claimedAt } = await run(runId!);
    const current = (await queuedSteps(runner.queue)).find(
      (step) =>
        step.automationRunId === runId &&
        new Date(step.claimedAt).getTime() === claimedAt.getTime(),
    );

    await runner.runStep(current!);

    expect(await run(runId!)).toMatchObject({
      status: 'waiting',
      current_step_key: 'end',
      attempts: 0,
    });
  });

  it('claims another store’s due run in the same sweep as a large backlog', async () => {
    const { runIds: backlog } = await dueRuns(wait, 150);
    const otherStore = randomUUID();
    const otherContact = randomUUID();
    await admin.pool.query("insert into stores(id,name) values($1,'করিমের দোকান')", [otherStore]);
    await admin.pool.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'করিম','manual','customer')",
      [otherContact, otherStore],
    );
    const automationId = randomUUID();
    const versionId = randomUUID();
    const graph = JSON.stringify(graphWith(wait));
    await admin.pool.query(
      "insert into automations(id,store_id,name,trigger_type,draft_graph,status) values($1,$2,'স্বাগতম','consent_given','{}','active')",
      [automationId, otherStore],
    );
    await admin.pool.query(
      'insert into automation_versions(id,store_id,automation_id,version,graph) values($1,$2,$3,1,$4)',
      [versionId, otherStore, automationId, graph],
    );
    const other = await admin.pool.query<{ id: string }>(
      "insert into automation_runs(id,store_id,automation_id,version_id,contact_id,trigger_key,current_step_key,status,wake_at) values(gen_random_uuid(),$1,$2,$3,$4,'k','first','waiting',now() - interval '1 minute') returning id",
      [otherStore, automationId, versionId, otherContact],
    );
    const runner = await worker();
    try {
      await runner.sweep();

      const queued = (await queuedSteps(runner.queue)).map((step) => step.automationRunId);
      expect(queued).toContain(other.rows[0]!.id);
      expect(queued.filter((runId) => backlog.includes(runId))).toHaveLength(100);
    } finally {
      await admin.pool.query('delete from automation_runs where store_id=$1', [otherStore]);
      await admin.pool.query('delete from automation_versions where store_id=$1', [otherStore]);
      await admin.pool.query('delete from automations where store_id=$1', [otherStore]);
      await admin.pool.query('delete from contacts where store_id=$1', [otherStore]);
      await admin.pool.query('delete from stores where id=$1', [otherStore]);
    }
  });

  describe('send steps', () => {
    const sms = new FakeSmsDriver();
    let phone = 300;
    const HOUR = 60 * MINUTE;
    // A time outside Dhaka quiet hours (09:00 to 21:00 is 03:00 to 15:00 UTC), now or soon after.
    const real = new Date();
    const opensAt = new Date(
      Date.UTC(real.getUTCFullYear(), real.getUTCMonth(), real.getUTCDate(), 3, 30),
    );
    const daytime =
      real.getUTCHours() >= 3 && real.getUTCHours() < 15
        ? real
        : new Date(opensAt.getTime() + (real > opensAt ? 24 * HOUR : 0));
    let clockNow = daytime;
    const send = (
      category: 'marketing' | 'transactional',
      ifNotReachable: 'skip' | 'exit' = 'skip',
    ) =>
      ({
        kind: 'send',
        category,
        channels: ['sms'],
        message: { text: 'নতুন কালেকশন এসেছে', buttons: [] },
        ifNotReachable,
        reviewBeforeSending: false,
        next: 'end',
      }) as const;

    async function customer(isConsented: boolean, runner: Awaited<ReturnType<typeof worker>>) {
      const id = randomUUID();
      await admin.pool.query(
        "insert into contacts(id,store_id,name,phone,source,kind) values($1,$2,'রহিম উদ্দিন',$3,'manual','customer')",
        [id, storeId, `0181100${String(++phone).padStart(4, '0')}`],
      );
      if (isConsented)
        await runner.consents.record(
          storeId,
          { contactId: id, channel: 'sms', status: 'granted', source: 'checkout', evidence: null },
          { kind: 'system' },
        );
      return id;
    }

    // Sweeps the run's step and runs its job, then removes the job as a finished one would be.
    async function runDueStep(runner: Awaited<ReturnType<typeof worker>>, runId: string) {
      await runner.sweep();
      const jobs = await runner.queue.getJobs(['waiting']);
      const job = jobs.find((queued) => queued.data.automationRunId === runId)!;
      await runner.runStep(job.data as StepJobData);
      await job.remove();
    }

    async function wakeNow(runId: string) {
      await admin.pool.query(
        "update automation_runs set wake_at=now() - interval '1 minute' where id=$1",
        [runId],
      );
    }

    async function sendStep(runId: string) {
      const result = await admin.pool.query(
        'select outcome,category,channel,skip_reason,provider_message_id,opt_out_code from automation_run_steps where run_id=$1 and kind=$2',
        [runId, 'send'],
      );
      return result.rows;
    }

    async function ledgerFor(runId: string) {
      const result = await admin.pool.query(
        'select kind,quantity_delta::int as delta from wallet_ledger where store_id=$1 and idempotency_key like $2 order by revision',
        [storeId, `run:${runId}:first%`],
      );
      return result.rows;
    }

    async function balance() {
      const result = await admin.pool.query(
        "select balance_quantity_after::int as balance from wallet_ledger where store_id=$1 and wallet='sms_credits' order by revision desc limit 1",
        [storeId],
      );
      return result.rows[0].balance as number;
    }

    // Sets the store's SMS credits with one adjustment, outside the services.
    async function setCredits(
      target: number,
    ): Promise<{ id: string; created_at: Date } | undefined> {
      const latest = await admin.pool.query(
        "select revision,balance_quantity_after::int as balance from wallet_ledger where store_id=$1 and wallet='sms_credits' order by revision desc limit 1",
        [storeId],
      );
      const { revision, balance } = latest.rows[0];
      if (target === balance) return undefined;
      const entry = await admin.pool.query(
        "insert into wallet_ledger(id,store_id,wallet,revision,kind,quantity_delta,balance_quantity_after,idempotency_key,actor_type) values(gen_random_uuid(),$1,'sms_credits',$2,'adjustment',$3,$4,$5,'system') returning id,created_at",
        [storeId, revision + 1, target - balance, target, `adjust-${randomUUID()}`],
      );
      return entry.rows[0];
    }

    async function mailTo(address: string): Promise<string[]> {
      const api = process.env.MAILPIT_API_URL ?? 'http://127.0.0.1:8025';
      const query = new URLSearchParams({ query: `to:"${address}"` });
      const response = await fetch(`${api}/api/v1/search?${query}`, {
        signal: AbortSignal.timeout(5000),
      });
      const found = (await response.json()) as { messages: { Subject: string }[] };
      return found.messages.map((message) => message.Subject);
    }

    // Credits the store as staff do, then hands the outbox row to the resume subscriber.
    async function creditThrough(
      runner: Awaited<ReturnType<typeof worker>>,
      wallet: 'sms_credits' | 'whatsapp_poisha',
      key: string,
      deliveries = 1,
    ) {
      const credit = await runner.wallets.credit(storeId, {
        wallet,
        quantity: 100,
        idempotencyKey: `top-up-${wallet}-${key}`,
        staffUserId,
        staffAuditId: randomUUID(),
      });
      const events = await admin.pool.query(
        "select id,payload,occurred_at from outbox_events where store_id=$1 and type='wallet.credited' and payload->>'entryId'=$2",
        [storeId, credit.entryId],
      );
      expect(events.rows).toHaveLength(1);
      const [event] = events.rows;
      for (let delivery = 0; delivery < deliveries; delivery++)
        await runner.resumeOnCredit({
          id: event.id,
          type: 'wallet.credited',
          storeId,
          occurredAt: event.occurred_at.toISOString(),
          payload: event.payload,
        });
    }

    function sentFor(runId: string) {
      return sms.messages.filter((message) => message.idempotencyKey?.startsWith(`run:${runId}:`));
    }

    beforeAll(() => {
      vi.spyOn(MailpitSmsDriver.prototype, 'send').mockImplementation((message) =>
        sms.send(message),
      );
      vi.spyOn(Clock.prototype, 'now').mockImplementation(() => clockNow);
    });

    afterEach(() => {
      clockNow = daytime;
      vi.mocked(MailpitSmsDriver.prototype.send).mockImplementation((message) => sms.send(message));
    });

    afterAll(() => {
      vi.restoreAllMocks();
    });

    it('sends through the gate with the opt-out link and the step key, and a retry sends once', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        runIds: [runId],
      } = await dueRuns(send('marketing'), 1, 'active', contact);
      // The provider takes the message but the answer is lost.
      vi.mocked(MailpitSmsDriver.prototype.send).mockImplementationOnce(async (message) => {
        await sms.send(message);
        throw new Error('socket hang up');
      });

      await runDueStep(runner, runId!);
      expect(await run(runId!)).toMatchObject({ status: 'waiting', current_step_key: 'first' });
      const [started] = await sendStep(runId!);
      expect(started).toMatchObject({ outcome: 'sending', opt_out_code: expect.any(String) });

      await wakeNow(runId!);
      await runDueStep(runner, runId!);

      const sent = sentFor(runId!);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        idempotencyKey: `run:${runId}:first`,
        text: `নতুন কালেকশন এসেছে\n${loadEnv().SHORT_LINK_BASE_URL}/s/${started.opt_out_code}`,
      });
      const link = await admin.pool.query(
        'select kind,source_type,contact_id from tracked_links where code=$1',
        [started.opt_out_code],
      );
      expect(link.rows).toEqual([
        { kind: 'sms_opt_out', source_type: 'automation', contact_id: contact },
      ]);
      expect(await sendStep(runId!)).toEqual([
        expect.objectContaining({ outcome: 'sent', category: 'marketing', channel: 'sms' }),
      ]);
      expect((await run(runId!)).current_step_key).toBe('end');
    });

    it('sends once after a crash between the claim and its job', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        runIds: [runId],
      } = await dueRuns(send('transactional'), 1, 'active', contact);
      vi.spyOn(runner.queue, 'addBulk').mockRejectedValueOnce(new Error('connection lost'));
      await expect(runner.sweep()).rejects.toThrow('connection lost');
      expect(await run(runId!)).toMatchObject({ status: 'running', attempts: 0 });

      await admin.pool.query(
        "update automation_runs set claimed_at=claimed_at - interval '6 minutes' where id=$1",
        [runId],
      );
      await runDueStep(runner, runId!);
      await runner.sweep();

      expect(sentFor(runId!)).toHaveLength(1);
      expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sent' })]);
    });

    it('skips or exits for a contact the gate refuses, as the step says', async () => {
      const runner = await worker();
      const contact = await customer(false, runner);
      const {
        runIds: [skipped],
      } = await dueRuns(send('marketing', 'skip'), 1, 'active', contact);
      const {
        runIds: [exited],
      } = await dueRuns(send('marketing', 'exit'), 1, 'active', contact);

      await runDueStep(runner, skipped!);
      await runner.runStep(await queuedStep(runner.queue, exited!));

      expect(await run(skipped!)).toMatchObject({ status: 'running', current_step_key: 'end' });
      expect(await run(exited!)).toMatchObject({ status: 'exited', current_step_key: 'first' });
      for (const runId of [skipped!, exited!])
        expect(await sendStep(runId)).toEqual([
          expect.objectContaining({ outcome: 'skipped', skip_reason: 'no_consent' }),
        ]);
      expect([...sentFor(skipped!), ...sentFor(exited!)]).toEqual([]);
      // The gate refused before anything was reserved.
      expect([...(await ledgerFor(skipped!)), ...(await ledgerFor(exited!))]).toEqual([]);
    });

    it('skips the send for a contact who withdrew consent during the wait', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const automationId = await workflow();
      const versionId = await publish(automationId, 1, {
        ...graphWith(wait),
        steps: { first: { ...wait, next: 'offer' }, offer: send('marketing'), end },
      });
      const [runId] = await startRuns(automationId, versionId, { forContact: contact });
      await runDueStep(runner, runId!);
      await runner.consents.record(
        storeId,
        {
          contactId: contact,
          channel: 'sms',
          status: 'withdrawn',
          source: 'opt_out_link',
          evidence: null,
        },
        { kind: 'system' },
      );

      await wakeNow(runId!);
      await runDueStep(runner, runId!);

      expect(sentFor(runId!)).toEqual([]);
      expect(await sendStep(runId!)).toEqual([
        expect.objectContaining({ outcome: 'skipped', skip_reason: 'no_consent' }),
      ]);
    });

    it('skips a send more than 24 hours late after a pause and resume', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        automationId,
        runIds: [runId],
      } = await dueRuns(send('marketing'), 1, 'paused', contact);
      await runner.sweep();
      expect((await queuedSteps(runner.queue)).map((step) => step.automationRunId)).not.toContain(
        runId,
      );

      clockNow = new Date(daytime.getTime() + 25 * HOUR);
      await admin.pool.query(
        "update automations set status='active', pause_reason=null where id=$1",
        [automationId],
      );
      await runDueStep(runner, runId!);

      expect(sentFor(runId!)).toEqual([]);
      expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'late' })]);
      expect((await run(runId!)).current_step_key).toBe('end');
    });

    it('retries a temporary provider error, then fails the run after 36 hours', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        runIds: [runId],
      } = await dueRuns(send('transactional'), 1, 'active', contact);
      vi.mocked(MailpitSmsDriver.prototype.send).mockRejectedValue(new Error('connection refused'));

      await runDueStep(runner, runId!);
      const retrying = await admin.pool.query(
        'select status,wake_at,last_error from automation_runs where id=$1',
        [runId],
      );
      expect(retrying.rows[0]).toMatchObject({
        status: 'waiting',
        wake_at: new Date(daytime.getTime() + MINUTE),
        last_error: 'The SMS provider did not answer; trying again',
      });

      clockNow = new Date(daytime.getTime() + 36 * HOUR);
      await wakeNow(runId!);
      await runDueStep(runner, runId!);

      const failed = await admin.pool.query(
        'select status,last_error,finished_at from automation_runs where id=$1',
        [runId],
      );
      expect(failed.rows[0]).toEqual({
        status: 'failed',
        last_error: expect.stringContaining('The SMS provider did not answer for 36 hours.'),
        finished_at: clockNow,
      });
      expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'unconfirmed' })]);
      // The provider may have taken it, so the credits stay reserved for reconciliation.
      expect(await ledgerFor(runId!)).toEqual([{ kind: 'reserve', delta: -1 }]);
    });

    it('counts only marketing send steps toward the frequency cap', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const runs = [];
      for (const category of ['transactional', 'marketing', 'marketing'] as const) {
        const {
          runIds: [runId],
        } = await dueRuns(send(category), 1, 'active', contact);
        await runDueStep(runner, runId!);
        runs.push(runId!);
      }

      expect(await Promise.all(runs.map(sendStep))).toEqual([
        [expect.objectContaining({ outcome: 'sent', category: 'transactional' })],
        [expect.objectContaining({ outcome: 'sent', category: 'marketing' })],
        [expect.objectContaining({ outcome: 'skipped', skip_reason: 'frequency_cap' })],
      ]);
    });

    it('keeps the credits reserved when a stopped version ends a run whose send is unconfirmed', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        runIds: [runId],
      } = await dueRuns(send('transactional'), 1, 'active', contact);
      const before = await balance();
      vi.mocked(MailpitSmsDriver.prototype.send).mockRejectedValueOnce(new Error('socket hang up'));
      await runDueStep(runner, runId!);
      await admin.pool.query(
        'update automation_versions set is_stopped=true where id=(select version_id from automation_runs where id=$1)',
        [runId],
      );

      await wakeNow(runId!);
      await runDueStep(runner, runId!);

      expect(await run(runId!)).toMatchObject({ status: 'exited' });
      expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'unconfirmed' })]);
      expect(await ledgerFor(runId!)).toEqual([{ kind: 'reserve', delta: -1 }]);
      expect(await balance()).toBe(before - 1);
    });

    it('keeps the credits reserved when the resend check refuses', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        runIds: [runId],
      } = await dueRuns(send('marketing'), 1, 'active', contact);
      const before = await balance();
      vi.mocked(MailpitSmsDriver.prototype.send).mockRejectedValueOnce(new Error('socket hang up'));
      await runDueStep(runner, runId!);
      await runner.consents.record(
        storeId,
        {
          contactId: contact,
          channel: 'sms',
          status: 'withdrawn',
          source: 'opt_out_link',
          evidence: null,
        },
        { kind: 'system' },
      );

      await wakeNow(runId!);
      await runDueStep(runner, runId!);

      expect(await sendStep(runId!)).toEqual([
        expect.objectContaining({ outcome: 'unconfirmed', skip_reason: 'no_consent' }),
      ]);
      expect(await ledgerFor(runId!)).toEqual([{ kind: 'reserve', delta: -1 }]);
      expect(await balance()).toBe(before - 1);
    });

    // Last: it drains the store's credits.
    it('charges the credits a sent SMS reserved, and holds a send the balance cannot cover', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        runIds: [paid],
      } = await dueRuns(send('transactional'), 1, 'active', contact);
      await runDueStep(runner, paid!);
      const entries = await admin.pool.query(
        'select kind,quantity_delta::int as delta from wallet_ledger where store_id=$1 and idempotency_key like $2 order by revision',
        [storeId, `run:${paid}:first%`],
      );
      expect(entries.rows).toEqual([
        { kind: 'reserve', delta: -1 },
        { kind: 'release', delta: 1 },
        { kind: 'charge', delta: -1 },
      ]);

      await setCredits(0);
      const {
        runIds: [unpaid],
      } = await dueRuns(send('transactional'), 1, 'active', contact);
      await runDueStep(runner, unpaid!);

      expect(sentFor(unpaid!)).toEqual([]);
      expect(await sendStep(unpaid!)).toEqual([]);
      expect(await run(unpaid!)).toMatchObject({ status: 'waiting', current_step_key: 'first' });
    });

    // After the drain above: the store has no SMS credits.
    it('pauses the workflow once on a short balance, tells the owner and resumes after a top-up', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        automationId,
        runIds: [recent, old],
      } = await dueRuns(send('transactional'), 2, 'active', contact);
      // Both runs reach the gate at the same moment.
      await runner.sweep();
      await Promise.all([
        runner.runStep(await queuedStep(runner.queue, recent!)),
        runner.runStep(await queuedStep(runner.queue, old!)),
      ]);
      for (const job of await runner.queue.getJobs(['waiting'])) await job.remove();

      for (const runId of [recent!, old!])
        expect(await run(runId)).toMatchObject({
          status: 'waiting',
          current_step_key: 'first',
          attempts: 0,
        });
      const paused = await admin.pool.query(
        'select status,pause_reason from automations where id=$1',
        [automationId],
      );
      expect(paused.rows).toEqual([{ status: 'paused', pause_reason: 'balance' }]);
      const cards = await admin.pool.query(
        "select user_id,action_url from notifications where store_id=$1 and type='automation.paused_for_balance' and dedupe_key like $2",
        [storeId, `automation-balance:${automationId}:%`],
      );
      expect(cards.rows).toEqual([{ user_id: ownerId, action_url: '/settings' }]);
      const events = await admin.pool.query(
        "select id,type,payload,occurred_at from outbox_events where store_id=$1 and type='automation.paused' and payload->>'automationId'=$2",
        [storeId, automationId],
      );
      expect(events.rows).toHaveLength(1);
      const [event] = events.rows;
      const pausedEvent = {
        id: event.id,
        type: event.type,
        storeId,
        occurredAt: event.occurred_at.toISOString(),
        payload: event.payload,
      };
      // A failed send frees its claim for the retry; once it went out, a retry sends nothing more.
      vi.spyOn(EmailService.prototype, 'send').mockRejectedValueOnce(new Error('smtp down'));
      await expect(runner.emailOwner(pausedEvent)).rejects.toThrow('smtp down');
      expect(await mailTo(ownerEmail)).toEqual([]);
      await runner.emailOwner(pausedEvent);
      await runner.emailOwner(pausedEvent);
      expect(await mailTo(ownerEmail)).toEqual([expect.stringContaining('SMS credits ran out')]);
      // A worker that dies mid-send leaves a short claim: a retry that meets it fails, and one
      // after it lapses sends the email.
      const crashed = { ...pausedEvent, id: randomUUID() };
      const claimKey = `automation-pause-email:${crashed.id}:${ownerId}`;
      vi.spyOn(EmailService.prototype, 'send').mockReturnValueOnce(new Promise(() => {}));
      void runner.emailOwner(crashed);
      await vi.waitFor(async () => expect(await runner.valkey.get(claimKey)).toBe('sending'));
      expect(await runner.valkey.ttl(claimKey)).toBeLessThanOrEqual(20);
      await expect(runner.emailOwner(crashed)).rejects.toMatchObject({
        code: 'AUTOMATION_PAUSE_EMAIL_SENDING',
      });
      await runner.valkey.del(claimKey); // the claim lapses
      await runner.emailOwner(crashed);
      expect(await mailTo(ownerEmail)).toHaveLength(2);
      expect(await runner.valkey.ttl(claimKey)).toBeGreaterThan(6 * 24 * 60 * 60);
      // An owner whose email is still in flight does not hold back another owner's email.
      const coOwnerEmail = `owner-${coOwnerId}@example.test`;
      await admin.pool.query("insert into users(id,name,email) values($1,'ফাহিম',$2)", [
        coOwnerId,
        coOwnerEmail,
      ]);
      // A store has one owner today; the email goes to everyone who may edit billing.
      vi.spyOn(TeamService.prototype, 'userIdsWithPermission').mockResolvedValueOnce([
        ownerId,
        coOwnerId,
      ]);
      const inFlight = { ...pausedEvent, id: randomUUID() };
      await runner.valkey.set(
        `automation-pause-email:${inFlight.id}:${ownerId}`,
        'sending',
        'EX',
        20,
      );
      await expect(runner.emailOwner(inFlight)).rejects.toMatchObject({
        code: 'AUTOMATION_PAUSE_EMAIL_SENDING',
      });
      expect(await mailTo(coOwnerEmail)).toEqual([expect.stringContaining('SMS credits ran out')]);
      expect(await mailTo(ownerEmail)).toHaveLength(2);
      // A paused workflow's runs are not swept.
      await runner.sweep();
      expect((await run(old!)).status).toBe('waiting');

      // A WhatsApp top-up resumes nothing; an SMS top-up resumes it, and a repeated event changes
      // nothing more.
      await creditThrough(runner, 'whatsapp_poisha', automationId);
      const stillPaused = await admin.pool.query('select status from automations where id=$1', [
        automationId,
      ]);
      expect(stillPaused.rows).toEqual([{ status: 'paused' }]);
      await creditThrough(runner, 'sms_credits', automationId, 2);
      const resumed = await admin.pool.query(
        'select status,pause_reason from automations where id=$1',
        [automationId],
      );
      expect(resumed.rows).toEqual([{ status: 'active', pause_reason: null }]);

      // One message waited past a day, the other did not.
      await admin.pool.query('update automation_runs set wake_at=$2 where id=$1', [
        old,
        new Date(daytime.getTime() - 25 * HOUR),
      ]);
      await wakeNow(recent!);
      await runDueStep(runner, recent!);
      await runDueStep(runner, old!);

      expect(sentFor(recent!)).toHaveLength(1);
      expect(sentFor(old!)).toEqual([]);
      expect(await sendStep(old!)).toEqual([
        expect.objectContaining({ outcome: 'skipped', skip_reason: 'no_credits' }),
      ]);
      expect((await run(old!)).current_step_key).toBe('end');
    });

    it('resumes after a top-up when the host that credits runs an hour behind the worker', async () => {
      await setCredits(0);
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        automationId,
        runIds: [runId],
      } = await dueRuns(send('transactional'), 1, 'active', contact);
      clockNow = new Date(daytime.getTime() + HOUR);
      await runDueStep(runner, runId!);
      const status = () =>
        admin.pool.query('select status,pause_reason from automations where id=$1', [automationId]);
      expect((await status()).rows).toEqual([{ status: 'paused', pause_reason: 'balance' }]);

      clockNow = new Date(daytime.getTime() - HOUR);
      await creditThrough(runner, 'sms_credits', `behind-${automationId}`);

      expect((await status()).rows).toEqual([{ status: 'active', pause_reason: null }]);
    });

    it('keeps a pause whose gate already saw a credit that committed while it waited for the lock', async () => {
      await setCredits(0);
      const runner = await worker();
      const contact = await customer(true, runner);
      const twoParts = {
        ...send('transactional'),
        message: { text: 'ক'.repeat(100), buttons: [] },
      };
      const {
        automationId,
        runIds: [runId],
      } = await dueRuns(twoParts, 1, 'active', contact);
      // One credit, too few for two parts, commits after the gate's transaction began.
      let credit: { id: string; created_at: Date } | undefined;
      // The gate checks the send policy inside its transaction, before reserve takes the lock.
      const check = SendPolicyService.prototype.check;
      vi.spyOn(SendPolicyService.prototype, 'check').mockImplementationOnce(async function (
        this: SendPolicyService,
        ...args
      ) {
        credit = await setCredits(1);
        return check.apply(this, args);
      });
      await runDueStep(runner, runId!);
      const status = () =>
        admin.pool.query('select status,pause_reason from automations where id=$1', [automationId]);
      expect((await status()).rows).toEqual([{ status: 'paused', pause_reason: 'balance' }]);

      await runner.resumeOnCredit({
        id: randomUUID(),
        type: 'wallet.credited',
        storeId,
        occurredAt: credit!.created_at.toISOString(),
        payload: { wallet: 'sms_credits', entryId: credit!.id },
      });

      expect((await status()).rows).toEqual([{ status: 'paused', pause_reason: 'balance' }]);
    });
  });
});
