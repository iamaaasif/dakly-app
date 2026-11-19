import 'reflect-metadata';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Job, Queue } from 'bullmq';
import { afterAll, aroundEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';
import { countSmsParts } from '@dakly/contracts/sms';
import { createDatabase } from '@dakly/db/client';
import { FakeSmsDriver } from '@dakly/providers/sms/fake-sms-driver';
import { MailpitSmsDriver } from '@dakly/providers/sms/mailpit/mailpit-sms-driver';
import { SmsSendRefused } from '@dakly/providers/sms/sms-driver';

import { ConsentService } from '../consents/consent.service';
import { ContactsService } from '../contacts/contacts.service';
import { MessagingService } from '../messaging/messaging.service';
import { Clock } from '../platform/clock';
import { loadEnv, resetEnvForTests } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { runWithJobContext } from '../platform/logging/job-context';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { SendPolicyService } from '../sending/send-policy.service';
import { SmsSendersService } from '../sms-senders/sms-senders.service';
import { WalletService } from '../wallets/wallet.service';
import { AutomationEntryRepository } from './automation-entry.repository';
import { AutomationEntryService } from './automation-entry.service';
import { AutomationRunsModule } from './automation-runs.module';
import { AutomationRunsRepository } from './automation-runs.repository';
import { AutomationsModule } from './automations.module';
import { AutomationsRepository } from './automations.repository';
import { ContinueAutomationRunJob } from './jobs/continue-automation-run.job';
import { ResumeWorkflowsOnWalletCredited } from './jobs/resume-workflows-on-wallet-credited.job';
import { WakeDueRunsJob } from './jobs/wake-due-runs.job';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const contactId = randomUUID();
const ownerId = randomUUID();
const staffUserId = randomUUID();
const ownerEmail = `owner-${ownerId}@example.test`;
const MINUTE = 60 * 1000;
const end: AutomationStep = { kind: 'exit' };
type RunnerFixture = {
  signal: AbortSignal;
  applications: Promise<INestApplicationContext>[];
  pending: Set<Promise<unknown>>;
  cleanups: (() => Promise<void>)[];
  closing: boolean;
};
const fixtures = new AsyncLocalStorage<RunnerFixture>();

type StepJobData = {
  storeId: string;
  automationRunId: string;
  stepKey: string;
  claimedAt: string;
};

// A worker without dispatchers: queued step jobs stay in the queue to be read and run by hand.
async function worker() {
  const fixture = fixtures.getStore()!;
  checkFixture(fixture);
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
    providers: [WakeDueRunsJob, ContinueAutomationRunJob, ResumeWorkflowsOnWalletCredited],
  })(TestModule);
  const started = NestFactory.createApplicationContext(TestModule, { logger: false });
  fixture.applications.push(started);
  const application = await started;
  checkFixture(fixture);

  // Vitest can begin teardown while a timed-out test callback still has work in flight.
  async function run<T>(work: () => Promise<T>): Promise<T> {
    checkFixture(fixture);
    const pending = work();
    fixture.pending.add(pending);
    try {
      const result = await pending;
      checkFixture(fixture);
      return result;
    } finally {
      fixture.pending.delete(pending);
    }
  }

  const entries = application.get(AutomationEntryService);
  const consents = application.get(ConsentService);
  const wallets = application.get(WalletService);
  const queue = application.get<Queue>(getQueueToken(QUEUES.workflow));
  return {
    sweep: () => run(() => application.get(WakeDueRunsJob).handle({})),
    runStep: (data: StepJobData) =>
      run(() => runWithJobContext(() => application.get(ContinueAutomationRunJob).handle(data))),
    entries: {
      start: (...args: Parameters<typeof entries.start>) => run(() => entries.start(...args)),
    },
    consents: {
      record: (...args: Parameters<typeof consents.record>) => run(() => consents.record(...args)),
    },
    resumeOnCredit: (data: unknown) =>
      run(() => application.get(ResumeWorkflowsOnWalletCredited).handle(data)),
    wallets: {
      credit: (...args: Parameters<typeof wallets.credit>) => run(() => wallets.credit(...args)),
    },
    queue,
    waitingJobs: () => run(() => queue.getJobs(['waiting'])),
  };
}

function checkFixture({ signal, closing }: RunnerFixture) {
  signal.throwIfAborted();
  if (closing) throw new Error('Runner test fixture is closing');
}

async function drainFixture(fixture: RunnerFixture) {
  fixture.closing = true;
  await Promise.allSettled(fixture.pending);
}

function throwFirstRejection(results: PromiseSettledResult<unknown>[]) {
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
}

function removeJobsBeforeClose(...jobs: Job[]) {
  const fixture = fixtures.getStore()!;
  checkFixture(fixture);
  for (const job of jobs) expect(job).toBeDefined();
  let removal: Promise<void> | undefined;
  const remove = () =>
    (removal ??= Promise.allSettled(jobs.map(async (job) => job.remove())).then(
      throwFirstRejection,
    ));
  fixture.cleanups.push(remove);
  return remove;
}

type Worker = Awaited<ReturnType<typeof worker>>;

async function queuedSteps(worker: Worker): Promise<StepJobData[]> {
  return (await worker.waitingJobs()).map((job) => job.data as StepJobData);
}

async function queuedStep(worker: Worker, runId: string) {
  const step = (await queuedSteps(worker)).find((data) => data.automationRunId === runId);
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
    'select status,exit_reason,current_step_key,wake_at,claimed_at,attempts from automation_runs where id=$1',
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

async function waitForBlocker(backendPid: number, count = 1) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const waiting = await admin.pool.query(
      'select 1 from pg_stat_activity where $1 = any(pg_blocking_pids(pid))',
      [backendPid],
    );
    if ((waiting.rowCount ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The workflow did not wait for the held database lock');
}

describe('Workflow runner (Postgres and Valkey)', () => {
  beforeAll(async () => {
    vi.stubEnv('CODE_HASH_KEY', Buffer.alloc(32, 5).toString('base64'));
    resetEnvForTests();
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

  aroundEach(async (runTest, { signal }) => {
    const fixture: RunnerFixture = {
      signal,
      applications: [],
      pending: new Set(),
      cleanups: [],
      closing: false,
    };
    try {
      await fixtures.run(fixture, runTest);
    } finally {
      await drainFixture(fixture);
      const cleaned = await Promise.allSettled(fixture.cleanups.map(async (cleanup) => cleanup()));
      const closed = await Promise.allSettled(
        fixture.applications.map(async (started) => (await started).close()),
      );
      throwFirstRejection([...cleaned, ...closed]);
    }
  });

  afterAll(async () => {
    try {
      await admin.pool.query('delete from automation_runs where store_id=$1', [storeId]);
      await admin.pool.query('delete from notifications where store_id=$1', [storeId]);
      await admin.pool.query('delete from outbox_events where store_id=$1', [storeId]);
      await admin.pool.query('delete from memberships where store_id=$1', [storeId]);
      await admin.pool.query('delete from users where id=$1', [ownerId]);
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
      vi.unstubAllEnvs();
      resetEnvForTests();
      await admin.pool.end();
    }
  });

  it('claims a due run once even with two sweepers at the same moment', async () => {
    // More than one claim batch, so both sweepers loop over the same rows.
    const { runIds } = await dueRuns(wait, 150);
    const [first, second] = await Promise.all([worker(), worker()]);

    throwFirstRejection(await Promise.allSettled([first.sweep(), second.sweep()]));
    // A sweep takes at most 100 of one store's runs, so the rest come in the next sweep.
    await first.sweep();

    const queued = [...(await queuedSteps(first)), ...(await queuedSteps(second))].filter((step) =>
      runIds.includes(step.automationRunId),
    );
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
    const staleStep = { ...(await queuedStep(first, runId!)) };
    staleStep.claimedAt = stale.rows[0].claimed_at.toISOString();
    await second.sweep();
    const current = await queuedStep(second, runId!);

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

    await runner.runStep(await queuedStep(runner, runId!));

    const { wake_at: wakeAt } = await run(runId!);
    expect(wakeAt.getTime()).toBeGreaterThanOrEqual(before + 120 * MINUTE);
    expect(wakeAt.getTime()).toBeLessThanOrEqual(Date.now() + 120 * MINUTE);
    const again = await worker();
    await again.sweep();
    expect((await queuedSteps(again)).map((step) => step.automationRunId)).not.toContain(runId);
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
    await runner.runStep(await queuedStep(runner, runId!));
    const { current_step_key: path } = await run(runId!);
    expect(['yes', 'no']).toContain(path);
    // The next step went straight to the queue under the run's new claim.
    const next = (await queuedSteps(runner)).find(
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
    expect((await queuedSteps(runner)).map((step) => step.automationRunId)).not.toContain(runId);

    await admin.pool.query(
      "update automations set status='active', pause_reason=null where id=$1",
      [automationId],
    );
    await runner.sweep();
    expect(await queuedStep(runner, runId!)).toMatchObject({ stepKey: 'first' });
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

    const claims = (await queuedSteps(runner)).filter((step) => step.automationRunId === runId);
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
    for (const step of await queuedSteps(runner))
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
    await runner.runStep(await queuedStep(runner, scheduled!));
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
    await runner.runStep(await queuedStep(runner, entered!));
    await runner.runStep(await queuedStep(runner, waitingOnOld!));

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

    await runner.runStep(await queuedStep(runner, runId!));
    const next = (await queuedSteps(runner)).find(
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
    const current = (await queuedSteps(runner)).find(
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

      const queued = (await queuedSteps(runner)).map((step) => step.automationRunId);
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
    let databaseNow: Date | undefined;
    const schedulerTime = AutomationRunsRepository.prototype.schedulerTime;
    const fixtureSchedulerTime = async () => databaseNow ?? clockNow;
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
      const jobs = await runner.waitingJobs();
      const job = jobs.find((queued) => queued.data.automationRunId === runId)!;
      const removeJob = removeJobsBeforeClose(job);
      await runner.runStep(job.data as StepJobData);
      await removeJob();
    }

    async function wakeNow(runId: string) {
      await admin.pool.query(
        "update automation_runs set wake_at=now() - interval '1 minute' where id=$1",
        [runId],
      );
    }

    async function sendStep(runId: string) {
      const result = await admin.pool.query(
        'select outcome,category,channel,skip_reason,provider_message_id,opt_out_url from automation_run_steps where run_id=$1 and kind=$2',
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
      createdAt?: Date,
    ): Promise<{ id: string; created_at: Date; revision: number } | undefined> {
      const latest = await admin.pool.query(
        "select revision,balance_quantity_after::int as balance from wallet_ledger where store_id=$1 and wallet='sms_credits' order by revision desc limit 1",
        [storeId],
      );
      const { revision, balance } = latest.rows[0];
      if (target === balance) return undefined;
      const entry = await admin.pool.query(
        "insert into wallet_ledger(id,store_id,wallet,revision,kind,quantity_delta,balance_quantity_after,idempotency_key,actor_type,created_at) values(gen_random_uuid(),$1,'sms_credits',$2,'adjustment',$3,$4,$5,'system',coalesce($6::timestamptz,now())) returning id,created_at,revision",
        [storeId, revision + 1, target - balance, target, `adjust-${randomUUID()}`, createdAt],
      );
      return entry.rows[0];
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
      vi.spyOn(AutomationRunsRepository.prototype, 'schedulerTime').mockImplementation(
        fixtureSchedulerTime,
      );
      vi.spyOn(AutomationsRepository.prototype, 'schedulerTime').mockImplementation(
        fixtureSchedulerTime,
      );
    });

    beforeEach(() => {
      clockNow = daytime;
      databaseNow = undefined;
      vi.mocked(MailpitSmsDriver.prototype.send)
        .mockReset()
        .mockImplementation((message) => sms.send(message));
    });

    afterAll(() => {
      vi.restoreAllMocks();
    });

    it('does not deadlock a first send with an entry for the same workflow and contact', async ({
      signal,
    }) => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        automationId,
        runIds: [runId],
      } = await dueRuns(send('transactional'), 1, 'active', contact);
      const entryHasContact = Promise.withResolvers<void>();
      const allowEntry = Promise.withResolvers<void>();
      const sendNeedsContact = Promise.withResolvers<void>();
      signal.throwIfAborted();
      const releaseEntry = () => allowEntry.resolve();
      signal.addEventListener('abort', releaseEntry, { once: true });
      const lockVersion = AutomationEntryRepository.prototype.lockPublishedVersion;
      const entryLock = vi
        .spyOn(AutomationEntryRepository.prototype, 'lockPublishedVersion')
        .mockImplementationOnce(async function (shop, workflowId) {
          entryHasContact.resolve();
          await allowEntry.promise;
          return lockVersion.call(this, shop, workflowId);
        });
      const eventId = randomUUID();
      const entry = runner.entries.start(storeId, automationId, {
        id: eventId,
        type: 'consent.changed',
        occurredAt: new Date().toISOString(),
        payload: {
          consentId: eventId,
          contactId: contact,
          channel: 'sms',
          status: 'granted',
          source: 'manual',
        },
      });
      try {
        await Promise.race([
          entryHasContact.promise,
          entry.then(() => {
            throw new Error('Entry did not acquire the contact lock');
          }),
        ]);
        const lockContact = ContactsService.prototype.lockForConsent;
        const sendLock = vi
          .spyOn(ContactsService.prototype, 'lockForConsent')
          .mockImplementationOnce(function (shop, contacts) {
            sendNeedsContact.resolve();
            return lockContact.call(this, shop, contacts);
          });
        const dispatched = runDueStep(runner, runId!);
        try {
          await Promise.race([
            sendNeedsContact.promise,
            dispatched.then(() => {
              throw new Error('Send did not acquire the contact lock');
            }),
          ]);
          releaseEntry();
          await Promise.all([entry, dispatched]);
        } finally {
          releaseEntry();
          await Promise.allSettled([entry, dispatched]);
          sendLock.mockRestore();
        }
      } finally {
        signal.removeEventListener('abort', releaseEntry);
        releaseEntry();
        await Promise.allSettled([entry]);
        entryLock.mockRestore();
      }

      const runs = await admin.pool.query('select id from automation_runs where automation_id=$1', [
        automationId,
      ]);
      expect(runs.rows).toEqual([{ id: runId }]);
      expect(sentFor(runId!)).toHaveLength(1);
    });

    it('reads committed resume time under the workflow lock before ending an old send', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        automationId,
        runIds: [runId],
      } = await dueRuns(send('marketing'), 1, 'active', contact);
      const wakeAt = new Date(daytime.getTime() - 25 * HOUR);
      const resumedAt = new Date(wakeAt.getTime() + 23 * HOUR);
      await admin.pool.query('update automation_runs set wake_at=$1 where id=$2', [wakeAt, runId]);
      await runner.sweep();
      const jobs = await runner.waitingJobs();
      const first = jobs.find((job) => job.data.automationRunId === runId)!;
      const removeJob = removeJobsBeforeClose(first);
      const blocker = await admin.pool.connect();
      let dispatched: Promise<unknown> | undefined;
      try {
        const {
          rows: [{ pid }],
        } = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
        await blocker.query('begin');
        // A pre-cutoff resume is visible only after the writer commits the workflow change.
        await blocker.query(
          'update automations set balance_resumed_at=$1, has_balance_resume_send_allowance=true where id=$2',
          [resumedAt, automationId],
        );
        dispatched = runner.runStep(first.data as StepJobData).catch((error: unknown) => error);
        await waitForBlocker(pid);
        await blocker.query('commit');
        expect(await dispatched).toBeUndefined();
      } finally {
        blocker.release(true);
        await dispatched;
      }
      await removeJob();

      expect(await run(runId!)).toMatchObject({ status: 'waiting', wake_at: wakeAt });
      expect(await ledgerFor(runId!)).toEqual([]);
      expect(sentFor(runId!)).toEqual([]);

      await runDueStep(runner, runId!);
      expect(sentFor(runId!)).toHaveLength(1);
      expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sent' })]);
    });

    it('sends through the gate with the opt-out link and the step key, and a retry sends once', async () => {
      const firstLinkBase = loadEnv().SHORT_LINK_BASE_URL;
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        runIds: [runId],
      } = await dueRuns(send('marketing'), 1, 'active', contact);
      const retryFields = async () =>
        (
          await admin.pool.query(
            "select destination_hash,opt_out_url,first_tried_at from automation_run_steps where run_id=$1 and kind='send'",
            [runId],
          )
        ).rows;
      let inFlight: Awaited<ReturnType<typeof retryFields>> = [];
      // The provider takes the message but the answer is lost.
      vi.mocked(MailpitSmsDriver.prototype.send).mockImplementationOnce(async (message) => {
        inFlight = await retryFields();
        await sms.send(message);
        throw new Error('socket hang up');
      });

      await runDueStep(runner, runId!);
      expect(await run(runId!)).toMatchObject({ status: 'waiting', current_step_key: 'first' });
      const [started] = await sendStep(runId!);
      expect(started).toMatchObject({ outcome: 'sending', opt_out_url: expect.any(String) });

      expect(inFlight).toEqual([
        {
          destination_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
          opt_out_url: started.opt_out_url,
          first_tried_at: daytime,
        },
      ]);
      const code = new URL(started.opt_out_url).pathname.split('/').at(-1);

      vi.stubEnv('SHORT_LINK_BASE_URL', 'https://a-longer-sms-short-link-base.example.test/l');
      resetEnvForTests();
      try {
        await wakeNow(runId!);
        await runDueStep(runner, runId!);
        const retry = vi.mocked(MailpitSmsDriver.prototype.send).mock.lastCall?.[0];
        expect(retry).toMatchObject({
          idempotencyKey: `run:${runId}:first`,
          text: `নতুন কালেকশন এসেছে\n${started.opt_out_url}`,
        });
      } finally {
        vi.stubEnv('SHORT_LINK_BASE_URL', firstLinkBase);
        resetEnvForTests();
      }

      const sent = sentFor(runId!);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        idempotencyKey: `run:${runId}:first`,
        text: `নতুন কালেকশন এসেছে\n${started.opt_out_url}`,
      });
      const link = await admin.pool.query(
        "select kind,code from tracked_links where store_id=$1 and source_type='automation' and contact_id=$2",
        [storeId, contact],
      );
      expect(link.rows).toEqual([{ kind: 'sms_opt_out', code }]);
      expect(started.opt_out_url).toBe(`${firstLinkBase}/s/${link.rows[0].code}`);
      expect(await retryFields()).toEqual([
        { destination_hash: null, opt_out_url: null, first_tried_at: daytime },
      ]);
      expect(await sendStep(runId!)).toEqual([
        expect.objectContaining({ outcome: 'sent', category: 'marketing', channel: 'sms' }),
      ]);
      const parts = countSmsParts(sent[0]!.text);
      expect(await ledgerFor(runId!)).toEqual([
        { kind: 'reserve', delta: -parts },
        { kind: 'release', delta: parts },
        { kind: 'charge', delta: -parts },
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
      await runner.runStep(await queuedStep(runner, exited!));

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
      expect((await queuedSteps(runner)).map((step) => step.automationRunId)).not.toContain(runId);

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
      const driver = vi.mocked(MailpitSmsDriver.prototype.send);
      driver.mockImplementationOnce(async (message) => {
        await sms.send(message);
        throw new Error('socket hang up');
      });

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

      expect(sentFor(runId!)).toHaveLength(1);
      expect(
        driver.mock.calls.filter(([message]) => message.idempotencyKey === `run:${runId}:first`),
      ).toHaveLength(1);
      const failed = await admin.pool.query(
        'select status,last_error,finished_at from automation_runs where id=$1',
        [runId],
      );
      expect(failed.rows[0]).toEqual({
        status: 'failed',
        last_error: expect.stringContaining('The SMS provider did not answer for 36 hours.'),
        finished_at: clockNow,
      });
      expect(failed.rows[0]?.last_error).toContain('credits stay reserved');
      expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'unconfirmed' })]);
      // The provider may have taken it, so the credits stay reserved for reconciliation.
      expect(await ledgerFor(runId!)).toEqual([{ kind: 'reserve', delta: -1 }]);
    });

    it('waits out quiet hours that start during the retry phone lookup', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      databaseNow = new Date();
      clockNow = new Date(opensAt.getTime() + 11 * HOUR);
      const {
        runIds: [runId],
      } = await dueRuns(send('marketing'), 1, 'active', contact);
      const driver = vi.mocked(MailpitSmsDriver.prototype.send);
      driver.mockRejectedValueOnce(new Error('socket hang up'));
      await runDueStep(runner, runId!);
      await wakeNow(runId!);

      const read = ContactsService.prototype.getPhoneForSend;
      const phone = vi
        .spyOn(ContactsService.prototype, 'getPhoneForSend')
        .mockImplementationOnce(read)
        .mockImplementationOnce(async function (storeId, contactId) {
          const value = await read.call(this, storeId, contactId);
          clockNow = new Date(opensAt.getTime() + 12 * HOUR);
          return value;
        });
      try {
        await runDueStep(runner, runId!);

        expect(phone).toHaveBeenCalledTimes(2);
        expect(sentFor(runId!)).toEqual([]);
        expect(await run(runId!)).toMatchObject({
          status: 'waiting',
          wake_at: new Date(opensAt.getTime() + 24 * HOUR - 30 * MINUTE),
        });
        expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sending' })]);
        expect(await ledgerFor(runId!)).toEqual([{ kind: 'reserve', delta: -1 }]);
      } finally {
        phone.mockRestore();
      }
    });

    it.each([
      'a cap lowered before the gate',
      'a cap write that waits for the gate',
      'a prior send aging out during the gate',
    ] as const)('checks retry dispatch with %s', async (scenario) => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        rows: [shop],
      } = await admin.pool.query('select settings from stores where id=$1', [storeId]);
      const writer = await admin.pool.connect();
      const setCap = (perChannelPerDay: number) =>
        writer.query('update stores set settings=$2 where id=$1', [
          storeId,
          { ...shop.settings, sending: { frequencyCap: { perChannelPerDay, perSevenDays: 3 } } },
        ]);
      let settingsWrite: ReturnType<typeof setCap> | undefined;
      try {
        const {
          rows: [session],
        } = await writer.query<{ pid: number }>('select pg_backend_pid() as pid');
        await setCap(2);
        databaseNow = new Date();
        clockNow = new Date(opensAt.getTime() + HOUR);
        const firstAt = clockNow;
        const agesOut = scenario === 'a prior send aging out during the gate';
        const waits = scenario === 'a cap write that waits for the gate';
        const {
          runIds: [other],
        } = await dueRuns(send('marketing'), 1, 'active', contact);
        await runDueStep(runner, other!);
        expect(sentFor(other!)).toHaveLength(1);
        if (agesOut) clockNow = new Date(firstAt.getTime() + 24 * HOUR - 1);
        const {
          runIds: [runId],
        } = await dueRuns(send('marketing'), 1, 'active', contact);
        await wakeNow(runId!);
        vi.mocked(MailpitSmsDriver.prototype.send).mockRejectedValueOnce(
          new Error('socket hang up'),
        );
        await runDueStep(runner, runId!);
        expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sending' })]);
        await wakeNow(runId!);
        if (!waits) await setCap(1);
        const read = ContactsService.prototype.getPhoneForSend;
        const phone = vi
          .spyOn(ContactsService.prototype, 'getPhoneForSend')
          .mockImplementationOnce(read)
          .mockImplementationOnce(async function (storeId, contactId) {
            if (waits) {
              settingsWrite = setCap(1);
              void settingsWrite.catch(() => undefined);
              await expect
                .poll(async () => {
                  const {
                    rows: [row],
                  } = await admin.pool.query<{ blocked: boolean }>(
                    'select cardinality(pg_blocking_pids($1)) > 0 as blocked',
                    [session!.pid],
                  );
                  return row?.blocked;
                })
                .toBe(true);
            }
            if (agesOut) clockNow = new Date(firstAt.getTime() + 24 * HOUR + 1);
            return read.call(this, storeId, contactId);
          });
        try {
          await runDueStep(runner, runId!);
          await settingsWrite;

          expect(phone).toHaveBeenCalledTimes(2);
          if (waits || agesOut) {
            expect(sentFor(runId!)).toHaveLength(1);
            expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sent' })]);
            expect(await ledgerFor(runId!)).toEqual([
              { kind: 'reserve', delta: -1 },
              { kind: 'release', delta: 1 },
              { kind: 'charge', delta: -1 },
            ]);
          } else {
            expect(sentFor(runId!)).toEqual([]);
            expect(await sendStep(runId!)).toEqual([
              expect.objectContaining({ outcome: 'unconfirmed', skip_reason: 'frequency_cap' }),
            ]);
            expect(await ledgerFor(runId!)).toEqual([{ kind: 'reserve', delta: -1 }]);
          }
        } finally {
          phone.mockRestore();
        }
      } finally {
        await settingsWrite?.catch(() => undefined);
        writer.release();
        await admin.pool.query('update stores set settings=$2 where id=$1', [
          storeId,
          shop.settings,
        ]);
      }
    });

    it.each(['a new worker claims the run', 'the contact changes phone'] as const)(
      'does not submit the first SMS if %s during provider preparation',
      async (change) => {
        const runner = await worker();
        const contact = await customer(true, runner);
        const reclaim = change === 'a new worker claims the run';
        databaseNow = new Date(Date.now() - (reclaim ? 6 * MINUTE : 0));
        const {
          runIds: [runId],
        } = await dueRuns(send('marketing'), 1, 'active', contact);
        const read = ContactsService.prototype.getPhoneForSend;
        const phone = vi
          .spyOn(ContactsService.prototype, 'getPhoneForSend')
          .mockImplementationOnce(async function (shop, person) {
            const value = await read.call(this, shop, person);
            if (reclaim) {
              const oldClaim = (await run(runId!)).claimed_at;
              databaseNow = new Date();
              await runner.sweep();
              expect((await run(runId!)).claimed_at).not.toEqual(oldClaim);
            } else {
              await admin.pool.query('update contacts set phone=$2 where id=$1', [
                contact,
                '01712000998',
              ]);
            }
            return value;
          });
        try {
          await runDueStep(runner, runId!);
        } finally {
          phone.mockRestore();
        }
        expect(sentFor(runId!)).toEqual([]);
        if (reclaim) {
          expect(await run(runId!)).toMatchObject({ status: 'running' });
          expect(await sendStep(runId!)).toEqual([]);
          expect(await ledgerFor(runId!)).toEqual([]);
          await runDueStep(runner, runId!);
          expect(sentFor(runId!)).toHaveLength(1);
          expect(await ledgerFor(runId!)).toEqual([
            { kind: 'reserve', delta: -1 },
            { kind: 'release', delta: 1 },
            { kind: 'charge', delta: -1 },
          ]);
        } else {
          expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'failed' })]);
          expect(await ledgerFor(runId!)).toEqual([]);
        }
      },
    );

    it.each(['marketing', 'transactional'] as const)(
      'rechecks consent for a %s first SMS after the phone lookup',
      async (category) => {
        const runner = await worker();
        const contact = await customer(true, runner);
        const {
          runIds: [runId],
        } = await dueRuns(send(category), 1, 'active', contact);
        const read = ContactsService.prototype.getPhoneForSend;
        const phone = vi
          .spyOn(ContactsService.prototype, 'getPhoneForSend')
          .mockImplementationOnce(async function (shop, person) {
            const value = await read.call(this, shop, person);
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
            return value;
          });
        try {
          await runDueStep(runner, runId!);
        } finally {
          phone.mockRestore();
        }
        if (category === 'transactional') {
          expect(sentFor(runId!)).toHaveLength(1);
          expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sent' })]);
        } else {
          expect(sentFor(runId!)).toEqual([]);
          expect(await sendStep(runId!)).toEqual([
            expect.objectContaining({ outcome: 'skipped', skip_reason: 'no_consent' }),
          ]);
          expect(await ledgerFor(runId!)).toEqual([]);
        }
      },
    );

    it.each(['quiet hours start', 'the workflow pauses'] as const)(
      'does not reserve or send when %s during message preparation',
      async (change) => {
        const runner = await worker();
        const contact = await customer(true, runner);
        databaseNow = new Date();
        clockNow = new Date(opensAt.getTime() + 11 * HOUR);
        const {
          automationId,
          runIds: [runId],
        } = await dueRuns(send('marketing'), 1, 'active', contact);
        const read = ContactsService.prototype.getPhoneForSend;
        const phone = vi
          .spyOn(ContactsService.prototype, 'getPhoneForSend')
          .mockImplementationOnce(async function (shop, person) {
            const value = await read.call(this, shop, person);
            if (change === 'the workflow pauses')
              await admin.pool.query(
                "update automations set status='paused', pause_reason='manual' where id=$1",
                [automationId],
              );
            else clockNow = new Date(opensAt.getTime() + 12 * HOUR);
            return value;
          });
        try {
          await runDueStep(runner, runId!);
        } finally {
          phone.mockRestore();
        }
        expect(sentFor(runId!)).toEqual([]);
        expect(await sendStep(runId!)).toEqual([]);
        expect(await ledgerFor(runId!)).toEqual([]);
        expect(await run(runId!)).toMatchObject({
          status: 'waiting',
          current_step_key: 'first',
        });
        if (change === 'quiet hours start')
          expect((await run(runId!)).wake_at).toEqual(
            new Date(opensAt.getTime() + 24 * HOUR - 30 * MINUTE),
          );
      },
    );

    it('releases credits and leaves the cap free when the provider refuses delivery', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const first = await dueRuns(send('marketing'), 1, 'active', contact);
      vi.mocked(MailpitSmsDriver.prototype.send).mockRejectedValueOnce(new SmsSendRefused());
      await runDueStep(runner, first.runIds[0]!);
      expect(sentFor(first.runIds[0]!)).toEqual([]);
      expect(await sendStep(first.runIds[0]!)).toEqual([
        expect.objectContaining({ outcome: 'failed' }),
      ]);
      expect(await ledgerFor(first.runIds[0]!)).toEqual([
        { kind: 'reserve', delta: -1 },
        { kind: 'release', delta: 1 },
      ]);
      const second = await dueRuns(send('marketing'), 1, 'active', contact);
      await runDueStep(runner, second.runIds[0]!);
      expect(sentFor(second.runIds[0]!)).toHaveLength(1);
    });

    it.each(['allowed', 'quiet hours'] as const)(
      'keeps the original send cutoff when preparation outlives the worker lease in %s',
      async (policy) => {
        const runner = await worker();
        const contact = await customer(true, runner);
        const {
          runIds: [runId],
        } = await dueRuns(send('marketing'), 1, 'active', contact);
        const startedAt = new Date();
        const wakeAt = new Date(startedAt.getTime() - 24 * HOUR + 7 * MINUTE);
        databaseNow = startedAt;
        await admin.pool.query('update automation_runs set wake_at=$2 where id=$1', [
          runId,
          wakeAt,
        ]);

        const read = ContactsService.prototype.getPhoneForSend;
        const phone = vi
          .spyOn(ContactsService.prototype, 'getPhoneForSend')
          .mockImplementationOnce(async function (shop, person) {
            const value = await read.call(this, shop, person);
            databaseNow = new Date(startedAt.getTime() + 6 * MINUTE);
            if (policy === 'quiet hours') clockNow = new Date(opensAt.getTime() + 12 * HOUR);
            return value;
          });
        try {
          await runDueStep(runner, runId!);
          expect(await run(runId!)).toMatchObject({ status: 'waiting', wake_at: wakeAt });
          expect(await sendStep(runId!)).toEqual([]);
          expect(await ledgerFor(runId!)).toEqual([]);
        } finally {
          phone.mockRestore();
        }

        databaseNow = new Date(startedAt.getTime() + 8 * MINUTE);
        await runDueStep(runner, runId!);
        expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'late' })]);
        expect(sentFor(runId!)).toEqual([]);
        expect(await ledgerFor(runId!)).toEqual([]);
      },
    );

    it.each([false, true])(
      'leaves a failed preparation for lease recovery, paused=%s',
      async (pause) => {
        const runner = await worker();
        const contact = await customer(true, runner);
        const {
          automationId,
          runIds: [runId],
        } = await dueRuns(send('marketing'), 1, 'active', contact);
        const phone = vi
          .spyOn(ContactsService.prototype, 'getPhoneForSend')
          .mockImplementationOnce(async () => {
            if (pause)
              await admin.pool.query(
                "update automations set status='paused', pause_reason='manual' where id=$1",
                [automationId],
              );
            throw new Error('database unavailable');
          });
        try {
          await expect(runDueStep(runner, runId!)).rejects.toMatchObject({
            code: 'MESSAGING_PREPARATION_FAILED',
          });
        } finally {
          phone.mockRestore();
        }
        expect(sentFor(runId!)).toEqual([]);
        expect(await sendStep(runId!)).toEqual([]);
        expect(await ledgerFor(runId!)).toEqual([]);
        expect(await run(runId!)).toMatchObject({ status: 'running', current_step_key: 'first' });
        if (pause)
          await admin.pool.query(
            "update automations set status='active', pause_reason=null where id=$1",
            [automationId],
          );
        await admin.pool.query(
          "update automation_runs set claimed_at=now() - interval '6 minutes' where id=$1",
          [runId],
        );
        const oldJob = (await runner.waitingJobs()).find(
          (job) => job.data.automationRunId === runId,
        );
        if (oldJob) await removeJobsBeforeClose(oldJob)();
        await runDueStep(runner, runId!);
        expect(sentFor(runId!)).toHaveLength(1);
        expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sent' })]);
        expect(await ledgerFor(runId!)).toEqual([
          { kind: 'reserve', delta: -1 },
          { kind: 'release', delta: 1 },
          { kind: 'charge', delta: -1 },
        ]);
      },
    );

    it.each(['goal reached', 'incomplete retry data'] as const)(
      'keeps the pending send when a pause commits before processing %s',
      async (condition) => {
        const runner = await worker();
        const contact = await customer(true, runner);
        const automationId = await workflow('active');
        const versionId = await publish(automationId, 1, {
          ...graphWith(send('marketing')),
          goal: { kind: 'got_tag', tag: 'paid' },
        });
        const [runId] = await startRuns(automationId, versionId, { count: 1, forContact: contact });
        const driver = vi.mocked(MailpitSmsDriver.prototype.send);
        driver.mockRejectedValueOnce(new Error('socket hang up'));
        await runDueStep(runner, runId!);
        const pending = await sendStep(runId!);
        expect(pending).toEqual([expect.objectContaining({ outcome: 'sending' })]);
        if (condition === 'incomplete retry data')
          await admin.pool.query(
            'update automation_run_steps set first_tried_at=null where run_id=$1 and kind=$2',
            [runId, 'send'],
          );
        await wakeNow(runId!);

        const read = ContactsService.prototype.findTags;
        const tags = vi
          .spyOn(ContactsService.prototype, 'findTags')
          .mockImplementationOnce(async function (shop, person) {
            const value = await read.call(this, shop, person);
            await admin.pool.query(
              "update automations set status='paused', pause_reason='manual' where id=$1",
              [automationId],
            );
            return condition === 'goal reached' ? [...value, 'paid'] : value;
          });
        try {
          await runDueStep(runner, runId!);
        } finally {
          tags.mockRestore();
        }
        expect(await run(runId!)).toMatchObject({ status: 'waiting', current_step_key: 'first' });
        expect(await sendStep(runId!)).toEqual(pending);
        expect(sentFor(runId!)).toEqual([]);
        expect(await ledgerFor(runId!)).toEqual([{ kind: 'reserve', delta: -1 }]);

        await admin.pool.query(
          "update automations set status='active', pause_reason=null where id=$1",
          [automationId],
        );
        await runDueStep(runner, runId!);
        if (condition === 'goal reached') {
          expect(sentFor(runId!)).toHaveLength(1);
          expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sent' })]);
        } else {
          expect(sentFor(runId!)).toEqual([]);
          expect(await sendStep(runId!)).toEqual([
            expect.objectContaining({ outcome: 'unconfirmed' }),
          ]);
          expect(await ledgerFor(runId!)).toEqual([{ kind: 'reserve', delta: -1 }]);
        }
      },
    );

    it.each(['preparation', 'final'] as const)(
      'counts only the earlier attempt when the %s retry phone lookup fails',
      async (lookup) => {
        const runner = await worker();
        const contact = await customer(true, runner);
        const firstDatabaseAt = new Date();
        databaseNow = firstDatabaseAt;
        const firstAt = new Date(opensAt.getTime() + HOUR);
        clockNow = firstAt;
        const {
          runIds: [runId],
        } = await dueRuns(send('marketing'), 1, 'active', contact);
        vi.mocked(MailpitSmsDriver.prototype.send).mockRejectedValueOnce(
          new Error('socket hang up'),
        );
        await runDueStep(runner, runId!);
        expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sending' })]);

        databaseNow = new Date(databaseNow.getTime() + HOUR);
        clockNow = new Date(firstAt.getTime() + 25 * HOUR);
        await wakeNow(runId!);
        const readPhone = ContactsService.prototype.getPhoneForSend;
        const phone = vi.spyOn(ContactsService.prototype, 'getPhoneForSend');
        const unavailable = new Error('database unavailable');
        if (lookup === 'final') {
          phone.mockImplementationOnce(function (shop, person) {
            return readPhone.call(this, shop, person);
          });
        }
        phone.mockRejectedValueOnce(unavailable);
        try {
          const result = expect(runDueStep(runner, runId!)).rejects;
          if (lookup === 'preparation') {
            await result.toMatchObject({ code: 'MESSAGING_PREPARATION_FAILED' });
          } else {
            await result.toThrow(unavailable.message);
          }
          expect(phone).toHaveBeenCalledTimes(lookup === 'preparation' ? 1 : 2);
        } finally {
          phone.mockRestore();
        }
        expect(sentFor(runId!)).toEqual([]);
        expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sending' })]);
        expect(await ledgerFor(runId!)).toEqual([{ kind: 'reserve', delta: -1 }]);

        const next = await dueRuns(send('marketing'), 1, 'active', contact);
        await runDueStep(runner, next.runIds[0]!);
        expect(sentFor(next.runIds[0]!)).toHaveLength(1);
        const previous = await admin.pool.query<{ sent_at: Date }>(
          "select sent_at from automation_run_steps where run_id=$1 and kind='send'",
          [runId],
        );
        expect(previous.rows).toEqual([{ sent_at: firstAt }]);

        databaseNow = new Date(firstDatabaseAt.getTime() + 36 * HOUR);
        await admin.pool.query(
          "update automation_runs set claimed_at=now() - interval '6 minutes' where id=$1",
          [runId],
        );
        const oldJob = (await runner.waitingJobs()).find(
          (job) => job.data.automationRunId === runId,
        );
        if (oldJob) await removeJobsBeforeClose(oldJob)();
        await runDueStep(runner, runId!);
        expect(sentFor(runId!)).toEqual([]);
        expect(await sendStep(runId!)).toEqual([
          expect.objectContaining({ outcome: 'unconfirmed' }),
        ]);
        expect(await ledgerFor(runId!)).toEqual([{ kind: 'reserve', delta: -1 }]);
      },
    );

    it.each([
      'a reclaimed run',
      'the retry deadline',
      'an expired worker lease',
      'quiet hours with an expired worker lease',
    ] as const)(
      'blocks submission when the final retry phone lookup crosses %s',
      async (boundary) => {
        const runner = await worker();
        const contact = await customer(true, runner);
        const firstAt = new Date(opensAt.getTime() + HOUR);
        const firstDatabaseAt = new Date(Date.now() - 6 * MINUTE);
        clockNow = firstAt;
        databaseNow = firstDatabaseAt;
        const {
          runIds: [runId],
        } = await dueRuns(send('marketing'), 1, 'active', contact);
        const driver = vi.mocked(MailpitSmsDriver.prototype.send);
        driver.mockRejectedValueOnce(new Error('socket hang up'));
        await runDueStep(runner, runId!);
        expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sending' })]);

        await wakeNow(runId!);
        const { wake_at: originalWake } = await run(runId!);
        clockNow = new Date(firstAt.getTime() + HOUR);
        const read = ContactsService.prototype.getPhoneForSend;
        let replacementClaim: string | undefined;
        const phone = vi
          .spyOn(ContactsService.prototype, 'getPhoneForSend')
          .mockImplementationOnce(async function (shop, person) {
            const value = await read.call(this, shop, person);
            databaseNow = new Date(
              firstDatabaseAt.getTime() +
                (boundary === 'the retry deadline' ? 36 * HOUR : 6 * MINUTE),
            );
            if (boundary === 'quiet hours with an expired worker lease')
              clockNow = new Date(opensAt.getTime() + 12 * HOUR);
            if (boundary === 'a reclaimed run') {
              await runner.sweep();
              replacementClaim = (await run(runId!)).claimed_at.toISOString();
              const queued = (await queuedSteps(runner)).filter(
                (job) => job.automationRunId === runId,
              );
              expect(queued).toHaveLength(2);
              expect(queued.some((job) => job.claimedAt === replacementClaim)).toBe(true);
            }
            return value;
          });
        try {
          await runDueStep(runner, runId!);
          const expiredLease = boundary.endsWith('expired worker lease');
          expect(phone).toHaveBeenCalledTimes(expiredLease ? 2 : 1);
        } finally {
          phone.mockRestore();
        }

        expect(sentFor(runId!)).toEqual([]);
        expect(await ledgerFor(runId!)).toEqual([{ kind: 'reserve', delta: -1 }]);
        const previous = await admin.pool.query<{ sent_at: Date; outcome: string }>(
          "select sent_at,outcome from automation_run_steps where run_id=$1 and kind='send'",
          [runId],
        );
        const exhausted = boundary === 'the retry deadline';
        expect(previous.rows).toEqual([
          { sent_at: firstAt, outcome: exhausted ? 'unconfirmed' : 'sending' },
        ]);
        if (boundary === 'a reclaimed run') {
          expect(await run(runId!)).toMatchObject({
            status: 'running',
            claimed_at: new Date(replacementClaim!),
          });
          return;
        }
        if (exhausted) {
          expect(await run(runId!)).toMatchObject({ status: 'failed' });
          const errors = await admin.pool.query<{ last_error: string }>(
            'select last_error from automation_runs where id=$1',
            [runId],
          );
          expect(errors.rows).toEqual([{ last_error: expect.stringContaining('36 hours') }]);
        } else {
          expect(await run(runId!)).toMatchObject({ status: 'waiting', wake_at: originalWake });
        }
      },
    );

    it('renews an eligible retry lease after preparation and settles under that lease', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      databaseNow = new Date();
      const {
        runIds: [runId],
      } = await dueRuns(send('marketing'), 1, 'active', contact);
      const driver = vi.mocked(MailpitSmsDriver.prototype.send);
      driver.mockRejectedValueOnce(new Error('socket hang up'));
      await runDueStep(runner, runId!);
      expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sending' })]);
      await wakeNow(runId!);

      const renewedAt = new Date(databaseNow.getTime() + 2 * MINUTE);
      const read = ContactsService.prototype.getPhoneForSend;
      const phone = vi
        .spyOn(ContactsService.prototype, 'getPhoneForSend')
        .mockImplementationOnce(read)
        .mockImplementationOnce(async function (shop, person) {
          const value = await read.call(this, shop, person);
          databaseNow = renewedAt;
          return value;
        });
      let submittingClaim: Date | undefined;
      driver.mockImplementationOnce(async (message) => {
        submittingClaim = (await run(runId!)).claimed_at;
        return sms.send(message);
      });
      try {
        await runDueStep(runner, runId!);
        expect(phone).toHaveBeenCalledTimes(2);
      } finally {
        phone.mockRestore();
      }
      expect(submittingClaim).toEqual(renewedAt);
      expect(sentFor(runId!)).toHaveLength(1);
      expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sent' })]);
      expect(await ledgerFor(runId!)).toEqual([
        { kind: 'reserve', delta: -1 },
        { kind: 'release', delta: 1 },
        { kind: 'charge', delta: -1 },
      ]);
    });

    it.each([
      ['before gate', 'skip'],
      ['during wallet wait', 'skip'],
      ['before gate', 'exit'],
      ['during wallet wait', 'exit'],
    ] as const)('handles a contact removed %s with ifNotReachable=%s', async (when, action) => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        runIds: [runId],
      } = await dueRuns(send('marketing', action), 1, 'active', contact);
      const remove = () =>
        admin.pool.query('update contacts set deleted_at=now() where id=$1', [contact]);
      if (when === 'before gate') {
        await remove();
        await runDueStep(runner, runId!);
      } else {
        await runner.sweep();
        const jobs = await runner.waitingJobs();
        const job = jobs.find((job) => job.data.automationRunId === runId)!;
        const removeJob = removeJobsBeforeClose(job);
        const blocker = await admin.pool.connect();
        let pending: ReturnType<typeof runner.runStep> | undefined;
        try {
          const {
            rows: [{ pid }],
          } = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
          await blocker.query('begin');
          await blocker.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
            `wallet:${storeId}:sms_credits`,
          ]);
          pending = runner.runStep(job.data as StepJobData);
          void pending.catch(() => undefined);
          await waitForBlocker(pid);
          await remove();
          await blocker.query('commit');
          await pending;
        } finally {
          blocker.release(true);
          await pending?.catch(() => undefined);
          await removeJob();
        }
      }
      expect(sentFor(runId!)).toEqual([]);
      expect(await ledgerFor(runId!)).toEqual([]);
      expect(await sendStep(runId!)).toEqual([
        expect.objectContaining({ outcome: 'skipped', skip_reason: 'no_address' }),
      ]);
      expect(await run(runId!)).toMatchObject(
        action === 'skip'
          ? { status: 'running', current_step_key: 'end' }
          : { status: 'exited', exit_reason: 'not_reachable' },
      );
    });

    it.each(['transactional', 'marketing'] as const)(
      'uses the current time for %s sender preparation after slow fact reads',
      async (category) => {
        const runner = await worker();
        const contact = await customer(true, runner);
        const {
          runIds: [runId],
        } = await dueRuns(send(category), 1, 'active', contact);
        await admin.pool.query('update automation_runs set wake_at=$2, attempts=9 where id=$1', [
          runId,
          new Date(daytime.getTime() - 24 * HOUR + MINUTE),
        ]);
        const original = ContactsService.prototype.findTags;
        const factsHook = vi
          .spyOn(ContactsService.prototype, 'findTags')
          .mockImplementationOnce(async function (store, id) {
            const tags = await original.call(this, store, id);
            clockNow = new Date(daytime.getTime() + 2 * MINUTE);
            return tags;
          });
        const senderHook = vi
          .spyOn(SmsSendersService.prototype, 'approvedSenderName')
          .mockRejectedValueOnce(new Error('database unavailable'));
        try {
          await runDueStep(runner, runId!);
          expect(sentFor(runId!)).toEqual([]);
          expect(await ledgerFor(runId!)).toEqual([]);
          expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'late' })]);
          expect(await run(runId!)).toMatchObject({
            status: 'running',
            current_step_key: 'end',
            attempts: 0,
          });
        } finally {
          factsHook.mockRestore();
          senderHook.mockRestore();
        }
      },
    );

    it.each(['transactional', 'marketing'] as const)(
      'advances an expired %s SMS even when sender preparation is unavailable',
      async (category) => {
        const runner = await worker();
        const contact = await customer(true, runner);
        const {
          runIds: [runId],
        } = await dueRuns(send(category), 1, 'active', contact);
        await admin.pool.query('update automation_runs set wake_at=$2 where id=$1', [
          runId,
          new Date(daytime.getTime() - 25 * HOUR),
        ]);
        const hook = vi
          .spyOn(SmsSendersService.prototype, 'approvedSenderName')
          .mockRejectedValueOnce(new Error('database unavailable'));
        try {
          await runDueStep(runner, runId!);
          expect(sentFor(runId!)).toEqual([]);
          expect(await ledgerFor(runId!)).toEqual([]);
          expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'late' })]);
          expect(await run(runId!)).toMatchObject({ status: 'running', current_step_key: 'end' });
        } finally {
          hook.mockRestore();
        }
      },
    );

    it('keeps the late fallback for a legacy non-SMS step under the live guard', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const step = { ...send('marketing', 'exit'), channels: ['whatsapp'] } as const;
      const {
        runIds: [runId],
      } = await dueRuns(step, 1, 'active', contact);
      await admin.pool.query('update automation_runs set wake_at=$2 where id=$1', [
        runId,
        new Date(daytime.getTime() - 25 * HOUR),
      ]);
      await runDueStep(runner, runId!);
      expect(sentFor(runId!)).toEqual([]);
      expect(await ledgerFor(runId!)).toEqual([]);
      expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'late' })]);
      expect(await run(runId!)).toMatchObject({ status: 'running', current_step_key: 'end' });
    });

    it('skips consent withdrawn while the sender is prepared before the final gate', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        runIds: [runId],
      } = await dueRuns(send('marketing'), 1, 'active', contact);
      const original = SmsSendersService.prototype.approvedSenderName;
      const hook = vi
        .spyOn(SmsSendersService.prototype, 'approvedSenderName')
        .mockImplementationOnce(async function (store) {
          const name = await original.call(this, store);
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
          return name;
        });
      try {
        await runDueStep(runner, runId!);
        expect(sentFor(runId!)).toEqual([]);
        expect(await ledgerFor(runId!)).toEqual([]);
        expect(await sendStep(runId!)).toEqual([
          expect.objectContaining({ outcome: 'skipped', skip_reason: 'no_consent' }),
        ]);
      } finally {
        hook.mockRestore();
      }
    });

    it('leaves credits and the cap untouched when the early sender lookup fails', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const first = await dueRuns(send('marketing'), 1, 'active', contact);
      const hook = vi
        .spyOn(SmsSendersService.prototype, 'approvedSenderName')
        .mockRejectedValueOnce(new Error('database unavailable'));
      try {
        await expect(runDueStep(runner, first.runIds[0]!)).rejects.toMatchObject({
          code: 'MESSAGING_PREPARATION_FAILED',
        });
        expect(sentFor(first.runIds[0]!)).toEqual([]);
        expect(await ledgerFor(first.runIds[0]!)).toEqual([]);
        expect(await sendStep(first.runIds[0]!)).toEqual([]);
        const second = await dueRuns(send('marketing'), 1, 'active', contact);
        await runDueStep(runner, second.runIds[0]!);
        expect(sentFor(second.runIds[0]!)).toHaveLength(1);
      } finally {
        hook.mockRestore();
      }
    });

    it('dates an immediate second send from when it was reached, not the previous step due time', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const automationId = await workflow('active');
      const graph = graphWith({ ...send('transactional'), next: 'second' });
      graph.steps['second'] = send('transactional');
      const versionId = await publish(automationId, 1, graph);
      const [runId] = await startRuns(automationId, versionId, { count: 1, forContact: contact });
      await admin.pool.query('update automation_runs set wake_at=$2 where id=$1', [
        runId,
        new Date(daytime.getTime() - 24 * HOUR + MINUTE),
      ]);
      await runDueStep(runner, runId!);
      clockNow = new Date(daytime.getTime() + 2 * MINUTE);
      await runDueStep(runner, runId!);
      expect(sentFor(runId!)).toHaveLength(2);
      expect(await sendStep(runId!)).toEqual([
        expect.objectContaining({ outcome: 'sent' }),
        expect.objectContaining({ outcome: 'sent' }),
      ]);
    });

    it('keeps the next send due and claimed at database time with a slow worker', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const automationId = await workflow('active');
      const graph = graphWith({ ...send('transactional'), next: 'second' });
      graph.steps['second'] = send('transactional');
      const versionId = await publish(automationId, 1, graph);
      const [runId] = await startRuns(automationId, versionId, { count: 1, forContact: contact });
      databaseNow = daytime;
      clockNow = new Date(daytime.getTime() - 6 * MINUTE);

      await runDueStep(runner, runId!);
      const { rows } = await admin.pool.query(
        'select wake_at, claimed_at from automation_runs where id=$1',
        [runId],
      );
      expect(rows).toEqual([{ wake_at: daytime, claimed_at: daytime }]);

      databaseNow = new Date(daytime.getTime() + 24 * HOUR - 5 * MINUTE);
      clockNow = new Date(databaseNow.getTime() - 6 * MINUTE);
      await runDueStep(runner, runId!);
      expect(sentFor(runId!)).toHaveLength(2);
      expect(await sendStep(runId!)).toEqual([
        expect.objectContaining({ outcome: 'sent' }),
        expect.objectContaining({ outcome: 'sent' }),
      ]);
    });

    it.each(['paused', 'archived', 'version stopped'] as const)(
      'does not consume an overdue send when the workflow becomes %s after its initial read',
      async (change) => {
        const runner = await worker();
        const contact = await customer(true, runner);
        const {
          automationId,
          runIds: [runId],
        } = await dueRuns(send('marketing'), 1, 'active', contact);
        await admin.pool.query('update automation_runs set wake_at=$2 where id=$1', [
          runId,
          new Date(daytime.getTime() - 25 * HOUR),
        ]);
        const original = ContactsService.prototype.findTags;
        const hook = vi
          .spyOn(ContactsService.prototype, 'findTags')
          .mockImplementationOnce(async function (store, id) {
            const tags = await original.call(this, store, id);
            if (change === 'version stopped')
              await admin.pool.query(
                'update automation_versions set is_stopped=true where automation_id=$1',
                [automationId],
              );
            else
              await admin.pool.query(
                "update automations set status=$1, pause_reason=case when $1='paused' then 'manual' end where id=$2",
                [change, automationId],
              );
            return tags;
          });
        try {
          await runDueStep(runner, runId!);
          expect(sentFor(runId!)).toEqual([]);
          expect(await ledgerFor(runId!)).toEqual([]);
          expect(await sendStep(runId!)).toEqual([]);
          expect(await run(runId!)).toMatchObject(
            change === 'paused'
              ? { status: 'waiting' }
              : {
                  status: 'exited',
                  exit_reason: change === 'archived' ? 'archived' : 'version_stopped',
                },
          );
        } finally {
          hook.mockRestore();
        }
      },
    );

    it('exits without reserving when the goal is reached during the send-lock wait', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const automationId = await workflow('active');
      const graph = {
        ...graphWith(send('marketing')),
        goal: { kind: 'got_tag', tag: 'ordered' },
      } as const;
      const versionId = await publish(automationId, 1, graph);
      const [runId] = await startRuns(automationId, versionId, { count: 1, forContact: contact });
      await runner.sweep();
      const jobs = await runner.waitingJobs();
      const job = jobs.find((queued) => queued.data.automationRunId === runId)!;
      const removeJob = removeJobsBeforeClose(job);
      const blocker = await admin.pool.connect();
      let pending: ReturnType<typeof runner.runStep> | undefined;
      try {
        const {
          rows: [{ pid }],
        } = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
        await blocker.query('begin');
        await blocker.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
          `send:${storeId}:${contact}`,
        ]);
        pending = runner.runStep(job.data as StepJobData);
        void pending.catch(() => undefined);
        await waitForBlocker(pid);
        await admin.pool.query("update contacts set tags=array['ordered'] where id=$1", [contact]);
        await blocker.query('commit');
        await pending;
        expect(sentFor(runId!)).toEqual([]);
        expect(await ledgerFor(runId!)).toEqual([]);
        expect(await sendStep(runId!)).toEqual([]);
        expect(await run(runId!)).toMatchObject({ status: 'exited', exit_reason: 'goal' });
      } finally {
        blocker.release(true);
        await pending?.catch(() => undefined);
        await removeJob();
      }
    });

    it.each(['consent withdrawal', 'goal', 'quiet hours', 'late cutoff'] as const)(
      'checks %s after a wallet-lock wait without reserving or sending',
      async (change) => {
        const runner = await worker();
        const contact = await customer(true, runner);
        const automationId = await workflow('active');
        const graph = {
          ...graphWith(send('marketing')),
          goal: { kind: 'got_tag', tag: 'ordered' },
        } as const;
        const versionId = await publish(automationId, 1, graph);
        const [runId] = await startRuns(automationId, versionId, { count: 1, forContact: contact });
        const quietHoursStart = new Date(
          Date.UTC(real.getUTCFullYear(), real.getUTCMonth(), real.getUTCDate() - 1, 15),
        );
        if (change === 'quiet hours') {
          fixtures.getStore()!.cleanups.push(async () => {
            await admin.pool.query('delete from automation_runs where store_id=$1 and id=$2', [
              storeId,
              runId,
            ]);
          });
          // Use a past wake time so the database sweep can claim it at any time of day.
          clockNow = new Date(quietHoursStart.getTime() - MINUTE);
          await admin.pool.query('update automation_runs set wake_at=$2 where id=$1', [
            runId,
            clockNow,
          ]);
        } else if (change === 'late cutoff')
          await admin.pool.query('update automation_runs set wake_at=$2 where id=$1', [
            runId,
            new Date(daytime.getTime() - 24 * HOUR + MINUTE),
          ]);
        await runner.sweep();
        const jobs = await runner.waitingJobs();
        const job = jobs.find((queued) => queued.data.automationRunId === runId)!;
        const removeJob = removeJobsBeforeClose(job);
        const blocker = await admin.pool.connect();
        let pending: ReturnType<typeof runner.runStep> | undefined;
        try {
          const {
            rows: [{ pid }],
          } = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
          await blocker.query('begin');
          await blocker.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
            `wallet:${storeId}:sms_credits`,
          ]);
          pending = runner.runStep(job.data as StepJobData);
          void pending.catch(() => undefined);
          await waitForBlocker(pid);
          if (change === 'consent withdrawal')
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
          else if (change === 'goal')
            await admin.pool.query("update contacts set tags=array['ordered'] where id=$1", [
              contact,
            ]);
          else if (change === 'late cutoff') clockNow = new Date(daytime.getTime() + 2 * MINUTE);
          else clockNow = quietHoursStart;
          await blocker.query('commit');
          await pending;
          expect(sentFor(runId!)).toEqual([]);
          expect(await ledgerFor(runId!)).toEqual([]);
          if (change === 'consent withdrawal')
            expect(await sendStep(runId!)).toEqual([
              expect.objectContaining({ outcome: 'skipped', skip_reason: 'no_consent' }),
            ]);
          else if (change === 'late cutoff') {
            expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'late' })]);
            expect(await run(runId!)).toMatchObject({ status: 'running', current_step_key: 'end' });
          } else {
            expect(await sendStep(runId!)).toEqual([]);
            expect(await run(runId!)).toMatchObject(
              change === 'goal' ? { status: 'exited', exit_reason: 'goal' } : { status: 'waiting' },
            );
          }
        } finally {
          blocker.release(true);
          await pending?.catch(() => undefined);
          await removeJob();
        }
      },
    );

    it.each(['paused', 'archived', 'version stopped'] as const)(
      'holds two wallet waiters without sending when their workflows are %s',
      async (change) => {
        const runner = await worker();
        const contacts = [await customer(true, runner), await customer(true, runner)];
        const runs = [];
        for (const contact of contacts) {
          runs.push(await dueRuns(send('marketing'), 1, 'active', contact));
        }
        await runner.sweep();
        const jobs = await runner.waitingJobs();
        const heldJobs = runs.map(({ runIds }) => {
          const job = jobs.find((entry) => entry.data.automationRunId === runIds[0]);
          expect(job).toBeDefined();
          return job!;
        });
        const removeJobs = removeJobsBeforeClose(...heldJobs);
        const blocker = await admin.pool.connect();
        let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
        try {
          const {
            rows: [{ pid }],
          } = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
          await blocker.query('begin');
          await blocker.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
            `wallet:${storeId}:sms_credits`,
          ]);
          pending = Promise.allSettled(
            heldJobs.map(async (job) => runner.runStep(job.data as StepJobData)),
          );
          await waitForBlocker(pid, 2);
          const ids = runs.map((run) => run.automationId);
          if (change === 'version stopped')
            await admin.pool.query(
              'update automation_versions set is_stopped=true where automation_id=any($1::uuid[])',
              [ids],
            );
          else
            await admin.pool.query(
              "update automations set status=$1, pause_reason=case when $1='paused' then 'manual' end where id=any($2::uuid[])",
              [change, ids],
            );
          await blocker.query('commit');
          throwFirstRejection(await pending);
          for (const {
            runIds: [runId],
          } of runs) {
            expect(sentFor(runId!)).toEqual([]);
            expect(await ledgerFor(runId!)).toEqual([]);
            expect(await sendStep(runId!)).toEqual([]);
            expect(await run(runId!)).toMatchObject(
              change === 'paused'
                ? { status: 'waiting' }
                : {
                    status: 'exited',
                    exit_reason: change === 'archived' ? 'archived' : 'version_stopped',
                  },
            );
          }
        } finally {
          // Discarding the client also releases the advisory lock if setup or the test failed.
          blocker.release(true);
          await pending;
          await removeJobs();
        }
      },
    );

    it('renews the lease after gate writes so a slow gate cannot lose credit settlement', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        runIds: [runId],
      } = await dueRuns(send('marketing'), 1, 'active', contact);
      const later = new Date(daytime.getTime() + 6 * MINUTE);
      const originalInsert = AutomationRunsRepository.prototype.insertStep;
      const hook = vi
        .spyOn(AutomationRunsRepository.prototype, 'insertStep')
        .mockImplementationOnce(async function (...args) {
          await originalInsert.apply(this, args);
          clockNow = later;
        });
      let stolen = 0;
      vi.mocked(MailpitSmsDriver.prototype.send).mockImplementationOnce(async (message) => {
        const result = await admin.pool.query(
          "update automation_runs set claimed_at=$2 where id=$1 and status='running' and claimed_at < $2::timestamptz - interval '5 minutes' returning id",
          [runId, later],
        );
        stolen = result.rowCount ?? 0;
        return sms.send(message);
      });
      try {
        await runDueStep(runner, runId!);
        expect(stolen).toBe(0);
        expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sent' })]);
        expect(await ledgerFor(runId!)).toEqual([
          { kind: 'reserve', delta: -1 },
          { kind: 'release', delta: 1 },
          { kind: 'charge', delta: -1 },
        ]);
      } finally {
        hook.mockRestore();
      }
    });

    it('keeps a dispatch lease current when the worker clock is slow', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        runIds: [runId],
      } = await dueRuns(send('transactional'), 1, 'active', contact);
      const scheduler = vi.mocked(AutomationRunsRepository.prototype.schedulerTime);
      scheduler.mockImplementation(schedulerTime);
      clockNow = new Date(Date.now() - 6 * MINUTE);
      let reclaimed: boolean | undefined;
      vi.mocked(MailpitSmsDriver.prototype.send).mockImplementationOnce(async (message) => {
        const sweep = await admin.pool.connect();
        try {
          await sweep.query('begin');
          const { rows } = await sweep.query<{ reclaimed: boolean }>(
            'select exists (select 1 from due_automation_runs(1000, 100) where automation_run_id=$1) as reclaimed',
            [runId],
          );
          reclaimed = rows[0]?.reclaimed;
        } finally {
          // The sweep may find other due fixtures. Leave all claims as they were.
          sweep.release(true);
        }
        return sms.send(message);
      });

      try {
        await runDueStep(runner, runId!);

        expect(reclaimed).toBe(false);
        expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sent' })]);
        expect(await ledgerFor(runId!)).toEqual([
          { kind: 'reserve', delta: -1 },
          { kind: 'release', delta: 1 },
          { kind: 'charge', delta: -1 },
        ]);
      } finally {
        scheduler.mockImplementation(fixtureSchedulerTime);
      }
    });

    it('counts an accepted send with a lost answer toward the marketing cap', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const first = await dueRuns(send('marketing'), 1, 'active', contact);
      vi.mocked(MailpitSmsDriver.prototype.send).mockImplementationOnce(async (message) => {
        await sms.send(message);
        throw new Error('socket hang up');
      });
      await runDueStep(runner, first.runIds[0]!);
      const second = await dueRuns(send('marketing'), 1, 'active', contact);
      await runDueStep(runner, second.runIds[0]!);
      expect(sentFor(first.runIds[0]!)).toHaveLength(1);
      expect(sentFor(second.runIds[0]!)).toEqual([]);
      expect(await sendStep(second.runIds[0]!)).toEqual([
        expect.objectContaining({ outcome: 'skipped', skip_reason: 'frequency_cap' }),
      ]);
      expect(await ledgerFor(first.runIds[0]!)).toEqual([{ kind: 'reserve', delta: -1 }]);
    });

    it('refuses a replaced phone while the final dispatch gate waits', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        runIds: [runId],
      } = await dueRuns(send('marketing'), 1, 'active', contact);
      const blocker = await admin.pool.connect();
      let running: ReturnType<typeof runDueStep> | undefined;
      let transactionOpen = false;
      try {
        await blocker.query('begin');
        transactionOpen = true;
        const {
          rows: [{ pid }],
        } = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
        await blocker.query('select id from contacts where store_id=$1 and id=$2 for update', [
          storeId,
          contact,
        ]);
        running = runDueStep(runner, runId!);
        void running.catch(() => undefined);
        await waitForBlocker(pid);
        await blocker.query('update contacts set phone=$1 where id=$2', [
          `0191100${String(++phone).padStart(4, '0')}`,
          contact,
        ]);
        await blocker.query('commit');
        transactionOpen = false;
        await running;
      } finally {
        try {
          if (transactionOpen) await blocker.query('rollback');
        } finally {
          blocker.release(true);
          await running?.catch(() => undefined);
        }
      }
      expect(sentFor(runId!)).toEqual([]);
      expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'failed' })]);
      expect(await ledgerFor(runId!)).toEqual([]);
    });

    it('submits to the authorized phone if the contact changes it after gate commit', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        rows: [{ phone: authorizedPhone }],
      } = await admin.pool.query<{ phone: string }>(
        'select phone from contacts where store_id=$1 and id=$2',
        [storeId, contact],
      );
      const {
        runIds: [runId],
      } = await dueRuns(send('marketing'), 1, 'active', contact);
      const replacement = {
        text: 'update contacts set phone=$1 where store_id=$2 and id=$3',
        values: [`0191100${String(++phone).padStart(4, '0')}`, storeId, contact],
      };
      const checkForSend = SendPolicyService.prototype.checkForSend;
      const policy = vi
        .spyOn(SendPolicyService.prototype, 'checkForSend')
        .mockImplementationOnce(async function (shop, request) {
          const checked = await checkForSend.call(this, shop, request);
          const writer = await admin.pool.connect();
          try {
            await writer.query('begin');
            await writer.query("set local lock_timeout = '100ms'");
            await expect(writer.query(replacement)).rejects.toMatchObject({ code: '55P03' });
          } finally {
            try {
              await writer.query('rollback');
            } finally {
              writer.release(true);
            }
          }
          return checked;
        });
      const sendPrepared = MessagingService.prototype.send;
      const hook = vi
        .spyOn(MessagingService.prototype, 'send')
        .mockImplementationOnce(async function (shop, message, prepared) {
          expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sending' })]);
          await admin.pool.query(replacement);
          return sendPrepared.call(this, shop, message, prepared);
        });
      try {
        await runDueStep(runner, runId!);
        expect(sentFor(runId!).map((message) => message.to)).toEqual([authorizedPhone]);
        expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sent' })]);
        expect(await ledgerFor(runId!)).toEqual([
          { kind: 'reserve', delta: -1 },
          { kind: 'release', delta: 1 },
          { kind: 'charge', delta: -1 },
        ]);
      } finally {
        policy.mockRestore();
        hook.mockRestore();
      }
    });

    it('enforces the cap when an earlier-started run reaches the lock second', async ({
      signal,
    }) => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const first = await dueRuns(send('marketing'), 1, 'active', contact);
      const second = await dueRuns(send('marketing'), 1, 'active', contact);
      await runner.sweep();
      const jobs = await runner.waitingJobs();
      const firstJob = jobs.find((job) => job.data.automationRunId === first.runIds[0])!;
      const secondJob = jobs.find((job) => job.data.automationRunId === second.runIds[0])!;
      removeJobsBeforeClose(firstJob, secondJob);
      let reached!: () => void;
      let release!: () => void;
      const blocked = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const continueFirst = new Promise<void>((resolve) => {
        release = resolve;
      });
      signal.throwIfAborted();
      signal.addEventListener('abort', release, { once: true });
      const originalTags = ContactsService.prototype.findTags;
      const hook = vi
        .spyOn(ContactsService.prototype, 'findTags')
        .mockImplementationOnce(async function (store, id) {
          reached();
          await continueFirst;
          return originalTags.call(this, store, id);
        });
      const pending = runner.runStep(firstJob.data as StepJobData);
      try {
        await Promise.race([
          blocked,
          pending.then(() => {
            throw new Error('The first run did not reach the send gate');
          }),
        ]);
        clockNow = new Date(daytime.getTime() + 1000);
        await runner.runStep(secondJob.data as StepJobData);
        release();
        await pending;
        expect(sentFor(second.runIds[0]!)).toHaveLength(1);
        expect(sentFor(first.runIds[0]!)).toEqual([]);
        expect(await sendStep(first.runIds[0]!)).toEqual([
          expect.objectContaining({ outcome: 'skipped', skip_reason: 'frequency_cap' }),
        ]);
      } finally {
        signal.removeEventListener('abort', release);
        release();
        await pending.catch(() => undefined);
        hook.mockRestore();
      }
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

    it('applies the current marketing cap when an uncertain attempt ages out', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      clockNow = new Date(opensAt.getTime() - 24 * HOUR);
      const {
        runIds: [earlier],
      } = await dueRuns(send('marketing'), 1, 'active', contact);
      vi.mocked(MailpitSmsDriver.prototype.send).mockRejectedValueOnce(new Error('socket hang up'));
      await runDueStep(runner, earlier!);

      clockNow = new Date(clockNow.getTime() + 25 * HOUR);
      const {
        runIds: [newer],
      } = await dueRuns(send('marketing'), 1, 'active', contact);
      await runDueStep(runner, newer!);
      expect(sentFor(newer!)).toHaveLength(1);

      await wakeNow(earlier!);
      await runDueStep(runner, earlier!);
      expect(sentFor(earlier!)).toEqual([]);
      expect(await sendStep(earlier!)).toEqual([
        expect.objectContaining({ outcome: 'unconfirmed', skip_reason: 'frequency_cap' }),
      ]);
      expect(await ledgerFor(earlier!)).toEqual([{ kind: 'reserve', delta: -1 }]);
    });

    it('counts a later uncertain retry without extending the original deadline', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const firstTriedAt = new Date(opensAt.getTime() - 24 * HOUR);
      clockNow = firstTriedAt;
      const {
        runIds: [earlier],
      } = await dueRuns(send('marketing'), 1, 'active', contact);
      vi.mocked(MailpitSmsDriver.prototype.send).mockRejectedValueOnce(new Error('socket hang up'));
      await runDueStep(runner, earlier!);

      clockNow = new Date(firstTriedAt.getTime() + 25 * HOUR);
      await wakeNow(earlier!);
      vi.mocked(MailpitSmsDriver.prototype.send).mockRejectedValueOnce(new Error('socket hang up'));
      await runDueStep(runner, earlier!);
      const timings = await admin.pool.query(
        'select first_tried_at, sent_at from automation_run_steps where run_id=$1 and kind=$2',
        [earlier, 'send'],
      );
      expect(timings.rows).toEqual([{ first_tried_at: firstTriedAt, sent_at: clockNow }]);

      // The other worker has a slightly slower clock after it takes the same contact lock.
      clockNow = new Date(clockNow.getTime() - 50);
      const {
        runIds: [newer],
      } = await dueRuns(send('marketing'), 1, 'active', contact);
      await runDueStep(runner, newer!);
      expect(sentFor(newer!)).toEqual([]);
      expect(await sendStep(newer!)).toEqual([
        expect.objectContaining({ outcome: 'skipped', skip_reason: 'frequency_cap' }),
      ]);
    });

    it.each(['balance pause', 'quiet hours'] as const)(
      'holds a retry when %s starts during a workflow lock wait',
      async (reason) => {
        const before = await balance();
        await setCredits(Math.max(before, 1));
        const runner = await worker();
        const contact = await customer(true, runner);
        clockNow = new Date(opensAt.getTime() + 11 * HOUR);
        const {
          automationId,
          runIds: [runId],
        } = await dueRuns(send('marketing'), 1, 'active', contact);
        vi.mocked(MailpitSmsDriver.prototype.send).mockRejectedValueOnce(
          new Error('socket hang up'),
        );
        await runDueStep(runner, runId!);
        await wakeNow(runId!);

        const blocker = await admin.pool.connect();
        let retry: Promise<void> | undefined;
        try {
          const {
            rows: [{ pid }],
          } = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
          await blocker.query('begin');
          await blocker.query(
            reason === 'balance pause'
              ? "update automations set status='paused', pause_reason='balance', balance_pause_revision=0 where id=$1"
              : "update automations set name='Updated workflow' where id=$1",
            [automationId],
          );
          retry = runDueStep(runner, runId!);
          void retry.catch(() => undefined);
          await waitForBlocker(pid);
          if (reason === 'quiet hours') clockNow = new Date(clockNow.getTime() + HOUR);
          await blocker.query('commit');
          await retry;

          expect(sentFor(runId!)).toEqual([]);
          expect(await run(runId!)).toMatchObject({ status: 'waiting', current_step_key: 'first' });
          expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sending' })]);
          expect(await ledgerFor(runId!)).toEqual([{ kind: 'reserve', delta: -1 }]);
        } finally {
          blocker.release(true);
          await retry?.catch(() => undefined);
          await setCredits(before);
        }
      },
    );

    it('does not submit a retry after waiting on its step row across the deadline', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const firstTriedAt = new Date(opensAt.getTime() - 48 * HOUR);
      const expiresAt = firstTriedAt.getTime() + 36 * HOUR;
      clockNow = firstTriedAt;
      const {
        runIds: [runId],
      } = await dueRuns(send('transactional'), 1, 'active', contact);
      vi.mocked(MailpitSmsDriver.prototype.send).mockRejectedValueOnce(new Error('socket hang up'));
      await runDueStep(runner, runId!);
      await wakeNow(runId!);
      clockNow = new Date(expiresAt - MINUTE);

      const blocker = await admin.pool.connect();
      let resending: Promise<void> | undefined;
      try {
        const { rows } = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
        await blocker.query('begin');
        await blocker.query('select id from automation_run_steps where run_id=$1 for update', [
          runId,
        ]);
        resending = runDueStep(runner, runId!);
        void resending.catch(() => undefined);
        await waitForBlocker(rows[0]!.pid);
        clockNow = new Date(expiresAt);
        await blocker.query('commit');
        await resending;

        expect(sentFor(runId!)).toEqual([]);
        expect(await sendStep(runId!)).toEqual([
          expect.objectContaining({ outcome: 'unconfirmed' }),
        ]);
        expect(await ledgerFor(runId!)).toEqual([{ kind: 'reserve', delta: -1 }]);
      } finally {
        blocker.release(true);
        await resending?.catch(() => undefined);
      }
    });

    it('keeps the marketing cap when a slower worker settles a retry', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      const firstTriedAt = new Date(opensAt.getTime() - 24 * HOUR);
      clockNow = firstTriedAt;
      const {
        runIds: [earlier],
      } = await dueRuns(send('marketing'), 1, 'active', contact);
      vi.mocked(MailpitSmsDriver.prototype.send).mockImplementationOnce(async (message) => {
        await sms.send(message);
        throw new Error('socket hang up');
      });
      await runDueStep(runner, earlier!);

      databaseNow = firstTriedAt;
      clockNow = new Date(firstTriedAt.getTime() - 100);
      await wakeNow(earlier!);
      await runDueStep(runner, earlier!);
      const timings = await admin.pool.query(
        'select first_tried_at, sent_at from automation_run_steps where run_id=$1 and kind=$2',
        [earlier, 'send'],
      );
      expect(timings.rows).toEqual([{ first_tried_at: firstTriedAt, sent_at: firstTriedAt }]);
      expect(sentFor(earlier!)).toHaveLength(1);
      expect(await sendStep(earlier!)).toEqual([expect.objectContaining({ outcome: 'sent' })]);

      databaseNow = undefined;
      clockNow = new Date(firstTriedAt.getTime() + 24 * HOUR - 25);
      const {
        runIds: [newer],
      } = await dueRuns(send('marketing'), 1, 'active', contact);
      await runDueStep(runner, newer!);
      expect(sentFor(newer!)).toEqual([]);
      expect(await sendStep(newer!)).toEqual([
        expect.objectContaining({ outcome: 'skipped', skip_reason: 'frequency_cap' }),
      ]);
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

    it('pauses the workflow once on a short balance, tells the owner and resumes after a top-up', async () => {
      await setCredits(0);
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        automationId,
        runIds: [recent, old],
      } = await dueRuns(send('transactional'), 2, 'active', contact);
      // Both runs reach the gate at the same moment.
      await runner.sweep();
      const recentStep = await queuedStep(runner, recent!);
      const oldStep = await queuedStep(runner, old!);
      throwFirstRejection(
        await Promise.allSettled([runner.runStep(recentStep), runner.runStep(oldStep)]),
      );
      await removeJobsBeforeClose(...(await runner.waitingJobs()))();

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
        admin.pool.query(
          'select status,pause_reason,balance_resumed_at from automations where id=$1',
          [automationId],
        );
      expect((await status()).rows).toEqual([
        { status: 'paused', pause_reason: 'balance', balance_resumed_at: null },
      ]);

      clockNow = new Date(daytime.getTime() - HOUR);
      databaseNow = new Date(daytime.getTime() + 2 * HOUR);
      await creditThrough(runner, 'sms_credits', `behind-${automationId}`);

      expect((await status()).rows).toEqual([
        { status: 'active', pause_reason: null, balance_resumed_at: databaseNow },
      ]);
    });

    it('measures a balance resume after waiting for the workflow lock', async () => {
      await setCredits(0);
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        automationId,
        runIds: [runId],
      } = await dueRuns(send('transactional'), 1, 'active', contact);
      await runDueStep(runner, runId!);
      await admin.pool.query('update automation_runs set wake_at=$2 where id=$1', [
        runId,
        new Date(daytime.getTime() - 24 * HOUR + MINUTE),
      ]);

      const blocker = await admin.pool.connect();
      let pending: ReturnType<typeof creditThrough> | undefined;
      try {
        const {
          rows: [{ pid }],
        } = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
        await blocker.query('begin');
        await blocker.query('select id from automations where id=$1 for update', [automationId]);
        pending = creditThrough(runner, 'sms_credits', automationId);
        void pending.catch(() => undefined);
        await waitForBlocker(pid);
        databaseNow = new Date(daytime.getTime() + 2 * MINUTE);
        await blocker.query('commit');
        await pending;
        await runDueStep(runner, runId!);
        expect(sentFor(runId!)).toEqual([]);
        expect(await sendStep(runId!)).toEqual([
          expect.objectContaining({ outcome: 'skipped', skip_reason: 'no_credits' }),
        ]);
      } finally {
        blocker.release(true);
        await pending?.catch(() => undefined);
      }
    });

    it('sends a step that was still eligible when the balance resumed before the sweep', async () => {
      await setCredits(0);
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        automationId,
        runIds: [runId],
      } = await dueRuns(send('transactional'), 1, 'active', contact);
      await runDueStep(runner, runId!);
      await admin.pool.query('update automation_runs set wake_at=$2 where id=$1', [
        runId,
        new Date(daytime.getTime() - 24 * HOUR + MINUTE),
      ]);
      await creditThrough(runner, 'sms_credits', automationId);

      databaseNow = new Date(daytime.getTime() + 2 * MINUTE);
      await runDueStep(runner, runId!);

      expect(sentFor(runId!)).toHaveLength(1);
      expect(await sendStep(runId!)).toEqual([expect.objectContaining({ outcome: 'sent' })]);
    });

    it('checks quiet hours after the workflow version lock on the first send', async () => {
      const runner = await worker();
      const contact = await customer(true, runner);
      clockNow = new Date(opensAt.getTime() + 11 * HOUR);
      const {
        runIds: [runId],
      } = await dueRuns(send('marketing'), 1, 'active', contact);
      const id = runId!;
      const blocker = await admin.pool.connect();
      let pending: Promise<void> | undefined;
      try {
        const {
          rows: [{ pid }],
        } = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
        await blocker.query('begin');
        await blocker.query(
          'select id from automation_versions where id=(select version_id from automation_runs where id=$1) for update',
          [id],
        );
        pending = runDueStep(runner, id);
        void pending.catch(() => undefined);
        await waitForBlocker(pid);
        clockNow = new Date(clockNow.getTime() + HOUR);
        await blocker.query('rollback');
        await pending;

        expect(sentFor(id)).toEqual([]);
        expect(await sendStep(id)).toEqual([]);
        expect(await ledgerFor(id)).toEqual([]);
        expect(await run(id)).toMatchObject({ status: 'waiting', current_step_key: 'first' });
      } finally {
        blocker.release(true);
        await pending?.catch(() => undefined);
      }
    });

    it('keeps the workflow active when the old version stops at a short balance gate', async () => {
      await setCredits(0);
      const runner = await worker();
      const contact = await customer(true, runner);
      const {
        automationId,
        runIds: [runId],
      } = await dueRuns(send('transactional'), 1, 'active', contact);
      const id = runId!;
      const {
        rows: [newVersion],
      } = await admin.pool.query(
        `insert into automation_versions(id,store_id,automation_id,version,graph,published_at)
         select gen_random_uuid(), v.store_id, v.automation_id, v.version+1, v.graph, now()
         from automation_versions v join automation_runs r on r.version_id=v.id where r.id=$1
         returning id`,
        [id],
      );
      await admin.pool.query('update automations set published_version_id=$2 where id=$1', [
        automationId,
        newVersion.id,
      ]);

      const blocker = await admin.pool.connect();
      let pending: ReturnType<typeof runDueStep> | undefined;
      try {
        const {
          rows: [{ pid }],
        } = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
        await blocker.query('begin');
        await blocker.query(
          'update automation_versions set is_stopped=true where id=(select version_id from automation_runs where id=$1)',
          [id],
        );
        pending = runDueStep(runner, id);
        void pending.catch(() => undefined);
        await waitForBlocker(pid);
        await blocker.query('commit');
        await pending;
        expect(sentFor(id)).toEqual([]);
        expect(await sendStep(id)).toEqual([]);
        expect(await run(id)).toMatchObject({ status: 'exited', exit_reason: 'version_stopped' });
        const state = await admin.pool.query(
          'select status,pause_reason from automations where id=$1',
          [automationId],
        );
        expect(state.rows).toEqual([{ status: 'active', pause_reason: null }]);
      } finally {
        blocker.release(true);
        await pending?.catch(() => undefined);
      }
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
      let credit: Awaited<ReturnType<typeof setCredits>>;
      const lockWallet = WalletService.prototype.lockForReservation;
      vi.spyOn(WalletService.prototype, 'lockForReservation').mockImplementationOnce(
        async function (this: WalletService, ...args) {
          credit = await setCredits(1, clockNow);
          return lockWallet.apply(this, args);
        },
      );
      await runDueStep(runner, runId!);
      const status = () =>
        admin.pool.query('select status,pause_reason from automations where id=$1', [automationId]);
      expect((await status()).rows).toEqual([{ status: 'paused', pause_reason: 'balance' }]);
      const pause = await admin.pool.query(
        'select balance_pause_revision,updated_at from automations where id=$1',
        [automationId],
      );
      expect(pause.rows).toEqual([
        { balance_pause_revision: credit!.revision, updated_at: credit!.created_at },
      ]);

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
