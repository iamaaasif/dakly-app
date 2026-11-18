import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type { AutomationExitReason } from '@dakly/contracts/automations';
import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';
import { countSmsParts } from '@dakly/contracts/sms';

import { ContactsService } from '../contacts/contacts.service';
import { LinksService, TRACKED_LINK_CODE_LENGTH } from '../links/links.service';
import { MessagingService } from '../messaging/messaging.service';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { SegmentsService } from '../segments/segments.service';
import { SendPolicyService } from '../sending/send-policy.service';
import { StoresService } from '../stores/stores.service';
import { WalletService } from '../wallets/wallet.service';
import {
  AutomationRunsRepository,
  type ClaimedRun,
  type DueRun,
  type RunClaim,
} from './automation-runs.repository';
import {
  type CreditSettlement,
  type Delivery,
  endWithUnknownOutcome,
  exited,
  type GateResult,
  failed,
  goOn,
  hasHappened,
  holdOrEnd,
  holdsClaim,
  ifNotReachable,
  isLateSend,
  messageBody,
  noCredits,
  operationKey,
  randomPath,
  runAction,
  scheduleWait,
  shouldPrepareSender,
  type RunFacts,
  type SendStep,
  type StepResult,
  workflowDestinationHash,
} from './automation-step-rules';

// One sweep claims at most this many runs, and no more than the queue has room for.
const MAX_QUEUED_STEPS = 1000;
// And at most this many of one store's runs, so a backlog cannot hold back other stores.
const CLAIMS_PER_STORE = 100;
const system = { kind: 'system' } as const;

type Condition = AutomationGraph['workflowFilters'][number];
const NO_ANSWER = 'The SMS provider did not answer';

@Injectable()
export class AutomationRunsService {
  constructor(
    @Inject(AutomationRunsRepository) private readonly repository: AutomationRunsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(SegmentsService) private readonly segments: SegmentsService,
    @Inject(SendPolicyService) private readonly sendPolicy: SendPolicyService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(LinksService) private readonly links: LinksService,
    @Inject(WalletService) private readonly wallets: WalletService,
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
    const now = await this.repository.schedulerTime(storeId);
    const started = await this.repository.startWork(storeId, queued, now);
    if (!started) return undefined;
    const claim = { ...queued, claimedAt: started.claimedAt };
    const run = { ...found, ...started };
    const result = await this.runStep(storeId, claim, run);
    if (!result) return undefined;
    // Every committed step starts the count of claims without progress again.
    const change = { attempts: 0, lastError: null, ...result.run };
    const isMoved = await this.transaction.run(storeId, async () => {
      if (!(await this.repository.moveRun(storeId, result.claim ?? claim, change))) return false;
      if (result.step)
        await this.repository.insertStep(storeId, claim.runId, run.contactId, result.step);
      if (result.stepChange)
        await this.repository.changeStep(storeId, claim.runId, claim.stepKey, result.stepChange);
      if (result.tagChange)
        await this.contacts.changeTag(storeId, run.contactId, result.tagChange, actor);
      if (result.credits) await this.settleCredits(storeId, claim, result.credits);
      return true;
    });
    return isMoved && result.next ? { runId: claim.runId, ...result.next } : undefined;
  }

  private async runStep(
    storeId: string,
    claim: RunClaim,
    run: ClaimedRun,
  ): Promise<StepResult | undefined> {
    const now = await this.repository.schedulerTime(storeId);
    const step = run.graph.steps[claim.stepKey]!;
    const isSending =
      step.kind === 'send' &&
      (await this.repository.findSendingStep(storeId, claim.runId, claim.stepKey));
    const held = holdOrEnd(run, now);
    // A send handed to the provider by an earlier claim is not sent again; its run ends.
    if (isSending) return endWithUnknownOutcome(held ?? failed(NO_ANSWER, now));
    if (held) return held;
    const facts: RunFacts = {
      storeId,
      graph: run.graph,
      runId: claim.runId,
      contactId: run.contactId,
      tags: await this.contacts.findTags(storeId, run.contactId),
      tappedStepKeys: await this.repository.listTappedStepKeys(storeId, claim.runId),
      wakeAt: run.wakeAt,
    };
    const exitReason = await this.exitReason(run.graph, facts, now);
    if (exitReason) return exited(exitReason, now);
    if (
      shouldPrepareSender(step) &&
      !isLateSend(facts.wakeAt, await this.repository.schedulerTime(storeId))
    )
      facts.preparedSender = await this.messaging.prepareSender(storeId);
    return this.runKind(claim, step, facts, now);
  }

  private async runKind(
    claim: RunClaim,
    step: AutomationStep,
    facts: RunFacts,
    now: Date,
  ): Promise<StepResult | undefined> {
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
        // Versions published before the guard still fail instead of sending without review.
        if (step.reviewBeforeSending)
          return failed('Review before sending is not available yet', now);
        return this.startSend(claim, step, facts, now);
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
  ): Promise<{ outcome: string; next: string } | undefined> {
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

  // The gate decides, the opt-out link is made and the send row is written in one short
  // transaction that also renews the claim, so the frequency cap counts this send before another
  // check for the contact can run.
  private async startSend(
    claim: RunClaim,
    step: SendStep,
    facts: RunFacts,
    now: Date,
  ): Promise<StepResult | undefined> {
    const { storeId, contactId } = facts;
    const row = { stepKey: claim.stepKey, kind: 'send', category: step.category } as const;
    let renewed = claim;
    const started = await this.transaction.run(storeId, async (): Promise<GateResult> => {
      const renewal = { status: 'running', claimedAt: now } as const;
      if (!(await this.repository.moveRunIfLive(storeId, claim, renewal))) return 'not_live';
      renewed = { ...claim, claimedAt: now };
      const checkedAt = await this.repository.schedulerTime(storeId);
      const result = isLateSend(facts.wakeAt, checkedAt)
        ? ({ outcome: 'late' } as const)
        : await this.gateSend(renewed, step, facts);
      const claimedAt = await this.repository.schedulerTime(storeId);
      // The live move holds this run row; renew after the gate's other locks and writes.
      await this.repository.moveRun(storeId, renewed, { status: 'running', claimedAt });
      renewed = { ...claim, claimedAt };
      return result;
    });
    // A pause, stop or archive, or another claim, came first: nothing was reserved.
    if (started === 'not_live') {
      const run = await this.repository.findRun(storeId, claim.runId);
      if (!run || !holdsClaim(run, renewed)) return undefined;
      const held = holdOrEnd(run, await this.repository.schedulerTime(storeId));
      return held && { ...held, claim: renewed };
    }
    const gatedAt = renewed.claimedAt;
    if ('exitReason' in started) return { ...exited(started.exitReason, gatedAt), claim: renewed };
    if ('outcome' in started)
      return { ...goOn(step.next, gatedAt), claim: renewed, step: { ...row, outcome: 'late' } };
    const { decision } = started;
    if ('body' in started)
      return this.deliver(
        {
          storeId,
          claim: renewed,
          contactId,
          step,
          body: started.body,
          preparedSender: facts.preparedSender,
          destination: started.destination,
        },
        started.at,
      );
    if (decision.action === 'defer')
      return { claim: renewed, run: { status: 'waiting', wakeAt: decision.until } };
    if (decision.action === 'skip')
      return {
        ...ifNotReachable(step, gatedAt),
        claim: renewed,
        step: { ...row, outcome: 'skipped', skipReason: decision.reason },
      };
    return undefined;
  }

  private async gateSend(claim: RunClaim, step: SendStep, facts: RunFacts): Promise<GateResult> {
    const { storeId, contactId } = facts;
    // MSG-1 sends SMS only; Messenger and WhatsApp send with CHAT-2 and CHN-3.
    if (!step.channels.includes('sms'))
      return { decision: { action: 'skip', reason: 'window_closed' } };
    await this.wallets.lockForReservation(storeId, 'sms_credits');
    const { decision, destination, at } = await this.sendPolicy.checkForSend(storeId, {
      contactId,
      channel: 'sms',
      category: step.category,
    });
    if (
      !(await this.repository.moveRunIfLive(storeId, claim, {
        status: 'running',
        claimedAt: claim.claimedAt,
      }))
    )
      return 'not_live';
    const exitReason = await this.refreshExitReason(facts, at);
    if (exitReason) return { exitReason, at };
    const firstTriedAt = await this.repository.schedulerTime(storeId);
    if (isLateSend(facts.wakeAt, firstTriedAt)) return { outcome: 'late' };
    if (decision.action !== 'send') return { decision };
    const body = await this.writeSend(
      { storeId, claim, contactId, step, destination },
      {
        sentAt: at,
        firstTriedAt,
      },
    );
    if (body === undefined) return { decision: noCredits };
    return { decision, body, destination, at };
  }

  private async refreshExitReason(facts: RunFacts, at: Date) {
    const tags = await this.contacts.findTags(facts.storeId, facts.contactId);
    const tappedStepKeys = await this.repository.listTappedStepKeys(facts.storeId, facts.runId);
    return this.exitReason(facts.graph, { ...facts, tags, tappedStepKeys }, at);
  }

  // Inside the gate's transaction. The credits are reserved first, so a short balance leaves
  // nothing behind; the opt-out address has a fixed length, so a stand-in code counts the same parts.
  private async writeSend(
    { storeId, claim, contactId, step, destination }: Omit<Delivery, 'body'>,
    times: { sentAt: Date; firstTriedAt: Date },
  ): Promise<string | undefined> {
    const isMarketing = step.category === 'marketing';
    const standIn = isMarketing
      ? this.links.optOutUrl('0'.repeat(TRACKED_LINK_CODE_LENGTH))
      : undefined;
    try {
      await this.wallets.reserve(storeId, {
        wallet: 'sms_credits',
        quantity: countSmsParts(messageBody(step, standIn)),
        idempotencyKey: operationKey(claim),
        actor: system,
      });
    } catch (error) {
      if (error instanceof AppError && error.code === 'WALLET_BALANCE_TOO_LOW') return undefined;
      throw error;
    }
    const id = newId();
    // CAMP-R4: every marketing SMS ends with its one-tap opt-out link.
    const [optOut] = isMarketing
      ? await this.links.create(
          storeId,
          [{ kind: 'sms_opt_out', sourceType: 'automation', sourceId: id, contactId }],
          system,
        )
      : [];
    await this.repository.insertStep(storeId, claim.runId, contactId, {
      stepKey: claim.stepKey,
      kind: 'send',
      category: step.category,
      id,
      outcome: 'sending',
      channel: 'sms',
      ...times,
      destinationHash: workflowDestinationHash(storeId, destination),
      optOutUrl: optOut?.url,
    });
    return messageBody(step, optOut?.url);
  }

  private async settleCredits(storeId: string, claim: RunClaim, credits: CreditSettlement) {
    const key = operationKey(claim);
    // Every send row was written with its reservation, in the same transaction.
    const reservationId = (await this.wallets.findByIdempotencyKey(storeId, key))!.entryId;
    if (credits.settle === 'charge')
      await this.wallets.charge(storeId, {
        reservationId,
        quantity: credits.quantity,
        idempotencyKey: `${key}:charge`,
        actor: system,
      });
    else
      await this.wallets.release(storeId, {
        reservationId,
        idempotencyKey: `${key}:release`,
        actor: system,
      });
  }

  // Called with no transaction open, with the operation key the provider deduplicates on.
  private async deliver(
    { storeId, claim, contactId, step, body, destination, preparedSender }: Delivery,
    sentAt: Date,
  ): Promise<StepResult> {
    const message = {
      channel: 'sms',
      contactId,
      body,
      operationKey: operationKey(claim),
      destination,
    } as const;
    const attempt = await this.messaging.send(storeId, message, preparedSender).then(
      (receipt) => ({ receipt }),
      (error: unknown) => ({ error }),
    );
    const now = await this.repository.schedulerTime(storeId);
    if ('receipt' in attempt) {
      const { providerMessageId, credits } = attempt.receipt;
      return {
        ...goOn(step.next, now),
        claim,
        stepChange: { outcome: 'sent', providerMessageId, sentAt },
        credits: { settle: 'charge', quantity: credits },
      };
    }
    // MessagingService refuses before it calls the provider, so a refusal never reached it.
    if (attempt.error instanceof AppError)
      return {
        ...failed(attempt.error.message, now),
        claim,
        stepChange: { outcome: 'failed' },
        credits: { settle: 'release' },
      };
    // Any other error may come after the provider took the message.
    return endWithUnknownOutcome({ ...failed(NO_ANSWER, now), claim });
  }
}
