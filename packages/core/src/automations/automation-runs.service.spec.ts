import { beforeEach, describe, expect, it } from 'vitest';

import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';

import type { ContactsService } from '../contacts/contacts.service';
import type { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { SegmentsService } from '../segments/segments.service';
import type { SendPolicyService } from '../sending/send-policy.service';
import type { StoresService } from '../stores/stores.service';
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
const SEGMENT_ID = '0196f5a2-3c4d-7e8f-9a0b-1c2d3e4f5a04';
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

  tappedStepKeys: string[] = [];

  async startWork(storeId: string, claim: RunClaim, claimedAt: Date) {
    if (!(await this.moveRun(storeId, claim, { status: 'running', claimedAt }))) return undefined;
    this.run = { ...this.run, attempts: this.run.attempts + 1 };
    return { attempts: this.run.attempts, claimedAt };
  }

  async insertStep(_storeId: string, _runId: string, _contactId: string, step: NewRunStep) {
    this.steps.push(step);
  }

  async listTappedStepKeys() {
    return this.tappedStepKeys;
  }
}

describe('AutomationRunsService', () => {
  let repository: FakeRunsRepository;
  let tags: string[];
  let segmentMembers: string[];
  let service: AutomationRunsService;

  function start(first: AutomationStep, change: Partial<ClaimedRun> = {}, runId = RUN_ID) {
    repository.run = {
      id: runId,
      contactId: CONTACT_ID,
      status: 'running',
      currentStepKey: 'first',
      claimedAt,
      wakeAt: claimedAt,
      attempts: 0,
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
    tags = [];
    segmentMembers = [];
    const contacts = {
      findTags: async () => tags,
      changeTag: async (
        _storeId: string,
        _contactId: string,
        { tag, change }: { tag: string; change: 'add' | 'remove' },
      ) => {
        tags = change === 'add' ? [...new Set([...tags, tag])] : tags.filter((t) => t !== tag);
      },
    };
    const segments = {
      hasContact: async (_storeId: string, segmentId: string, contactId: string) =>
        segmentId === SEGMENT_ID && segmentMembers.includes(contactId),
    };
    const sendPolicy = { check: async () => ({ action: 'send' }) };
    const stores = { sendingSettings: async () => ({ timeZone: 'Asia/Dhaka' }) };
    const transaction = { run: (_storeId: string, work: () => Promise<unknown>) => work() };
    service = new AutomationRunsService(
      repository as unknown as AutomationRunsRepository,
      transaction as unknown as StoreTransaction,
      { now: () => now } as Clock,
      contacts as unknown as ContactsService,
      segments as unknown as SegmentsService,
      sendPolicy as unknown as SendPolicyService,
      stores as unknown as StoresService,
    );
  });

  it.each([
    [{ until: 'duration', minutes: 90 }, '2026-11-16T06:30:00.000Z'],
    [
      { until: 'event', event: 'tapped', stepKey: 'first', timeoutMinutes: 60 },
      '2026-11-16T06:00:00.000Z',
    ],
    [{ until: 'window_closing', minutesBefore: 60 }, '2026-11-16T05:00:00.000Z'],
    [{ until: 'time_of_day', time: '12:30' }, '2026-11-16T06:30:00.000Z'],
    [{ until: 'time_of_day', time: '10:00' }, '2026-11-17T04:00:00.000Z'],
    [{ until: 'time_of_day', time: '11:00' }, '2026-11-16T05:00:00.000Z'],
    [{ until: 'weekday', weekday: 'wed', time: '09:00' }, '2026-11-18T03:00:00.000Z'],
    [{ until: 'weekday', weekday: 'mon', time: '10:00' }, '2026-11-23T04:00:00.000Z'],
    [{ until: 'weekday', weekday: 'mon', time: '20:00' }, '2026-11-16T14:00:00.000Z'],
  ] as const)(
    'waits for %o until %s in store time and moves to the next step',
    async (until, wakeAt) => {
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
    },
  );

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

  it('fails a run whose step job started more than 10 times without a committed step', async () => {
    await start(wait, { attempts: 9 });
    expect(repository.run.status).toBe('waiting');

    await start(wait, { attempts: 10 });
    expect(repository.run).toMatchObject({
      status: 'failed',
      lastError: 'This step failed too many times in a row',
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
  describe('conditions and exits', () => {
    const condition: AutomationStep = {
      kind: 'condition',
      paths: [
        { condition: { kind: 'in_segment', segmentId: SEGMENT_ID }, next: 'yes' },
        { condition: { kind: 'has_tag', tag: 'vip' }, next: 'no' },
      ],
      elseNext: 'end',
    };
    const withGraph = (graph: Partial<AutomationGraph>) => ({
      graph: { ...graphWith(wait), ...graph },
    });

    it('takes the first path that holds, then a later one, then Else', async () => {
      tags = ['vip'];
      segmentMembers = [CONTACT_ID];
      expect(await start(condition)).toEqual({ runId: RUN_ID, stepKey: 'yes', claimedAt: now });
      segmentMembers = [];
      expect(await start(condition)).toMatchObject({ stepKey: 'no' });
      tags = [];
      expect(await start(condition)).toMatchObject({ stepKey: 'end' });
      expect(repository.steps.map((step) => step.outcome)).toEqual(['path_1', 'path_2', 'else']);
    });

    it('holds reachable when the gate would send a transactional message on the channel', async () => {
      const reachable: AutomationStep = {
        kind: 'condition',
        paths: [{ condition: { kind: 'reachable', channel: 'sms' }, next: 'yes' }],
        elseNext: 'end',
      };
      expect(await start(reachable)).toMatchObject({ stepKey: 'yes' });
    });

    it('never holds a reply or an order, which cannot happen yet', async () => {
      const notYet: AutomationStep = {
        kind: 'condition',
        paths: [
          { condition: { kind: 'replied', stepKey: 'first', buttonKeys: [] }, next: 'yes' },
          { condition: { kind: 'placed_order' }, next: 'no' },
        ],
        elseNext: 'end',
      };
      expect(await start(notYet)).toMatchObject({ stepKey: 'end' });
    });

    it('exits on the goal before an exit condition, then on a failing workflow filter', async () => {
      tags = ['ordered', 'vip'];
      const goals = {
        goal: { kind: 'got_tag', tag: 'ordered' },
        exitConditions: [{ kind: 'got_tag', tag: 'vip' }],
      } as const;
      await start(wait, withGraph({ goal: goals.goal, exitConditions: [...goals.exitConditions] }));
      expect(repository.run).toMatchObject({ status: 'exited', exitReason: 'goal' });

      await start(wait, withGraph({ exitConditions: [...goals.exitConditions] }));
      expect(repository.run).toMatchObject({ status: 'exited', exitReason: 'exit_condition' });

      await start(wait, withGraph({ workflowFilters: [{ kind: 'has_tag', tag: 'gold' }] }));
      expect(repository.run).toMatchObject({ status: 'exited', exitReason: 'workflow_filter' });
      expect(repository.steps).toEqual([]);
    });
  });

  it('fails a run on a send step, which is not built yet', async () => {
    await start({
      kind: 'send',
      category: 'marketing',
      channels: ['sms'],
      message: { text: 'নতুন কালেকশন এসেছে', buttons: [] },
      ifNotReachable: 'skip',
      reviewBeforeSending: false,
      next: 'end',
    });

    expect(repository.run).toMatchObject({
      status: 'failed',
      lastError: 'This step cannot run yet',
    });
  });

  describe('action', () => {
    const addVip: AutomationStep = {
      kind: 'action',
      action: { action: 'add_tag', tag: 'vip' },
      next: 'end',
    };

    it('adds and removes a tag on the contact with the step', async () => {
      await start(addVip);
      expect(tags).toEqual(['vip']);
      expect(repository.steps).toEqual([{ stepKey: 'first', kind: 'action', outcome: 'done' }]);

      await start({ kind: 'action', action: { action: 'remove_tag', tag: 'vip' }, next: 'end' });
      expect(tags).toEqual([]);
    });

    it('leaves the tags alone for a worker whose claim was taken over meanwhile', async () => {
      // The stale worker read the run just before another sweep claimed it again.
      const read = repository.findRun.bind(repository);
      repository.findRun = async (storeId: string, runId: string) => {
        const current = await read(storeId, runId);
        repository.run = { ...repository.run, claimedAt: now };
        return current && { ...current };
      };

      await start(addVip);

      expect(tags).toEqual([]);
      expect(repository.steps).toEqual([]);
    });

    it('fails the run on an action with no owning service yet', async () => {
      await start({
        kind: 'action',
        action: { action: 'create_task', title: 'ফোন করুন' },
        next: 'end',
      });

      expect(repository.run).toMatchObject({
        status: 'failed',
        lastError: 'This action is not available yet',
      });
    });
  });
});
