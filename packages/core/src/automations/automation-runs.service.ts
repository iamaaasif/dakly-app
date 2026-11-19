import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
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
  type RunClaim,
} from './automation-runs.repository';
import {
  exited,
  failed,
  goOn,
  hasHappened,
  holdOrEnd,
  holdsClaim,
  randomPath,
  runAction,
  scheduleWait,
  type RunFacts,
  type StepResult,
} from './automation-step-rules';

// One sweep claims at most this many runs, and no more than the queue has room for.
const MAX_QUEUED_STEPS = 1000;
// And at most this many of one store's runs, so a backlog cannot hold back other stores.
const CLAIMS_PER_STORE = 100;
type Condition = AutomationGraph['workflowFilters'][number];
type PathChoice = { outcome: string; next: string };

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
  async continueRun(
    storeId: string,
    queued: RunClaim,
    actor: AuditEntry['actor'],
  ): Promise<RunClaim | undefined> {
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
        await this.contacts.changeTag(storeId, run.contactId, result.tagChange, actor);
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
        return scheduleWait(stepKey, step, now, timeZone);
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
  private async exitReason(
    graph: AutomationGraph,
    facts: RunFacts,
    at: Date,
  ): Promise<AutomationExitReason | undefined> {
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
