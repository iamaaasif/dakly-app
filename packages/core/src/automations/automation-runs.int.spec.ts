import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';
import { createDatabase } from '@dakly/db/client';

import { loadEnv } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { AutomationRunsModule } from './automation-runs.module';
import { ContinueAutomationRunJob } from './jobs/continue-automation-run.job';
import { WakeDueRunsJob } from './jobs/wake-due-runs.job';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const contactId = randomUUID();
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
      BullModule.forRoot({
        connection: toRedisConnection(loadEnv().REDIS_URL),
        prefix: `${loadEnv().QUEUE_PREFIX}-${randomUUID()}`,
      }),
      BullModule.registerQueue({ name: QUEUES.workflow }),
    ],
    providers: [WakeDueRunsJob, ContinueAutomationRunJob],
  })(TestModule);
  const application = await NestFactory.createApplicationContext(TestModule, { logger: false });
  applications.push(application);
  return {
    sweep: () => application.get(WakeDueRunsJob).handle({}),
    runStep: (data: StepJobData) => application.get(ContinueAutomationRunJob).handle(data),
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
    "insert into automations(id,store_id,name,trigger_type,draft_graph,status) values($1,$2,'স্বাগতম','consent_given','{}',$3)",
    [automationId, storeId, status],
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
  });

  afterAll(async () => {
    try {
      await Promise.all(applications.map((application) => application.close()));
      await admin.pool.query('delete from automation_runs where store_id=$1', [storeId]);
      await admin.pool.query('update automations set published_version_id=null where store_id=$1', [
        storeId,
      ]);
      await admin.pool.query('delete from automation_versions where store_id=$1', [storeId]);
      await admin.pool.query('delete from automations where store_id=$1', [storeId]);
      await admin.pool.query('delete from contacts where store_id=$1', [storeId]);
      await admin.pool.query('delete from stores where id=$1', [storeId]);
    } finally {
      await admin.pool.end();
    }
  });

  it('claims a due run once even with two sweepers at the same moment', async () => {
    // More than one claim batch, so both sweepers loop over the same rows.
    const { runIds } = await dueRuns(wait, 150);
    const [first, second] = [await worker(), await worker()];

    await Promise.all([first.sweep(), second.sweep()]);

    const queued = [...(await queuedSteps(first.queue)), ...(await queuedSteps(second.queue))]
      .map((step) => step.automationRunId)
      .filter((runId) => runIds.includes(runId));
    expect(queued.sort()).toEqual([...runIds].sort());
    const claims = await admin.pool.query(
      'select count(*)::int as count from automation_runs where id=any($1::uuid[]) and status=$2 and attempts=1',
      [runIds, 'running'],
    );
    expect(claims.rows).toEqual([{ count: 150 }]);
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
      attempts: 2,
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

    await admin.pool.query("update automations set status='active' where id=$1", [automationId]);
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
});
