import { beforeEach, describe, expect, it } from 'vitest';

import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';

import type { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type {
  AutomationRunsRepository,
  ClaimedRun,
  NewRunStep,
  RunChange,
  RunClaim,
} from './automation-runs.repository';
import { AutomationRunsService } from './automation-runs.service';

const STORE_ID = '0196f5a2-3c4d-7e8f-9a0b-1c2d3e4f5a01';
const RUN_ID = '0196f5a2-3c4d-7e8f-9a0b-1c2d3e4f5a02';
const CONTACT_ID = '0196f5a2-3c4d-7e8f-9a0b-1c2d3e4f5a03';
// Monday 16 November 2026, 11:00 in Dhaka (UTC+6).
const now = new Date('2026-11-16T05:00:00Z');
const claimedAt = new Date('2026-11-16T04:59:00Z');
const end: AutomationStep = { kind: 'exit' };
const wait: AutomationStep = {
  kind: 'wait',
  wait: { until: 'duration', minutes: 60 },
  next: 'end',
};

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

// One claimed run in memory. A move applies only under the claim it was given, as in Postgres.
class FakeRunsRepository {
  run!: ClaimedRun & { id: string; lastError?: string | null };
  steps: NewRunStep[] = [];

  async findRun(_storeId: string, runId: string) {
    return runId === this.run.id ? this.run : undefined;
  }

  async moveRun(_storeId: string, claim: RunClaim, change: RunChange) {
    const { run } = this;
    if (
      run.status !== 'running' ||
      run.currentStepKey !== claim.stepKey ||
      run.claimedAt?.getTime() !== claim.claimedAt.getTime()
    )
      return false;
    this.run = { ...run, ...change };
    return true;
  }

  async insertStep(_storeId: string, _runId: string, _contactId: string, step: NewRunStep) {
    this.steps.push(step);
  }
}

describe('AutomationRunsService', () => {
  let repository: FakeRunsRepository;
  let service: AutomationRunsService;

  function start(first: AutomationStep, change: Partial<ClaimedRun> = {}, runId = RUN_ID) {
    repository.run = {
      id: runId,
      contactId: CONTACT_ID,
      status: 'running',
      currentStepKey: 'first',
      claimedAt,
      wakeAt: claimedAt,
      attempts: 1,
      graph: graphWith(first),
      isVersionStopped: false,
      automationStatus: 'active',
      lastError: 'The SMS provider did not answer; trying again',
      ...change,
    };
    return service.continueRun(STORE_ID, { runId, stepKey: 'first', claimedAt });
  }

  beforeEach(() => {
    repository = new FakeRunsRepository();
    const transaction = { run: (_storeId: string, work: () => Promise<unknown>) => work() };
    service = new AutomationRunsService(
      repository as unknown as AutomationRunsRepository,
      transaction as unknown as StoreTransaction,
      { now: () => now } as Clock,
    );
  });

  it.each([
    [{ until: 'duration', minutes: 90 }, '2026-11-16T06:30:00.000Z'],
    [
      { until: 'event', event: 'tapped', stepKey: 'first', timeoutMinutes: 60 },
      '2026-11-16T06:00:00.000Z',
    ],
    [{ until: 'window_closing', minutesBefore: 60 }, '2026-11-16T05:00:00.000Z'],
  ] as const)('waits for %o until %s and moves to the next step', async (until, wakeAt) => {
    const next = await start({ kind: 'wait', wait: until, next: 'end' });

    expect(next).toBeUndefined();
    expect(repository.run).toMatchObject({
      status: 'waiting',
      currentStepKey: 'end',
      wakeAt: new Date(wakeAt),
      attempts: 0,
      lastError: null,
    });
    expect(repository.steps).toEqual([{ stepKey: 'first', kind: 'wait', outcome: 'scheduled' }]);
  });

  it('picks the same random path for the same run and splits many runs by the percentages', async () => {
    const split: AutomationStep = {
      kind: 'random_split',
      paths: [
        { percent: 30, next: 'yes' },
        { percent: 70, next: 'no' },
      ],
    };
    const first = await start(split);
    expect((await start(split))!.stepKey).toBe(first!.stepKey);
    expect(first).toEqual({ runId: RUN_ID, stepKey: first!.stepKey, claimedAt: now });

    let yes = 0;
    for (let index = 0; index < 1000; index++) {
      const runId = `0196f5a2-3c4d-7e8f-9a0b-${String(index).padStart(12, '0')}`;
      if ((await start(split, {}, runId))!.stepKey === 'yes') yes++;
    }
    expect(yes).toBeGreaterThan(250);
    expect(yes).toBeLessThan(350);
  });

  it('ends the run at an exit step', async () => {
    await start(end);

    expect(repository.run).toMatchObject({ status: 'done', finishedAt: now, lastError: null });
    expect(repository.steps).toEqual([{ stepKey: 'first', kind: 'exit', outcome: 'done' }]);
  });

  it.each([
    [{ isVersionStopped: true }, 'version_stopped'],
    [{ automationStatus: 'archived' }, 'archived'],
  ] as const)('exits a run when %o', async (change, exitReason) => {
    await start(wait, change);

    expect(repository.run).toMatchObject({ status: 'exited', exitReason, finishedAt: now });
    expect(repository.steps).toEqual([]);
  });

  it('holds a run of a paused workflow on its step with its wake time', async () => {
    await start(wait, { automationStatus: 'paused' });

    expect(repository.run).toMatchObject({
      status: 'waiting',
      currentStepKey: 'first',
      wakeAt: claimedAt,
    });
    expect(repository.steps).toEqual([]);
  });

  it('fails a run claimed more than 10 times without a committed step', async () => {
    await start(wait, { attempts: 10 });
    expect(repository.run.status).toBe('waiting');

    await start(wait, { attempts: 11 });
    expect(repository.run).toMatchObject({
      status: 'failed',
      lastError: 'This step failed too many times in a row',
    });
  });

  it.each([
    { kind: 'wait', wait: { until: 'time_of_day', time: '10:00' }, next: 'end' },
    {
      kind: 'condition',
      paths: [{ condition: { kind: 'placed_order' }, next: 'yes' }],
      elseNext: 'no',
    },
  ] as const)('fails a run on a step it cannot run yet: %o', async (step) => {
    await start(step);

    expect(repository.run).toMatchObject({
      status: 'failed',
      lastError: 'This step cannot run yet',
    });
  });

  it('changes nothing for a worker whose claim was taken over', async () => {
    await start(end);
    repository.run = { ...repository.run, status: 'running', claimedAt: now };
    repository.steps = [];

    const next = await service.continueRun(STORE_ID, {
      runId: RUN_ID,
      stepKey: 'first',
      claimedAt,
    });

    expect(next).toBeUndefined();
    expect(repository.run).toMatchObject({ status: 'running', claimedAt: now });
    expect(repository.steps).toEqual([]);
  });
});
