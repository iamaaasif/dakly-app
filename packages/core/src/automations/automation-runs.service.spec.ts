import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';

import type { ContactsService } from '../contacts/contacts.service';
import type { LinksService, NewTrackedLink } from '../links/links.service';
import type {
  MessagingService,
  OutgoingMessage,
  PreparedSms,
} from '../messaging/messaging.service';
import * as env from '../platform/config/env';
import type { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import type { ErrorReporter } from '../platform/logging/error-reporter';
import { runWithJobContext } from '../platform/logging/job-context';
import type { SegmentsService } from '../segments/segments.service';
import type { SendDecision, SendPolicyService, SkipReason } from '../sending/send-policy.service';
import type { StoresService } from '../stores/stores.service';
import type { WalletService } from '../wallets/wallet.service';
import { AutomationConditionsService } from './automation-conditions.service';
import type {
  AutomationRunsRepository,
  ClaimedRun,
  NewRunStep,
  RunChange,
  RunClaim,
  RunStepChange,
} from './automation-runs.repository';
import { AutomationRunsService } from './automation-runs.service';
import { AutomationSendRetryService } from './automation-send-retry.service';
import { AutomationSmsDeliveryService } from './automation-sms-delivery.service';

const STORE_ID = '0196f5a2-3c4d-7e8f-9a0b-1c2d3e4f5a01';
const RUN_ID = '0196f5a2-3c4d-7e8f-9a0b-1c2d3e4f5a02';
const CONTACT_ID = '0196f5a2-3c4d-7e8f-9a0b-1c2d3e4f5a03';
const SEGMENT_ID = '0196f5a2-3c4d-7e8f-9a0b-1c2d3e4f5a04';
const HOUR = 60 * 60 * 1000;
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
  steps: (NewRunStep & Pick<RunStepChange, 'providerMessageId'>)[] = [];

  constructor(readonly schedulerTime: () => Promise<Date>) {}

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

  beforeDispatchLock: () => void = () => undefined;

  async moveRunIfLive(storeId: string, claim: RunClaim, change: RunChange, gate?: 'dispatch') {
    if (gate === 'dispatch') this.beforeDispatchLock();
    const { automationStatus, isVersionStopped } = this.run;
    if (automationStatus !== 'active' || isVersionStopped) return false;
    return this.moveRun(storeId, claim, change);
  }

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

  async findSendingStep(_storeId: string, _runId: string, stepKey: string) {
    const step = this.steps.find((row) => row.stepKey === stepKey && row.outcome === 'sending');
    return (
      step && {
        id: step.id!,
        firstTriedAt: step.firstTriedAt ?? null,
        latestDispatchAt: step.sentAt ?? null,
        optOutUrl: step.optOutUrl ?? null,
        destinationHash: step.destinationHash ?? null,
        providerMessageId: step.providerMessageId ?? null,
      }
    );
  }

  async changeStep(_storeId: string, _runId: string, stepKey: string, change: RunStepChange) {
    const retryDetails =
      change.outcome === 'sending' ? {} : { destinationHash: null, optOutUrl: null };
    this.steps = this.steps.map((row) =>
      row.stepKey === stepKey ? { ...row, ...change, ...retryDetails } : row,
    );
  }
}

const send: AutomationStep = {
  kind: 'send',
  category: 'marketing',
  channels: ['whatsapp', 'sms'],
  message: { text: 'নতুন কালেকশন এসেছে', buttons: [] },
  ifNotReachable: 'skip',
  reviewBeforeSending: false,
  next: 'end',
};
const optOutUrl = 'https://links.dakly.test/s/Ab3dE6gH';

describe('AutomationRunsService', () => {
  const jobId = 'workflow-job-lease-1';
  const reportJob = vi.fn();
  let repository: FakeRunsRepository;
  let tags: string[];
  let segmentMembers: string[];
  let clockNow: Date;
  let databaseNow: Date | undefined;
  let decision: SendDecision;
  let recheckReason: SkipReason | undefined;
  let recheckDefer: Date | undefined;
  let duringRecheck: () => void;
  let duringPhoneRead: () => void;
  let finalQuietUntil: Date | undefined;
  let contactPhone: string;
  let sent: OutgoingMessage[];
  let senderLookupError: Error | undefined;
  let providerError: Error | undefined;
  let schedulerUnavailable: 'during submission' | 'after authorization' | undefined;
  let submissionChecked: boolean;
  let submissionCommitted: boolean;
  let balance: number;
  let ledger: { key: string; kind: 'reserve' | 'charge' | 'release'; quantity: number }[];
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
    return service.continueRun(
      STORE_ID,
      { runId, stepKey: 'first', claimedAt },
      { kind: 'system' },
    );
  }

  beforeEach(() => {
    reportJob.mockClear();
    vi.spyOn(env, 'loadEnv').mockReturnValue({
      CODE_HASH_KEY: Buffer.alloc(32, 5).toString('base64'),
    } as env.Env);
    repository = new FakeRunsRepository(async () => {
      const during = schedulerUnavailable === 'during submission' && submissionChecked;
      const after = schedulerUnavailable === 'after authorization' && submissionCommitted;
      if ((during || after) && !sent.length)
        throw new Error('Scheduler clock unavailable before provider dispatch');
      return databaseNow ?? clockNow;
    });
    tags = [];
    segmentMembers = [];
    clockNow = now;
    databaseNow = undefined;
    decision = { action: 'send' };
    recheckReason = undefined;
    recheckDefer = undefined;
    duringRecheck = () => undefined;
    duringPhoneRead = () => undefined;
    finalQuietUntil = undefined;
    contactPhone = '01712345678';
    sent = [];
    providerError = undefined;
    schedulerUnavailable = undefined;
    submissionChecked = false;
    submissionCommitted = false;
    senderLookupError = undefined;
    balance = 10;
    ledger = [];
    // Reservations by key, as the ledger keeps them; a repeated key changes nothing.
    const wallets = {
      lockForReservation: async () => undefined,
      reserve: async (
        _storeId: string,
        { quantity, idempotencyKey }: { quantity: number; idempotencyKey: string },
      ) => {
        if (ledger.some((entry) => entry.key === idempotencyKey)) return;
        if (balance < quantity)
          throw new AppError('WALLET_BALANCE_TOO_LOW', { status: 409, message: 'Too low' });
        balance -= quantity;
        ledger.push({ key: idempotencyKey, kind: 'reserve', quantity });
      },
      findByIdempotencyKey: async (_storeId: string, key: string) =>
        ledger.some((entry) => entry.key === key)
          ? { entryId: key, balanceQuantity: balance }
          : undefined,
      charge: async (
        _storeId: string,
        {
          reservationId,
          quantity,
          idempotencyKey,
        }: { reservationId: string; quantity: number; idempotencyKey: string },
      ) => {
        balance += ledger.find((entry) => entry.key === reservationId)!.quantity - quantity;
        ledger.push({ key: idempotencyKey, kind: 'charge', quantity });
      },
      release: async (
        _storeId: string,
        { reservationId, idempotencyKey }: { reservationId: string; idempotencyKey: string },
      ) => {
        const reserved = ledger.find((entry) => entry.key === reservationId)!.quantity;
        balance += reserved;
        ledger.push({ key: idempotencyKey, kind: 'release', quantity: reserved });
      },
    };
    const contacts = {
      findTags: async () => tags,
      findRecipients: async () => [{ phone: contactPhone }],
      getPhoneForSend: async () => {
        duringPhoneRead();
        return contactPhone;
      },
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
    const recheck = (): SendDecision => {
      duringRecheck();
      if (recheckReason) return { action: 'skip', reason: recheckReason };
      return recheckDefer ? { action: 'defer', until: recheckDefer } : { action: 'send' };
    };
    const sendPolicy = {
      check: async () => decision,
      checkForSend: async () => {
        submissionChecked = true;
        return { decision, destination: contactPhone, at: clockNow };
      },
      recheckRetryRecipient: async () => ({ decision: recheck(), at: clockNow }),
      prepareMarketingRetryCheck: async () => () => ({
        decision: finalQuietUntil
          ? { action: 'defer' as const, until: finalQuietUntil }
          : { action: 'send' as const },
        at: clockNow,
      }),
    };
    const stores = { sendingSettings: async () => ({ timeZone: 'Asia/Dhaka' }) };
    // Like the SMS driver: the same operation key sends nothing new.
    const messaging = {
      prepareSender: async (storeId: string) => {
        if (senderLookupError) throw senderLookupError;
        return { storeId, name: undefined };
      },
      prepareSms: async (storeId: string, contactId: string) => ({
        storeId,
        contactId,
        to: contactPhone,
        sender: undefined,
      }),
      send: async (_storeId: string, message: OutgoingMessage, prepared: PreparedSms) => {
        if (message.destination !== undefined && message.destination !== prepared.to)
          throw new AppError('MESSAGING_DESTINATION_CHANGED', {
            status: 409,
            message: "The contact's phone changed after this message was decided",
          });
        if (providerError) throw providerError;
        if (!sent.some((earlier) => earlier.operationKey === message.operationKey))
          sent.push({ ...message, destination: prepared.to });
        return { providerMessageId: 'sms-1', parts: 1, credits: 1 };
      },
    };
    const links = {
      create: async (_storeId: string, asked: NewTrackedLink[]) =>
        asked.map(() => ({ id: 'link-1', code: 'Ab3dE6gH', url: optOutUrl })),
      optOutUrl: (code: string) => `https://links.dakly.test/s/${code}`,
    };
    const transaction = {
      run: async (_storeId: string, work: () => Promise<unknown>) => {
        const result = await work();
        if (submissionChecked) submissionCommitted = true;
        return result;
      },
    };
    const conditions = new AutomationConditionsService(
      segments as unknown as SegmentsService,
      sendPolicy as unknown as SendPolicyService,
      contacts as unknown as ContactsService,
      repository as unknown as AutomationRunsRepository,
    );
    service = new AutomationRunsService(
      repository as unknown as AutomationRunsRepository,
      transaction as unknown as StoreTransaction,
      contacts as unknown as ContactsService,
      sendPolicy as unknown as SendPolicyService,
      stores as unknown as StoresService,
      messaging as unknown as MessagingService,
      links as unknown as LinksService,
      wallets as unknown as WalletService,
      new AutomationSmsDeliveryService(
        messaging as unknown as MessagingService,
        wallets as unknown as WalletService,
        { reportJob } as unknown as ErrorReporter,
        repository as unknown as AutomationRunsRepository,
      ),
      new AutomationSendRetryService(
        repository as unknown as AutomationRunsRepository,
        transaction as unknown as StoreTransaction,
        stores as unknown as StoresService,
        sendPolicy as unknown as SendPolicyService,
        contacts as unknown as ContactsService,
        conditions,
      ),
      conditions,
    );
  });

  afterEach(() => vi.restoreAllMocks());

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

    const next = await service.continueRun(
      STORE_ID,
      { runId: RUN_ID, stepKey: 'first', claimedAt },
      { kind: 'system' },
    );

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

  describe('send', () => {
    it('sends SMS after the gate with the opt-out link and the step operation key', async () => {
      const next = await start(send);

      expect(sent).toEqual([
        {
          channel: 'sms',
          contactId: CONTACT_ID,
          body: `নতুন কালেকশন এসেছে\n${optOutUrl}`,
          operationKey: `run:${RUN_ID}:first`,
          destination: '01712345678',
        },
      ]);
      expect(next).toEqual({ runId: RUN_ID, stepKey: 'end', claimedAt: now });
      expect(repository.steps).toEqual([
        expect.objectContaining({
          stepKey: 'first',
          kind: 'send',
          category: 'marketing',
          channel: 'sms',
          optOutUrl: null,
          destinationHash: null,
          outcome: 'sent',
          providerMessageId: 'sms-1',
          sentAt: now,
        }),
      ]);
    });

    it('dispatches without another clock read after authorizing submission', async () => {
      schedulerUnavailable = 'after authorization';

      await start(send);

      expect(submissionCommitted).toBe(true);
      expect(sent).toHaveLength(1);
      expect(repository.steps).toEqual([expect.objectContaining({ outcome: 'sent' })]);
      expect(ledger.map((entry) => entry.kind)).toEqual(['reserve', 'charge']);
    });

    it('does not call the provider if the final authorization clock read fails', async () => {
      schedulerUnavailable = 'during submission';

      await expect(start(send)).rejects.toThrow('Scheduler clock unavailable');
      expect(sent).toEqual([]);
      expect(repository.steps).toEqual([]);
      expect(ledger).toEqual([]);
    });

    it('lets the replacement worker reserve once after an authorization failure', async () => {
      schedulerUnavailable = 'during submission';
      await expect(start(send)).rejects.toThrow('Scheduler clock unavailable');
      schedulerUnavailable = undefined;
      repository.run = { ...repository.run, status: 'running', claimedAt: now };
      await service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: now },
        { kind: 'system' },
      );
      expect(sent).toHaveLength(1);
      expect(repository.steps).toEqual([expect.objectContaining({ outcome: 'sent' })]);
      expect(ledger.map((entry) => entry.kind)).toEqual(['reserve', 'charge']);
    });

    it('sends a transactional SMS without an opt-out link', async () => {
      await start({ ...send, category: 'transactional' });

      expect(sent.map((message) => message.body)).toEqual(['নতুন কালেকশন এসেছে']);
    });

    it('waits for the end of quiet hours without writing a step', async () => {
      decision = { action: 'defer', until: new Date('2026-11-17T03:00:00Z') };

      await start(send);

      expect(sent).toEqual([]);
      expect(repository.run).toMatchObject({
        status: 'waiting',
        currentStepKey: 'first',
        wakeAt: new Date('2026-11-17T03:00:00Z'),
      });
      expect(repository.steps).toEqual([]);
    });

    it('skips an unreachable contact and goes on, or exits when the step says so', async () => {
      decision = { action: 'skip', reason: 'no_consent' };
      expect(await start(send)).toMatchObject({ stepKey: 'end' });

      repository.steps = [];
      await start({ ...send, ifNotReachable: 'exit' });
      expect(repository.run).toMatchObject({ status: 'exited', exitReason: 'not_reachable' });
      expect(repository.steps).toEqual([
        expect.objectContaining({ outcome: 'skipped', skipReason: 'no_consent' }),
      ]);
      expect(sent).toEqual([]);
    });

    it('skips a step with no SMS channel as a closed window', async () => {
      await start({ ...send, channels: ['messenger'] });

      expect(repository.steps).toEqual([
        expect.objectContaining({ outcome: 'skipped', skipReason: 'window_closed' }),
      ]);
    });

    it('does not expire a send early when the worker clock is fast', async () => {
      databaseNow = new Date(claimedAt.getTime() + 24 * HOUR - 60_000);
      clockNow = new Date(claimedAt.getTime() + 24 * HOUR + 60_000);

      await start(send);

      expect(sent).toHaveLength(1);
      expect(repository.steps).toEqual([expect.objectContaining({ outcome: 'sent' })]);
    });

    it('starts the retry deadline on the sweep clock while keeping the send time', async () => {
      databaseNow = now;
      clockNow = new Date(now.getTime() - 6 * 60_000);
      providerError = new Error('Connection closed before the provider replied');

      await runWithJobContext(() => start(send), jobId);

      expect(repository.steps).toEqual([
        expect.objectContaining({ outcome: 'sending', sentAt: clockNow, firstTriedAt: now }),
      ]);
      expect(repository.run).toMatchObject({
        status: 'waiting',
        wakeAt: new Date(now.getTime() + 60_000),
      });
    });

    it('skips an expired send without a sender lookup when the worker clock is slow', async () => {
      databaseNow = new Date(claimedAt.getTime() + 24 * HOUR + 60_000);
      clockNow = new Date(claimedAt.getTime() + 24 * HOUR - 60_000);
      senderLookupError = new Error('Sender lookup unavailable');

      expect(await start(send)).toMatchObject({ stepKey: 'end' });

      expect(repository.steps).toEqual([expect.objectContaining({ outcome: 'late' })]);
      expect(sent).toEqual([]);
      expect(ledger).toEqual([]);
    });

    it('skips a send that was due more than a day before it runs', async () => {
      clockNow = new Date(claimedAt.getTime() + 25 * HOUR);

      await start(send);

      expect(sent).toEqual([]);
      expect(repository.steps).toEqual([expect.objectContaining({ outcome: 'late' })]);
    });

    it('retries a temporary error with back-off, then sends the same text once', async () => {
      providerError = new Error('connection reset');
      await runWithJobContext(() => start(send), jobId);
      expect(repository.run).toMatchObject({
        status: 'waiting',
        currentStepKey: 'first',
        wakeAt: new Date(now.getTime() + 60 * 1000),
        lastError: 'The SMS provider did not answer; trying again',
      });

      expect(reportJob).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ errorCode: 'INTERNAL_ERROR' }),
        jobId,
        { runId: RUN_ID, stepKey: 'first' },
      );

      // The gate's cap is not asked again for a send already counted.
      decision = { action: 'skip', reason: 'frequency_cap' };
      providerError = undefined;
      clockNow = new Date(now.getTime() + 2 * 60 * 1000);
      repository.run = { ...repository.run, status: 'running', claimedAt: clockNow };
      await service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: clockNow },
        { kind: 'system' },
      );

      expect(sent.map((message) => message.body)).toEqual([`নতুন কালেকশন এসেছে\n${optOutUrl}`]);
      expect(repository.steps).toEqual([
        expect.objectContaining({ outcome: 'sent', sentAt: clockNow }),
      ]);
      expect(repository.run).toMatchObject({ currentStepKey: 'end', lastError: null });
    });

    it('reports an uncertain response even when the settlement clock is unavailable', async () => {
      providerError = new Error('connection reset');
      schedulerUnavailable = 'after authorization';

      await expect(runWithJobContext(() => start(send), jobId)).rejects.toThrow(
        'Scheduler clock unavailable before provider dispatch',
      );

      expect(reportJob).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ errorCode: 'INTERNAL_ERROR' }),
        jobId,
        { runId: RUN_ID, stepKey: 'first' },
      );
    });

    it('rejects an uncertain response report without a worker job id', async () => {
      providerError = new Error('connection reset');

      await expect(start(send)).rejects.toThrow('Workflow SMS reporting requires a worker job ID');

      expect(reportJob).not.toHaveBeenCalled();
      expect(repository.steps).toEqual([expect.objectContaining({ outcome: 'sending' })]);
    });

    it('keeps the original cap time when a slower worker settles a retry', async () => {
      providerError = new Error('connection reset');
      await runWithJobContext(() => start(send), jobId);
      providerError = undefined;
      clockNow = new Date(now.getTime() - 50);
      databaseNow = now;
      repository.run = { ...repository.run, status: 'running', claimedAt: clockNow };

      await service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: clockNow },
        { kind: 'system' },
      );

      expect(sent).toHaveLength(1);
      expect(repository.steps).toEqual([
        expect.objectContaining({ outcome: 'sent', firstTriedAt: now, sentAt: now }),
      ]);
    });

    it('holds a resend when the workflow pauses before the dispatch lock', async () => {
      providerError = new Error('connection reset');
      await runWithJobContext(() => start(send), jobId);
      providerError = undefined;
      repository.run = { ...repository.run, status: 'running', claimedAt: now };
      repository.beforeDispatchLock = () => {
        repository.run = { ...repository.run, automationStatus: 'paused' };
      };

      await service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: now },
        { kind: 'system' },
      );

      expect(sent).toEqual([]);
      expect(repository.run).toMatchObject({ status: 'waiting', currentStepKey: 'first' });
      expect(repository.steps).toEqual([expect.objectContaining({ outcome: 'sending' })]);
      expect(ledger).toEqual([expect.objectContaining({ kind: 'reserve' })]);
    });

    it('ends an uncertain send when the goal is reached during the resend check', async () => {
      providerError = new Error('connection reset');
      await runWithJobContext(
        () =>
          start(send, { graph: { ...graphWith(send), goal: { kind: 'got_tag', tag: 'paid' } } }),
        jobId,
      );
      providerError = undefined;
      repository.run = { ...repository.run, status: 'running', claimedAt: now };
      duringRecheck = () => {
        tags = ['paid'];
      };

      await service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: now },
        { kind: 'system' },
      );

      expect(sent).toEqual([]);
      expect(repository.run).toMatchObject({ status: 'exited', exitReason: 'goal' });
      expect(repository.steps).toEqual([expect.objectContaining({ outcome: 'unconfirmed' })]);
      expect(ledger).toEqual([expect.objectContaining({ kind: 'reserve' })]);
    });

    it('fails the step before a resend when consent was withdrawn meanwhile', async () => {
      providerError = new Error('connection reset');
      await runWithJobContext(() => start(send), jobId);
      providerError = undefined;
      recheckReason = 'no_consent';
      repository.run = { ...repository.run, status: 'running', claimedAt: now };

      await service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: now },
        { kind: 'system' },
      );

      expect(sent).toEqual([]);
      expect(repository.steps).toEqual([
        expect.objectContaining({ outcome: 'unconfirmed', skipReason: 'no_consent' }),
      ]);
      expect(repository.run).toMatchObject({ currentStepKey: 'end' });
    });

    it('waits out quiet hours before a resend, then sends after they end', async () => {
      // 20:50 in Dhaka: the provider does not answer.
      clockNow = new Date('2026-11-16T14:50:00Z');
      providerError = new Error('connection reset');
      await runWithJobContext(() => start(send, { wakeAt: clockNow }), jobId);
      expect(reportJob).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ errorCode: 'INTERNAL_ERROR' }),
        jobId,
        { runId: RUN_ID, stepKey: 'first' },
      );
      providerError = undefined;

      // 02:00: inside quiet hours, so the run waits until 09:00 and the row stays sending.
      clockNow = new Date('2026-11-16T20:00:00Z');
      recheckDefer = new Date('2026-11-17T03:00:00Z');
      repository.run = { ...repository.run, status: 'running', claimedAt: clockNow };
      await service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: clockNow },
        { kind: 'system' },
      );
      expect(repository.run).toMatchObject({ status: 'waiting', wakeAt: recheckDefer });
      expect(repository.steps).toEqual([expect.objectContaining({ outcome: 'sending' })]);
      expect(sent).toEqual([]);

      clockNow = new Date('2026-11-17T03:01:00Z');
      recheckDefer = undefined;
      repository.run = { ...repository.run, status: 'running', claimedAt: clockNow };
      await service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: clockNow },
        { kind: 'system' },
      );
      expect(repository.steps).toEqual([expect.objectContaining({ outcome: 'sent' })]);
      expect(sent).toHaveLength(1);
    });

    it('ends a resend to a contact whose phone no longer matches the saved hash as unconfirmed', async () => {
      providerError = new Error('connection reset');
      await runWithJobContext(() => start(send), jobId);
      expect(repository.steps).toEqual([
        expect.objectContaining({ destinationHash: expect.stringMatching(/^[a-f0-9]{64}$/u) }),
      ]);
      providerError = undefined;
      contactPhone = '01812345678';
      repository.run = { ...repository.run, status: 'running', claimedAt: now };

      await service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: now },
        { kind: 'system' },
      );

      expect(sent).toEqual([]);
      expect(repository.run.lastError).toContain("The contact's phone changed");
      expect(repository.run.lastError).toContain('credits stay reserved');
      expect(repository.steps).toEqual([
        expect.objectContaining({ outcome: 'unconfirmed', destinationHash: null, optOutUrl: null }),
      ]);
      expect(ledger.map((entry) => entry.kind)).toEqual(['reserve']);
    });

    it('leaves a legacy send with incomplete retry details unconfirmed', async () => {
      repository.steps = [{ id: 'legacy', stepKey: 'first', kind: 'send', outcome: 'sending' }];

      await start(send);

      expect(sent).toEqual([]);
      expect(repository.run).toMatchObject({ status: 'failed', currentStepKey: 'first' });
      expect(repository.run.lastError).toContain('credits stay reserved');
      expect(repository.steps).toEqual([
        expect.objectContaining({ id: 'legacy', outcome: 'unconfirmed' }),
      ]);
      expect(ledger).toEqual([]);
    });

    it.each([
      'empty URL',
      'invalid URL',
      'transactional URL',
      'no first attempt time',
      'future first attempt time',
      'known provider ID',
    ] as const)('does not submit an uncertain send again with %s', async (badData) => {
      providerError = new Error('connection reset');
      await runWithJobContext(
        () =>
          start(badData === 'transactional URL' ? { ...send, category: 'transactional' } : send),
        jobId,
      );
      const previous = repository.steps[0]!;
      if (badData === 'empty URL') previous.optOutUrl = '';
      if (badData === 'invalid URL') previous.optOutUrl = 'https://links.dakly.test/other';
      if (badData === 'transactional URL') previous.optOutUrl = optOutUrl;
      if (badData === 'no first attempt time') delete previous.firstTriedAt;
      if (badData === 'future first attempt time')
        previous.firstTriedAt = new Date(now.getTime() + HOUR);
      if (badData === 'known provider ID') previous.providerMessageId = 'accepted-before-crash';
      providerError = undefined;
      repository.run = { ...repository.run, status: 'running', claimedAt: now };

      await service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: now },
        { kind: 'system' },
      );

      expect(sent).toEqual([]);
      expect(repository.steps).toEqual([
        expect.objectContaining({
          outcome: 'unconfirmed',
          destinationHash: null,
          optOutUrl: null,
        }),
      ]);
      expect(ledger.map((entry) => entry.kind)).toEqual(['reserve']);
      if (badData === 'known provider ID')
        expect(repository.steps[0]?.providerMessageId).toBe('accepted-before-crash');
    });

    it('does not send when the final phone lookup crosses the retry deadline', async () => {
      providerError = new Error('connection reset');
      await runWithJobContext(() => start(send), jobId);
      const firstTriedAt = new Date(now.getTime() - 36 * HOUR + 1000);
      repository.steps[0]!.firstTriedAt = firstTriedAt;
      providerError = undefined;
      duringPhoneRead = () => {
        databaseNow = new Date(now.getTime() + 2000);
      };
      repository.run = { ...repository.run, status: 'running', claimedAt: now, wakeAt: now };

      await service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: now },
        { kind: 'system' },
      );

      expect(sent).toEqual([]);
      expect(repository.run.lastError).toContain('The SMS provider did not answer for 36 hours');
      expect(repository.steps).toEqual([
        expect.objectContaining({ outcome: 'unconfirmed', firstTriedAt }),
      ]);
      expect(ledger.map((entry) => entry.kind)).toEqual(['reserve']);
    });

    it('defers a marketing retry when quiet hours start during the final phone read', async () => {
      providerError = new Error('connection reset');
      await runWithJobContext(() => start(send), jobId);
      providerError = undefined;
      const until = new Date(now.getTime() + HOUR);
      duringPhoneRead = () => {
        finalQuietUntil = until;
      };
      repository.run = { ...repository.run, status: 'running', claimedAt: now };

      await service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: now },
        { kind: 'system' },
      );

      expect(sent).toEqual([]);
      expect(repository.run).toMatchObject({ status: 'waiting', wakeAt: until });
      expect(repository.steps).toEqual([expect.objectContaining({ outcome: 'sending' })]);
      expect(ledger.map((entry) => entry.kind)).toEqual(['reserve']);
    });

    it('ends a retry when quiet hours start after its due cutoff has passed', async () => {
      providerError = new Error('connection reset');
      await runWithJobContext(() => start(send), jobId);
      providerError = undefined;
      duringPhoneRead = () => {
        finalQuietUntil = new Date(now.getTime() + HOUR);
        databaseNow = new Date(now.getTime() + 2000);
      };
      repository.run = {
        ...repository.run,
        status: 'running',
        claimedAt: now,
        wakeAt: new Date(now.getTime() - 24 * HOUR + 1000),
      };

      await service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: now },
        { kind: 'system' },
      );

      expect(sent).toEqual([]);
      expect(repository.run).toMatchObject({ status: 'running', currentStepKey: 'end' });
      expect(repository.steps).toEqual([expect.objectContaining({ outcome: 'unconfirmed' })]);
      expect(ledger.map((entry) => entry.kind)).toEqual(['reserve']);
    });

    it('does not resend a message whose run was due more than a day ago', async () => {
      providerError = new Error('connection reset');
      await runWithJobContext(() => start(send), jobId);
      providerError = undefined;
      clockNow = new Date(now.getTime() + 26 * HOUR);
      repository.run = { ...repository.run, status: 'running', claimedAt: clockNow, wakeAt: now };

      await service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: clockNow },
        { kind: 'system' },
      );

      expect(sent).toEqual([]);
      expect(repository.steps).toEqual([expect.objectContaining({ outcome: 'unconfirmed' })]);
      expect(repository.run).toMatchObject({ currentStepKey: 'end' });
    });

    it('wakes at the retry deadline when quiet hours last longer', async () => {
      const deadline = new Date(now.getTime() + 36 * HOUR);
      providerError = new Error('connection reset');
      await runWithJobContext(() => start(send), jobId);
      providerError = undefined;
      clockNow = new Date(deadline.getTime() - HOUR);
      recheckDefer = new Date(deadline.getTime() + HOUR);
      repository.run = {
        ...repository.run,
        status: 'running',
        claimedAt: clockNow,
        wakeAt: clockNow,
      };

      await service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: clockNow },
        { kind: 'system' },
      );

      expect(sent).toEqual([]);
      expect(repository.run).toMatchObject({ status: 'waiting', wakeAt: deadline });
      expect(repository.steps).toEqual([expect.objectContaining({ outcome: 'sending' })]);
    });

    it('fails the run with a readable reason after 36 hours of temporary errors', async () => {
      providerError = new Error('connection reset');
      await runWithJobContext(() => start(send), jobId);
      clockNow = new Date(now.getTime() + 36 * HOUR);
      repository.run = { ...repository.run, status: 'running', claimedAt: clockNow };

      await service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: clockNow },
        { kind: 'system' },
      );

      expect(repository.run).toMatchObject({
        status: 'failed',
        currentStepKey: 'first',
        lastError: expect.stringContaining('The SMS provider did not answer for 36 hours.'),
      });
      expect(repository.run.lastError).toContain('credits stay reserved');
      expect(repository.steps).toEqual([expect.objectContaining({ outcome: 'unconfirmed' })]);
    });

    it('fails the run with the message of a refused send', async () => {
      providerError = new AppError('SMS_SEND_REFUSED', {
        status: 422,
        message: 'The SMS provider refused the message',
      });

      await start(send);

      expect(repository.run).toMatchObject({
        status: 'failed',
        lastError: 'The SMS provider refused the message',
      });
    });
  });

  describe('credits', () => {
    const key = `run:${RUN_ID}:first`;

    it('reserves the parts with the gate and charges them once sent', async () => {
      await start(send);

      expect(ledger).toEqual([
        { key, kind: 'reserve', quantity: 1 },
        { key: `${key}:charge`, kind: 'charge', quantity: 1 },
      ]);
      expect(balance).toBe(9);
    });

    it('releases the credits when the provider definitively refuses', async () => {
      providerError = new AppError('SMS_SEND_REFUSED', {
        status: 422,
        message: 'The provider refused the message',
      });

      await start(send);

      expect(ledger.map((entry) => entry.kind)).toEqual(['reserve', 'release']);
      expect(balance).toBe(10);
    });

    it('retains an authorized send when an unexpected AppError follows authorization', async () => {
      providerError = new AppError('MESSAGING_PREPARATION_FAILED', {
        status: 500,
        message: 'The provider response was incomplete',
      });
      await runWithJobContext(() => start(send), jobId);
      expect(repository.run).toMatchObject({ status: 'waiting' });
      expect(repository.steps).toEqual([expect.objectContaining({ outcome: 'sending' })]);
      expect(ledger.map((entry) => entry.kind)).toEqual(['reserve']);

      clockNow = new Date(now.getTime() + 36 * HOUR);
      repository.run = {
        ...repository.run,
        status: 'running',
        claimedAt: clockNow,
        wakeAt: clockNow,
      };
      await service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: clockNow },
        { kind: 'system' },
      );

      expect(repository.steps).toEqual([expect.objectContaining({ outcome: 'unconfirmed' })]);
      expect(ledger.map((entry) => entry.kind)).toEqual(['reserve']);
    });

    // The first try may have reached the provider, so these end the step and keep the credits.
    async function afterUnknownOutcome(change: Partial<ClaimedRun> = {}) {
      providerError = new Error('connection reset');
      await runWithJobContext(() => start(send), jobId);
      providerError = undefined;
      repository.run = { ...repository.run, status: 'running', claimedAt: now, ...change };
      return service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: now },
        { kind: 'system' },
      );
    }

    it.each([
      ['a stopped version', { isVersionStopped: true }, 'exited'],
      ['an archived workflow', { automationStatus: 'archived' }, 'exited'],
      ['the attempts limit', { attempts: 10 }, 'failed'],
    ] as const)(
      'keeps the credits reserved when %s ends a run whose send is unconfirmed',
      async (_case, change, status) => {
        await afterUnknownOutcome(change);

        expect(repository.run.status).toBe(status);
        expect(repository.run.lastError).toContain(
          'The SMS provider did not confirm this message, so its credits stay reserved',
        );
        if (status === 'failed')
          expect(repository.run.lastError).toContain('This step failed too many times in a row');
        expect(repository.steps).toEqual([expect.objectContaining({ outcome: 'unconfirmed' })]);
        expect(ledger).toEqual([{ key, kind: 'reserve', quantity: 1 }]);
        expect(balance).toBe(9);
      },
    );

    it('keeps the credits reserved when the resend check refuses', async () => {
      recheckReason = 'no_consent';
      await afterUnknownOutcome();

      expect(repository.steps).toEqual([
        expect.objectContaining({ outcome: 'unconfirmed', skipReason: 'no_consent' }),
      ]);
      expect(ledger.map((entry) => entry.kind)).toEqual(['reserve']);
      expect(balance).toBe(9);
    });

    it('keeps the credits reserved after 36 hours with no answer', async () => {
      providerError = new Error('connection reset');
      await runWithJobContext(() => start(send), jobId);
      clockNow = new Date(now.getTime() + 36 * HOUR);
      repository.run = { ...repository.run, status: 'running', claimedAt: clockNow };

      await service.continueRun(
        STORE_ID,
        { runId: RUN_ID, stepKey: 'first', claimedAt: clockNow },
        { kind: 'system' },
      );

      expect(repository.run.status).toBe('failed');
      expect(ledger.map((entry) => entry.kind)).toEqual(['reserve']);
      expect(balance).toBe(9);
    });

    it('reserves nothing when the workflow was paused before the gate', async () => {
      const read = repository.findRun.bind(repository);
      // The pause commits between the step's first read and its gate transaction.
      let reads = 0;
      repository.findRun = async (storeId: string, runId: string) => {
        const found = await read(storeId, runId);
        if (++reads === 1) repository.run = { ...repository.run, automationStatus: 'paused' };
        return found && { ...found };
      };

      await start(send);

      expect(repository.run).toMatchObject({ status: 'waiting', currentStepKey: 'first' });
      expect(ledger).toEqual([]);
      expect(sent).toEqual([]);
    });

    it('fails a send step set to review before sending', async () => {
      await start({ ...send, reviewBeforeSending: true });

      expect(repository.run).toMatchObject({
        status: 'failed',
        lastError: 'Review before sending is not available yet',
      });
      expect(ledger).toEqual([]);
    });

    it('skips the step as no_credits on a short balance, then follows "if not reachable"', async () => {
      balance = 0;
      expect(await start(send)).toMatchObject({ stepKey: 'end' });
      expect(repository.steps).toEqual([
        expect.objectContaining({ outcome: 'skipped', skipReason: 'no_credits' }),
      ]);

      repository.steps = [];
      await start({ ...send, ifNotReachable: 'exit' });
      expect(repository.run).toMatchObject({ status: 'exited', exitReason: 'not_reachable' });
      expect(sent).toEqual([]);
      expect(ledger).toEqual([]);
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
