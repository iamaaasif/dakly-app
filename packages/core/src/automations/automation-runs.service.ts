import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type { AutomationStep } from '@dakly/contracts/automations/graph';
import { countSmsParts } from '@dakly/contracts/sms';

import { ContactsService } from '../contacts/contacts.service';
import { LinksService, TRACKED_LINK_CODE_LENGTH } from '../links/links.service';
import { MessagingService } from '../messaging/messaging.service';
import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { ErrorReporter } from '../platform/logging/error-reporter';
import { SendPolicyService } from '../sending/send-policy.service';
import { StoresService } from '../stores/stores.service';
import { WalletService } from '../wallets/wallet.service';
import { AutomationConditionsService } from './automation-conditions.service';
import {
  AutomationRunsRepository,
  type ClaimedRun,
  type DueRun,
  type RunClaim,
  type SendingStep,
} from './automation-runs.repository';
import { deliverAutomationSms, endExpiredRetry, retryDecision } from './automation-send-retry';
import {
  type CreditSettlement,
  type Delivery,
  endWithUnknownOutcome,
  exited,
  type GateResult,
  failed,
  goOn,
  holdOrEnd,
  holdOwnedClaim,
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
} from './automation-step-rules';

// One sweep claims at most this many runs, and no more than the queue has room for.
const MAX_QUEUED_STEPS = 1000;
// And at most this many of one store's runs, so a backlog cannot hold back other stores.
const CLAIMS_PER_STORE = 100;
const system = { kind: 'system' } as const;

@Injectable()
export class AutomationRunsService {
  constructor(
    @Inject(AutomationRunsRepository) private readonly repository: AutomationRunsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(SendPolicyService) private readonly sendPolicy: SendPolicyService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(LinksService) private readonly links: LinksService,
    @Inject(WalletService) private readonly wallets: WalletService,
    @Inject(ErrorReporter) private readonly reporter: ErrorReporter,
    @Inject(AutomationConditionsService) private readonly conditions: AutomationConditionsService,
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
    const now = this.clock.now();
    const step = run.graph.steps[claim.stepKey]!;
    const started =
      step.kind === 'send'
        ? await this.repository.findSendingStep(storeId, claim.runId, claim.stepKey)
        : undefined;
    const held = holdOrEnd(run, now);
    if (held) return started ? endWithUnknownOutcome(held) : held;
    const facts: RunFacts = {
      graph: run.graph,
      storeId,
      runId: claim.runId,
      contactId: run.contactId,
      tags: await this.contacts.findTags(storeId, run.contactId),
      tappedStepKeys: await this.repository.listTappedStepKeys(storeId, claim.runId),
      wakeAt: run.wakeAt,
    };
    const exitReason = await this.conditions.exitReason(storeId, run.graph, facts, now);
    if (exitReason) {
      const result = exited(exitReason, now);
      return started ? endWithUnknownOutcome(result) : result;
    }
    if (step.kind === 'send' && started) return this.resend(claim, step, facts, started);
    if (
      shouldPrepareSender(step) &&
      !isLateSend(facts.wakeAt, await this.transaction.databaseTime(storeId))
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
        const choice = (await this.conditions.firstHoldingPath(
          facts.storeId,
          step.paths,
          facts,
          now,
        )) ?? {
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
      if (isLateSend(facts.wakeAt, await this.transaction.databaseTime(storeId)))
        return { outcome: 'late' };
      const result = await this.gateSend(renewed, step, facts);
      const claimedAt = await this.transaction.databaseTime(storeId);
      // The live move holds this run row; renew after the gate's other locks and writes.
      await this.repository.moveRun(storeId, renewed, { status: 'running', claimedAt });
      renewed = { ...claim, claimedAt };
      return result;
    });
    // A pause, stop or archive, or another claim, came first: nothing was reserved.
    if (started === 'not_live') {
      const run = await this.repository.findRun(storeId, claim.runId);
      const held = holdOwnedClaim(run, renewed, this.clock.now());
      return held && { ...held, claim: renewed };
    }
    const gatedAt = this.clock.now();
    if ('exitReason' in started) return { ...exited(started.exitReason, gatedAt), claim: renewed };
    if ('outcome' in started)
      return { ...goOn(step.next, gatedAt), claim: renewed, step: { ...row, outcome: 'late' } };
    const { decision } = started;
    if ('body' in started)
      return deliverAutomationSms(
        { messaging: this.messaging, reporter: this.reporter, clock: this.clock },
        {
          storeId,
          claim: renewed,
          contactId,
          step,
          body: started.body,
          isFirstTry: true,
          preparedSender: facts.preparedSender,
          destination: started.destination,
        },
        started.at,
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

  // With a send row that may have reached the provider, ending the run keeps its credits.
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
    if (isLateSend(facts.wakeAt, at)) return { outcome: 'late' };
    if (decision.action !== 'send') return { decision };
    const body = await this.writeSend({ storeId, claim, contactId, step, destination }, at);
    if (body === undefined) return { decision: noCredits };
    return { decision, body, destination, at };
  }

  private async refreshExitReason(facts: RunFacts, at: Date) {
    const tags = await this.contacts.findTags(facts.storeId, facts.contactId);
    const tappedStepKeys = await this.repository.listTappedStepKeys(facts.storeId, facts.runId);
    return this.conditions.exitReason(
      facts.storeId,
      facts.graph,
      { ...facts, tags, tappedStepKeys },
      at,
    );
  }

  // Inside the gate's transaction. The credits are reserved first, so a short balance leaves
  // nothing behind; the opt-out address has a fixed length, so a stand-in code counts the same parts.
  private async writeSend(
    { storeId, claim, contactId, step, destination }: Omit<Delivery, 'body' | 'isFirstTry'>,
    now: Date,
  ): Promise<string | undefined> {
    const isMarketing = step.category === 'marketing';
    const standIn = isMarketing
      ? this.links.optOutUrl('0'.repeat(TRACKED_LINK_CODE_LENGTH))
      : undefined;
    if (!(await this.reserveCredits(storeId, claim, countSmsParts(messageBody(step, standIn)))))
      return undefined;
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
      sentAt: now,
      firstTriedAt: now,
      optOutCode: optOut?.code,
      destination,
    });
    return messageBody(step, optOut?.url);
  }

  // A balance that changes between the check and the write fails the transaction instead; the run
  // is claimed again later.
  private async reserveCredits(storeId: string, claim: RunClaim, quantity: number) {
    try {
      await this.wallets.reserve(storeId, {
        wallet: 'sms_credits',
        quantity,
        idempotencyKey: operationKey(claim),
        actor: system,
      });
      return true;
    } catch (error) {
      if (error instanceof AppError && error.code === 'WALLET_BALANCE_TOO_LOW') return false;
      throw error;
    }
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

  private async resend(claim: RunClaim, step: SendStep, facts: RunFacts, started: SendingStep) {
    const { storeId, contactId, wakeAt } = facts;
    const { firstTriedAt, optOutCode, destination } = started;
    const preparedSender = endExpiredRetry(step, firstTriedAt, wakeAt, this.clock.now())
      ? undefined
      : await this.messaging.prepareSender(storeId);
    const gated = await this.transaction.run(storeId, async () => {
      const unchanged = { status: 'running', claimedAt: claim.claimedAt } as const;
      if (!(await this.repository.moveRunIfLive(storeId, claim, unchanged))) return undefined;
      const early = endExpiredRetry(step, firstTriedAt, wakeAt, this.clock.now());
      const result = early ?? (await this.recheckResend(step, facts, started));
      const claimedAt = this.clock.now();
      if (!(await this.repository.moveRunIfLive(storeId, claim, { status: 'running', claimedAt })))
        return undefined;
      if (result) return { result, claim: { ...claim, claimedAt }, at: claimedAt };
      const renewed = { ...claim, claimedAt };
      // A slower worker must not age out a previously submitted message early.
      const sentAt = claimedAt > started.latestDispatchAt ? claimedAt : started.latestDispatchAt;
      const dispatch = { outcome: 'sending', sentAt, firstTriedAt } as const;
      await this.repository.changeStep(storeId, claim.runId, claim.stepKey, dispatch);
      const afterWrite = this.clock.now();
      await this.repository.moveRun(storeId, renewed, { status: 'running', claimedAt: afterWrite });
      return { result, claim: { ...claim, claimedAt: afterWrite }, at: sentAt };
    });
    if (!gated) {
      const run = await this.repository.findRun(storeId, claim.runId);
      const held = holdOwnedClaim(run, claim, this.clock.now());
      return held && endWithUnknownOutcome(held);
    }
    if (gated.result) return { ...gated.result, claim: gated.claim };
    return deliverAutomationSms(
      { messaging: this.messaging, reporter: this.reporter, clock: this.clock },
      {
        storeId,
        claim: gated.claim,
        contactId,
        step,
        body: messageBody(step, optOutCode ? this.links.optOutUrl(optOutCode) : undefined),
        destination,
        preparedSender,
        isFirstTry: false,
      },
      firstTriedAt,
      gated.at,
    );
  }

  private async recheckResend(step: SendStep, facts: RunFacts, { id, firstTriedAt }: SendingStep) {
    const { decision, at } = await this.sendPolicy.recheckForSend(
      facts.storeId,
      { contactId: facts.contactId, channel: 'sms', category: step.category },
      id,
    );
    const exit = await this.refreshExitReason(facts, at);
    const now = this.clock.now();
    if (exit) return endWithUnknownOutcome(exited(exit, now));
    return (
      endExpiredRetry(step, firstTriedAt, facts.wakeAt, now) ??
      retryDecision(step, firstTriedAt, decision, now)
    );
  }
}
