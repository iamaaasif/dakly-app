import { Inject, Injectable } from '@nestjs/common';

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
import { serializeError } from '../platform/logging/safe-error';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../platform/time';
import { type SendDecision, SendPolicyService } from '../sending/send-policy.service';
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
  type CreditSettlement,
  type Delivery,
  endWithUnknownOutcome,
  exited,
  type GateResult,
  failed,
  goOn,
  lateSend,
  holdOrEnd,
  holdsClaim,
  ifNotReachable,
  messageBody,
  operationKey,
  randomPath,
  runAction,
  type RunFacts,
  type SendStep,
  type StepResult,
  UNKNOWN_OUTCOME,
} from './automation-step-rules';
import { wakeTime } from './automation-waits';
import { AutomationsService } from './automations.service';

// One sweep claims at most this many runs, and no more than the queue has room for.
const MAX_QUEUED_STEPS = 1000;
// And at most this many of one store's runs, so a backlog cannot hold back other stores.
const CLAIMS_PER_STORE = 100;
// Temporary provider errors retry for this long from the first try (feature 09).
const SEND_RETRY_LIMIT_MS = 36 * HOUR_MS;
const SEND_RETRY_MAX_DELAY_MS = 6 * HOUR_MS;
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
  async continueRun(storeId: string, queued: RunClaim): Promise<RunClaim | undefined> {
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
        await this.contacts.changeTag(storeId, run.contactId, result.tagChange, system);
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
    // A send already handed to the provider is finished before the exit checks.
    if (step.kind === 'send' && started)
      return this.resend(
        { storeId, claim, contactId: run.contactId, step },
        started,
        run.wakeAt,
        now,
      );
    const facts: RunFacts = {
      storeId,
      runId: claim.runId,
      automationId: run.automationId,
      balanceResumedAt: run.balanceResumedAt,
      contactId: run.contactId,
      tags: await this.contacts.findTags(storeId, run.contactId),
      tappedStepKeys: await this.repository.listTappedStepKeys(storeId, claim.runId),
      wakeAt: run.wakeAt,
    };
    const exitReason = await this.conditions.exitReason(run.graph, facts, now);
    if (exitReason) return exited(exitReason, now);
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
    // Publish refuses it; a version published before that refusal still fails here.
    if (step.reviewBeforeSending) return failed('Review before sending is not available yet', now);
    const row = { stepKey: claim.stepKey, kind: 'send', category: step.category } as const;
    const late = lateSend(step, claim.stepKey, facts, now);
    if (late) return late;
    const renewed = { ...claim, claimedAt: now };
    const started = await this.transaction.run(storeId, async (): Promise<GateResult> => {
      const renewal = { status: 'running', claimedAt: now } as const;
      if (!(await this.repository.moveRunIfLive(storeId, claim, renewal))) return 'not_live';
      // MSG-1 sends SMS only; Messenger and WhatsApp send with CHAT-2 and CHN-3.
      const decision: SendDecision = step.channels.includes('sms')
        ? await this.sendPolicy.check(storeId, {
            contactId,
            channel: 'sms',
            category: step.category,
            at: now,
          })
        : { action: 'skip', reason: 'window_closed' };
      if (decision.action !== 'send') return { decision };
      const written = await this.writeSend({ storeId, claim, contactId, step }, now);
      if (written) return { decision, ...written };
      await this.automations.pauseForBalance(storeId, facts.automationId, system);
      return 'no_credits';
    });
    // The workflow is paused for its balance: the run waits at this step, which the sweep skips
    // until a top-up resumes the workflow.
    if (started === 'no_credits')
      return { claim: renewed, run: { status: 'waiting', wakeAt: facts.wakeAt ?? now } };
    // A pause, stop or archive, or another claim, came first: nothing was reserved.
    if (started === 'not_live') return this.heldOrStale(storeId, claim, now);
    const { decision } = started;
    if ('body' in started) {
      const { body, destination } = started;
      const delivery = { storeId, claim: renewed, contactId, step, body, destination };
      return this.deliver({ ...delivery, isFirstTry: true }, now, now);
    }
    if (decision.action === 'defer')
      return { claim: renewed, run: { status: 'waiting', wakeAt: decision.until } };
    if (decision.action === 'skip')
      return {
        ...ifNotReachable(step, now),
        claim: renewed,
        step: { ...row, outcome: 'skipped', skipReason: decision.reason },
      };
    return undefined;
  }

  // With a send row that may have reached the provider, ending the run keeps its credits.
  private async heldOrStale(storeId: string, claim: RunClaim, now: Date, hasSendingRow = false) {
    const run = await this.repository.findRun(storeId, claim.runId);
    const held = run && holdsClaim(run, claim) ? holdOrEnd(run, now) : undefined;
    return held && hasSendingRow ? endWithUnknownOutcome(held) : held;
  }

  // Inside the gate's transaction. The credits are reserved first, so a short balance leaves
  // nothing behind; the opt-out address has a fixed length, so a stand-in code counts the same parts.
  private async writeSend(
    { storeId, claim, contactId, step }: Omit<Delivery, 'body' | 'destination' | 'isFirstTry'>,
    now: Date,
  ): Promise<Pick<Delivery, 'body' | 'destination'> | undefined> {
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
    // The phone is frozen with the decision; a retry refuses a contact whose phone changed since.
    const [recipient] = await this.contacts.findRecipients(storeId, [contactId]);
    const destination = recipient?.phone ?? null;
    await this.repository.insertStep(storeId, claim.runId, contactId, {
      stepKey: claim.stepKey,
      kind: 'send',
      category: step.category,
      id,
      outcome: 'sending',
      channel: 'sms',
      optOutCode: optOut?.code ?? null,
      destination,
      sentAt: now,
    });
    return { body: messageBody(step, optOut?.url), destination };
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

  // Feature 09: consent, block, the address and quiet hours are checked again right before the
  // provider gets the message; the cap is not, because the send row already counts. The first try
  // may have reached the provider, so a step ended here is unconfirmed and keeps its credits.
  private async resend(
    delivery: Omit<Delivery, 'body' | 'destination' | 'isFirstTry'>,
    started: SendingStep,
    wakeAt: Date | null,
    now: Date,
  ): Promise<StepResult | undefined> {
    const { storeId, contactId, step } = delivery;
    const renewal = { status: 'running', claimedAt: now } as const;
    // A stopped, paused or archived workflow is not resent.
    if (!(await this.repository.moveRunIfLive(storeId, delivery.claim, renewal)))
      return this.heldOrStale(storeId, delivery.claim, now, true);
    const claim = { ...delivery.claim, claimedAt: now };
    const unconfirmed = { claim, stepChange: { outcome: 'unconfirmed' } } as const;
    if (now.getTime() - started.sentAt.getTime() >= SEND_RETRY_LIMIT_MS)
      return {
        ...failed(`The SMS provider did not answer for 36 hours. ${UNKNOWN_OUTCOME}`, now),
        ...unconfirmed,
      };
    // As for a fresh send, a message due more than a day ago is not sent.
    if (wakeAt && now.getTime() - wakeAt.getTime() > DAY_MS)
      return { ...goOn(step.next, now), ...unconfirmed };
    const request = { contactId, channel: 'sms', category: step.category, at: now } as const;
    const decision = await this.sendPolicy.recheck(storeId, request);
    if (decision.action === 'defer')
      return { claim, run: { status: 'waiting', wakeAt: decision.until } };
    if (decision.action === 'skip') {
      const next = ifNotReachable(step, now);
      return {
        ...next,
        run: { ...next.run, lastError: UNKNOWN_OUTCOME },
        claim,
        stepChange: { outcome: 'unconfirmed', skipReason: decision.reason },
      };
    }
    const optOutUrl = started.optOutCode ? this.links.optOutUrl(started.optOutCode) : undefined;
    const body = messageBody(step, optOutUrl);
    const { destination } = started;
    return this.deliver(
      { ...delivery, claim, body, destination, isFirstTry: false },
      started.sentAt,
      now,
    );
  }

  // Called with no transaction open. The operation key makes a repeat return the first result, so
  // a retry after an unknown outcome sends once.
  private async deliver(
    { storeId, claim, contactId, step, body, destination, isFirstTry }: Delivery,
    firstTriedAt: Date,
    now: Date,
  ): Promise<StepResult> {
    try {
      const message = {
        channel: 'sms',
        contactId,
        body,
        operationKey: operationKey(claim),
        ...(destination && { destination }),
      } as const;
      const { providerMessageId, credits } = await this.messaging.send(storeId, message);
      return {
        ...goOn(step.next, now),
        claim,
        stepChange: { outcome: 'sent', providerMessageId, sentAt: now },
        credits: { settle: 'charge', quantity: credits },
      };
    } catch (error) {
      // MessagingService refuses before it calls the provider, so a refused first try never
      // reached it. After an earlier try with an unknown outcome the credits stay reserved.
      if (error instanceof AppError)
        return isFirstTry
          ? {
              ...failed(error.message, now),
              claim,
              stepChange: { outcome: 'failed' },
              credits: { settle: 'release' },
            }
          : {
              ...failed(`${error.message}. ${UNKNOWN_OUTCOME}`, now),
              claim,
              stepChange: { outcome: 'unconfirmed' },
            };
      const tried = now.getTime() - firstTriedAt.getTime();
      if (tried >= SEND_RETRY_LIMIT_MS)
        return {
          ...failed(`The SMS provider did not answer for 36 hours. ${UNKNOWN_OUTCOME}`, now),
          claim,
          stepChange: { outcome: 'unconfirmed' },
        };
      // The run retries on its own; the report holds ids only.
      this.reporter.reportJob(serializeError(error), operationKey(claim));
      // The wait doubles with the time already spent, from a minute up to six hours.
      const delay = Math.min(Math.max(tried, MINUTE_MS), SEND_RETRY_MAX_DELAY_MS);
      const lastError = 'The SMS provider did not answer; trying again';
      return {
        claim,
        run: { status: 'waiting', wakeAt: new Date(now.getTime() + delay), lastError },
      };
    }
  }
}
