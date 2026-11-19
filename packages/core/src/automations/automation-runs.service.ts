import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type { AutomationStep } from '@dakly/contracts/automations/graph';
import { countSmsParts } from '@dakly/contracts/sms';

import { ContactsService } from '../contacts/contacts.service';
import { LinksService, TRACKED_LINK_CODE_LENGTH } from '../links/links.service';
import { MessagingService } from '../messaging/messaging.service';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
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
import {
  AutomationSendRetryService,
  endExpiredRetry,
  hasRetryDetails,
} from './automation-send-retry.service';
import { AutomationSmsDeliveryService } from './automation-sms-delivery.service';
import {
  type Delivery,
  endWithUnknownOutcome,
  exited,
  failed,
  firstSendStop,
  type GateResult,
  goOn,
  holdOrEnd,
  holdsClaim,
  isLateSend,
  messageBody,
  operationKey,
  randomPath,
  runAction,
  scheduleWait,
  sendLateness,
  shouldPrepareSender,
  type RunFacts,
  type SendStep,
  type StepResult,
  workflowDestinationHash,
  WORKFLOW_LEASE_MS,
} from './automation-step-rules';
import { AutomationsService } from './automations.service';

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
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(SendPolicyService) private readonly sendPolicy: SendPolicyService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(LinksService) private readonly links: LinksService,
    @Inject(WalletService) private readonly wallets: WalletService,
    @Inject(AutomationSmsDeliveryService)
    private readonly smsDelivery: AutomationSmsDeliveryService,
    @Inject(AutomationSendRetryService) private readonly smsRetry: AutomationSendRetryService,
    @Inject(AutomationConditionsService) private readonly conditions: AutomationConditionsService,
    @Inject(AutomationsService) private readonly automations: AutomationsService,
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
      if (result.credits) await this.smsDelivery.settleCredits(storeId, claim, result.credits);
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
    const started =
      step.kind === 'send'
        ? await this.repository.findSendingStep(storeId, claim.runId, claim.stepKey)
        : undefined;
    const held = holdOrEnd(run, now);
    if (held) return started ? endWithUnknownOutcome(held) : held;
    const facts: RunFacts = {
      storeId,
      graph: run.graph,
      automationId: run.automationId,
      runId: claim.runId,
      contactId: run.contactId,
      tags: await this.contacts.findTags(storeId, run.contactId),
      tappedStepKeys: await this.repository.listTappedStepKeys(storeId, claim.runId),
      wakeAt: run.wakeAt,
    };
    if (step.kind === 'send' && started) return this.resend(claim, step, facts, started);
    const exitReason = await this.conditions.exitReason(run.graph, facts, now);
    if (exitReason) return exited(exitReason, now);
    if (
      shouldPrepareSender(step) &&
      !sendLateness(facts.wakeAt, await this.repository.schedulerTime(storeId), run)
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
        const choice = (await this.conditions.firstHoldingPath(step.paths, facts, now)) ?? {
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
        return this.startSend(claim, step, facts);
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
  private async startSend(claim: RunClaim, step: SendStep, facts: RunFacts) {
    const checkedAt = await this.repository.schedulerTime(facts.storeId);
    const shouldPrepare =
      step.channels.includes('sms') && !(await this.readLateGateResult(facts, checkedAt));
    const prepared = shouldPrepare ? await this.smsDelivery.prepare(facts) : undefined;
    const preparedPhone = shouldPrepare ? (prepared?.to ?? null) : undefined;
    const planned = await this.authorizeFirstSend(claim, step, facts, preparedPhone);
    if ('stop' in planned) return planned.stop;
    if (prepared)
      return this.smsDelivery.deliver(
        { storeId: facts.storeId, contactId: facts.contactId, step },
        prepared,
        planned,
      );
  }

  private async authorizeFirstSend(
    claim: RunClaim,
    step: SendStep,
    facts: RunFacts,
    preparedPhone: string | null | undefined,
  ) {
    const { storeId } = facts;
    let renewed = claim;
    const started = await this.transaction.run(storeId, async (): Promise<GateResult> => {
      const unchanged = { status: 'running', claimedAt: claim.claimedAt } as const;
      if (!(await this.repository.moveRunIfLive(storeId, claim, unchanged))) return 'not_live';
      const result = await this.gateSend(claim, step, facts, preparedPhone);
      if (result === 'balance_paused') return result;
      const claimedAt = await this.repository.schedulerTime(storeId);
      // Renew on the sweep's Postgres clock so it cannot retake a fresh lease early.
      await this.repository.moveRun(storeId, claim, { status: 'running', claimedAt });
      renewed = { ...claim, claimedAt };
      return result;
    });
    if (started === 'balance_paused') return { stop: undefined };
    if (started === 'not_live') {
      const run = await this.repository.findRun(storeId, claim.runId);
      if (!run || !holdsClaim(run, renewed)) return { stop: undefined };
      const held = holdOrEnd(run, await this.repository.schedulerTime(storeId));
      return { stop: held && { ...held, claim: renewed } };
    }
    if ('body' in started)
      return {
        claim: renewed,
        body: started.body,
        at: started.at,
        firstTriedAt: started.firstTriedAt,
      };
    return { stop: firstSendStop(renewed, step, started, facts.wakeAt) };
  }

  private async gateSend(
    claim: RunClaim,
    step: SendStep,
    facts: RunFacts,
    preparedPhone: string | null | undefined,
  ): Promise<GateResult> {
    const { storeId, contactId } = facts;
    const hasSms = step.channels.includes('sms');
    const lockedContactExists = await this.lockFirstSend(claim, facts, hasSms);
    if (lockedContactExists === undefined) return 'not_live';
    const checkedAt = await this.repository.schedulerTime(storeId);
    const initialLate = await this.readLateGateResult(facts, checkedAt);
    if (initialLate) return initialLate;
    // MSG-1 sends SMS only; Messenger and WhatsApp send with CHAT-2 and CHN-3.
    if (!hasSms) return { decision: { action: 'skip', reason: 'window_closed' } };
    const { decision, destination, at } = await this.sendPolicy.checkForSend(
      storeId,
      { contactId, channel: 'sms', category: step.category },
      lockedContactExists,
    );
    const exitReason = await this.conditions.refreshExitReason(facts, at);
    if (exitReason) return { exitReason, at };
    const firstTriedAt = await this.repository.schedulerTime(storeId);
    const late = await this.readLateGateResult(facts, firstTriedAt);
    if (late) return late;
    if (firstTriedAt.getTime() - claim.claimedAt.getTime() >= WORKFLOW_LEASE_MS)
      return { decision: { action: 'defer', until: facts.wakeAt ?? firstTriedAt } };
    if (decision.action !== 'send') return { decision };
    return this.reserveFirstSend(
      { storeId, claim, contactId, step, destination },
      facts,
      { sentAt: at, firstTriedAt },
      preparedPhone,
    );
  }

  private async lockFirstSend(
    claim: RunClaim,
    { storeId, contactId }: RunFacts,
    hasSms: boolean,
  ): Promise<boolean | undefined> {
    let contactExists = false;
    if (hasSms) {
      await this.wallets.lockForReservation(storeId, 'sms_credits');
      // Entry locks the contact before the workflow, so use the same order for dispatch.
      contactExists = await this.sendPolicy.lockForDispatch(storeId, contactId);
    }
    const held = await this.repository.moveRunIfLive(
      storeId,
      claim,
      { status: 'running', claimedAt: claim.claimedAt },
      'first_send',
    );
    return held ? contactExists : undefined;
  }

  private async reserveFirstSend(
    delivery: Omit<Delivery, 'body'>,
    { automationId, wakeAt }: RunFacts,
    times: { sentAt: Date; firstTriedAt: Date },
    preparedPhone: string | null | undefined,
  ): Promise<GateResult> {
    const { storeId, claim, destination } = delivery;
    // A concurrent top-up can make a send eligible after the preflight skipped preparation.
    if (preparedPhone === undefined)
      return { decision: { action: 'defer', until: wakeAt ?? times.firstTriedAt } };
    if (destination !== preparedPhone) return { outcome: 'destination_changed' };
    const body = await this.writeSend(delivery, times);
    if (body === undefined) {
      await this.automations.pauseForBalance(storeId, automationId, system);
      // The sweep ignores the waiting run while its workflow is paused.
      await this.repository.moveRun(storeId, claim, {
        status: 'waiting',
        wakeAt: wakeAt ?? times.firstTriedAt,
        attempts: 0,
        lastError: null,
      });
      return 'balance_paused';
    }
    return {
      decision: { action: 'send' },
      body,
      destination,
      at: times.sentAt,
      firstTriedAt: times.firstTriedAt,
    };
  }

  private async readLateGateResult({ storeId, runId, wakeAt }: RunFacts, now: Date) {
    if (!isLateSend(wakeAt, now)) return undefined;
    return sendLateness(wakeAt, now, await this.repository.findRun(storeId, runId));
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

  private async resend(claim: RunClaim, step: SendStep, facts: RunFacts, started: SendingStep) {
    const { storeId, wakeAt } = facts;
    const preflight = await this.repository.schedulerTime(storeId);
    if (
      !hasRetryDetails(step, started, preflight) ||
      endExpiredRetry(step, started.firstTriedAt, wakeAt, preflight)
    ) {
      const gate = await this.smsRetry.authorize(claim, step, facts);
      return 'stop' in gate ? gate.stop : undefined;
    }
    facts.preparedSender = await this.messaging.prepareSender(storeId);
    const prepared = await this.smsDelivery.prepare(facts);
    const planned = await this.smsRetry.authorize(claim, step, facts, prepared?.to ?? null);
    if ('stop' in planned) return planned.stop;
    if (prepared)
      return this.smsDelivery.deliver({ storeId, contactId: facts.contactId, step }, prepared, {
        ...planned,
        body: messageBody(step, started.optOutUrl ?? undefined),
      });
  }
}
