import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { AutomationExitReason } from '@dakly/contracts/automations';
import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';

import { ContactsService } from '../contacts/contacts.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { SegmentsService } from '../segments/segments.service';
import { SendPolicyService } from '../sending/send-policy.service';
import { StoresService } from '../stores/stores.service';
import {
  AutomationRunsRepository,
  type ClaimedRun,
  type DueRun,
  type NewRunStep,
  type RunChange,
  type RunClaim,
} from './automation-runs.repository';
import { wakeTime } from './automation-waits';

// One sweep claims at most this many runs, and no more than the queue has room for.
const MAX_QUEUED_STEPS = 1000;
// And at most this many of one store's runs, so a backlog cannot hold back other stores.
const CLAIMS_PER_STORE = 100;
// Step jobs that started on a claim and committed nothing: a job that keeps failing.
const MAX_CLAIMS_WITHOUT_PROGRESS = 10;
const system = { kind: 'system' } as const;

type Condition = AutomationGraph['workflowFilters'][number];
type ExitCondition = AutomationGraph['exitConditions'][number];
// What the person has done in this run so far, read once per step.
type RunFacts = {
  storeId: string;
  runId: string;
  contactId: string;
  tags: string[];
  tappedStepKeys: string[];
};
type PathChoice = { outcome: string; next: string };
// The run's next state, the step row and a tag change, written together under the claim, and the
// next step's claim when the run goes straight on.
type StepResult = {
  run: RunChange;
  step?: NewRunStep;
  tagChange?: Parameters<ContactsService['changeTag']>[2];
  next?: Omit<RunClaim, 'runId'>;
};

@Injectable()
export class AutomationRunsService {
  constructor(
    @Inject(AutomationRunsRepository) private readonly repository: AutomationRunsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(SegmentsService) private readonly segments: SegmentsService,
    @Inject(SendPolicyService) private readonly sendPolicy: SendPolicyService,
    @Inject(StoresService) private readonly stores: StoresService,
  ) {}

  // Claims, then queues, with no transaction open. A sweep that stops in between leaves running
  // claims that a later sweep takes again once they are five minutes old. Claiming only what the
  // queue has room for keeps a lease from running out while its job waits.
  async wakeDueRuns(queuedSteps: number, queueSteps: (claims: DueRun[]) => Promise<void>) {
    const room = MAX_QUEUED_STEPS - queuedSteps;
    if (room <= 0) return;
    await queueSteps(await this.repository.claimDue(room, CLAIMS_PER_STORE));
  }

  // Returns the claim on the next step when the run goes straight on, for its job to queue.
  async continueRun(storeId: string, queued: RunClaim): Promise<RunClaim | undefined> {
    const found = await this.repository.findRun(storeId, queued.runId);
    if (!found || !holdsClaim(found, queued)) return undefined;
    // A job that starts late takes a fresh lease and works under it.
    const started = await this.repository.startWork(storeId, queued, this.clock.now());
    if (!started) return undefined;
    const claim = { ...queued, claimedAt: started.claimedAt };
    const run = { ...found, ...started };
    const result = await this.runStep(storeId, claim, run);
    // Every committed step starts the count of claims without progress again.
    const change = { attempts: 0, lastError: null, ...result.run };
    const isMoved = await this.transaction.run(storeId, async () => {
      if (!(await this.repository.moveRun(storeId, claim, change))) return false;
      if (result.step)
        await this.repository.insertStep(storeId, claim.runId, run.contactId, result.step);
      if (result.tagChange)
        await this.contacts.changeTag(storeId, run.contactId, result.tagChange, system);
      return true;
    });
    return isMoved && result.next ? { runId: claim.runId, ...result.next } : undefined;
  }

  private async runStep(storeId: string, claim: RunClaim, run: ClaimedRun): Promise<StepResult> {
    const now = this.clock.now();
    const held = holdOrEnd(run, now);
    if (held) return held;
    const facts: RunFacts = {
      storeId,
      runId: claim.runId,
      contactId: run.contactId,
      tags: await this.contacts.findTags(storeId, run.contactId),
      tappedStepKeys: await this.repository.listTappedStepKeys(storeId, claim.runId),
    };
    const exitReason = await this.exitReason(run.graph, facts, now);
    if (exitReason) return exited(exitReason, now);
    return this.runKind(claim, run.graph.steps[claim.stepKey]!, facts, now);
  }

  private async runKind(
    claim: RunClaim,
    step: AutomationStep,
    facts: RunFacts,
    now: Date,
  ): Promise<StepResult> {
    const { stepKey } = claim;
    switch (step.kind) {
      case 'wait': {
        const timeZone = (await this.stores.sendingSettings(facts.storeId)).timeZone;
        return {
          run: {
            status: 'waiting',
            currentStepKey: step.next,
            wakeAt: wakeTime(step.wait, now, timeZone),
          },
          step: { stepKey, kind: 'wait', outcome: 'scheduled' },
        };
      }
      case 'condition': {
        const choice = (await this.firstHoldingPath(step.paths, facts, now)) ?? {
          outcome: 'else',
          next: step.elseNext,
        };
        return {
          ...goOn(choice.next, now),
          step: { stepKey, kind: 'condition', outcome: choice.outcome },
        };
      }
      case 'random_split': {
        const choice = randomPath(claim.runId, stepKey, step.paths);
        return {
          ...goOn(choice.next, now),
          step: { stepKey, kind: 'random_split', outcome: choice.outcome },
        };
      }
      case 'send':
        return failed('This step cannot run yet', now);
      case 'action':
        return runAction(stepKey, step, now);
      case 'exit':
        return {
          run: { status: 'done', finishedAt: now },
          step: { stepKey, kind: 'exit', outcome: 'done' },
        };
    }
  }

  // Checked before every step (feature 09): the goal, the exit conditions, then the workflow
  // filters.
  private async exitReason(graph: AutomationGraph, facts: RunFacts, at: Date) {
    const { goal, exitConditions, workflowFilters } = graph;
    if (goal && hasHappened(goal, facts)) return 'goal';
    if (exitConditions.some((exit) => hasHappened(exit, facts))) return 'exit_condition';
    for (const filter of workflowFilters)
      if (!(await this.holds(filter, facts, at))) return 'workflow_filter';
    return undefined;
  }

  private async firstHoldingPath(
    paths: { condition: Condition; next: string }[],
    facts: RunFacts,
    at: Date,
  ): Promise<PathChoice | undefined> {
    for (const [index, path] of paths.entries())
      if (await this.holds(path.condition, facts, at))
        return { outcome: `path_${index + 1}`, next: path.next };
    return undefined;
  }

  private async holds(condition: Condition, facts: RunFacts, at: Date): Promise<boolean> {
    const { storeId, contactId } = facts;
    switch (condition.kind) {
      // Publish refuses tap conditions until taps on workflow messages are recorded.
      case 'tapped':
        return facts.tappedStepKeys.includes(condition.stepKey);
      case 'has_tag':
        return facts.tags.includes(condition.tag);
      case 'in_segment':
        return this.segments.hasContact(storeId, condition.segmentId, contactId);
      // Reachable means the contact has an address and an open window on the channel; consent is
      // the send step's own check.
      case 'reachable': {
        const request = {
          contactId,
          channel: condition.channel,
          category: 'transactional',
          at,
        } as const;
        return (await this.sendPolicy.check(storeId, request)).action === 'send';
      }
      // Replies arrive with CHAT-2 (SMS cannot receive them), and orders with ORD-1.
      case 'replied':
      case 'placed_order':
        return false;
    }
  }
}

// Tasks for staff, team notices, handing to a person and coupons have no owning service yet, and
// publish refuses them. The tag change is written with the step, under the claim.
function runAction(
  stepKey: string,
  { action, next }: Extract<AutomationStep, { kind: 'action' }>,
  now: Date,
): StepResult {
  if (action.action !== 'add_tag' && action.action !== 'remove_tag')
    return failed('This action is not available yet', now);
  const change = action.action === 'add_tag' ? 'add' : 'remove';
  return {
    ...goOn(next, now),
    step: { stepKey, kind: 'action', outcome: 'done' },
    tagChange: { tag: action.tag, change },
  };
}

// Orders arrive with ORD-1 and replies with CHAT-2, so those exits cannot happen yet; publish
// refuses the tap exit until taps on workflow messages are recorded. Tags carry no time, so a tag
// the person already had counts as got.
function hasHappened(exit: ExitCondition, facts: RunFacts): boolean {
  if (exit.kind === 'got_tag') return facts.tags.includes(exit.tag);
  if (exit.kind === 'tapped_link') return facts.tappedStepKeys.length > 0;
  return false;
}

// Checked before every step.
function holdOrEnd(run: ClaimedRun, now: Date): StepResult | undefined {
  if (run.attempts > MAX_CLAIMS_WITHOUT_PROGRESS)
    return failed('This step failed too many times in a row', now);
  // Pausing holds everyone where they are; the sweep skips the run until the workflow is enabled.
  if (run.automationStatus === 'paused')
    return { run: { status: 'waiting', wakeAt: run.wakeAt ?? now } };
  // "Stop the old version" and archiving both remove everyone still inside at their next step.
  if (run.isVersionStopped) return exited('version_stopped', now);
  if (run.automationStatus === 'archived') return exited('archived', now);
  return undefined;
}

function holdsClaim(run: ClaimedRun, claim: RunClaim): boolean {
  return (
    run.status === 'running' &&
    run.currentStepKey === claim.stepKey &&
    run.claimedAt?.getTime() === claim.claimedAt.getTime()
  );
}

// The next step's job takes over the claim with a fresh time, which also renews the lease.
function goOn(next: string, now: Date) {
  return {
    run: { status: 'running', currentStepKey: next, claimedAt: now },
    next: { stepKey: next, claimedAt: now },
  } as const;
}

function exited(exitReason: AutomationExitReason, now: Date) {
  return { run: { status: 'exited', exitReason, finishedAt: now } } as const;
}

function failed(reason: string, now: Date) {
  return { run: { status: 'failed', lastError: reason, finishedAt: now } } as const;
}

// A hash of the run and the step, so a retry takes the same path and two splits are independent.
// The graph schema makes the percents add up to 100, so the last path takes the rest.
function randomPath(runId: string, stepKey: string, paths: { percent: number; next: string }[]) {
  const bucket = createHash('sha256').update(`${runId}:${stepKey}`).digest().readUInt32BE(0) % 100;
  let upTo = 0;
  const index = paths.findIndex((path) => (upTo += path.percent) > bucket);
  return { outcome: `path_${index + 1}`, next: paths[index]!.next };
}
