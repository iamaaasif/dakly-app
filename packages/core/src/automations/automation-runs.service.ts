import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { AutomationExitReason } from '@dakly/contracts/automations';
import type { AutomationStep } from '@dakly/contracts/automations/graph';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { MINUTE_MS } from '../platform/time';
import {
  AutomationRunsRepository,
  type ClaimedRun,
  type DueRun,
  type NewRunStep,
  type RunChange,
  type RunClaim,
} from './automation-runs.repository';

// One sweep claims at most this many runs, and no more than the queue has room for.
const MAX_QUEUED_STEPS = 1000;
// And at most this many of one store's runs, so a backlog cannot hold back other stores.
const CLAIMS_PER_STORE = 100;
// Step jobs that started on a claim and committed nothing: a job that keeps failing.
const MAX_CLAIMS_WITHOUT_PROGRESS = 10;

type Wait = Extract<AutomationStep, { kind: 'wait' }>['wait'];
// The run's next state and the row that records the step, written together under the claim, and
// the next step's claim when the run goes straight on.
type StepResult = { run: RunChange; step?: NewRunStep; next?: Omit<RunClaim, 'runId'> };

@Injectable()
export class AutomationRunsService {
  constructor(
    @Inject(AutomationRunsRepository) private readonly repository: AutomationRunsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
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
    const result = await this.runStep(claim, run);
    // Every committed step starts the count of claims without progress again.
    const change = { attempts: 0, lastError: null, ...result.run };
    const isMoved = await this.transaction.run(storeId, async () => {
      if (!(await this.repository.moveRun(storeId, claim, change))) return false;
      if (result.step)
        await this.repository.insertStep(storeId, claim.runId, run.contactId, result.step);
      return true;
    });
    return isMoved && result.next ? { runId: claim.runId, ...result.next } : undefined;
  }

  private async runStep(claim: RunClaim, run: ClaimedRun): Promise<StepResult> {
    const now = this.clock.now();
    const held = holdOrEnd(run, now);
    if (held) return held;
    const { stepKey } = claim;
    const step = run.graph.steps[stepKey]!;
    switch (step.kind) {
      case 'wait': {
        const wakeAt = wakeTime(step.wait, now);
        if (!wakeAt) return failed('This step cannot run yet', now);
        return {
          run: { status: 'waiting', currentStepKey: step.next, wakeAt },
          step: { stepKey, kind: 'wait', outcome: 'scheduled' },
        };
      }
      case 'random_split': {
        const choice = randomPath(claim.runId, stepKey, step.paths);
        return {
          ...goOn(choice.next, now),
          step: { stepKey, kind: 'random_split', outcome: choice.outcome },
        };
      }
      case 'exit':
        return {
          run: { status: 'done', finishedAt: now },
          step: { stepKey, kind: 'exit', outcome: 'done' },
        };
      case 'condition':
      case 'send':
      case 'action':
        return failed('This step cannot run yet', now);
    }
  }
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

// Waits are not quiet hours: a send at the end of one defers on its own. Waking on a reply or tap
// and on the Messenger window come with CHAT-2, so an event wait lasts its timeout and a window
// wait has no open window to wait for.
function wakeTime(wait: Wait, now: Date): Date | undefined {
  switch (wait.until) {
    case 'duration':
      return new Date(now.getTime() + wait.minutes * MINUTE_MS);
    case 'event':
      return new Date(now.getTime() + wait.timeoutMinutes * MINUTE_MS);
    case 'window_closing':
      return now;
    case 'time_of_day':
    case 'weekday':
      return undefined;
  }
}
