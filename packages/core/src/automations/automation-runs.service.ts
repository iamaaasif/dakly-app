import { Inject, Injectable } from '@nestjs/common';

import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';
import { countSmsParts } from '@dakly/contracts/sms';

import { ContactsService } from '../contacts/contacts.service';
import { LinksService } from '../links/links.service';
import { MessagingService } from '../messaging/messaging.service';
import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { HOUR_MS, MINUTE_MS } from '../platform/time';
import { SegmentsService } from '../segments/segments.service';
import { type SendDecision, SendPolicyService } from '../sending/send-policy.service';
import { StoresService } from '../stores/stores.service';
import { WalletService } from '../wallets/wallet.service';
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
  hasHappened,
  lateSend,
  holdOrEnd,
  holdsClaim,
  ifNotReachable,
  messageBody,
  operationKey,
  randomPath,
  runAction,
  type Condition,
  type PathChoice,
  type RunFacts,
  type SendStep,
  type StepResult,
  UNKNOWN_OUTCOME,
} from './automation-step-rules';
import { wakeTime } from './automation-waits';
import { AutomationsService } from './automations.service';

const CLAIM_BATCH_SIZE = 100;
// One sweep claims at most this many batches, so a backlog spreads over the next ticks.
const CLAIM_BATCHES_PER_SWEEP = 10;
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
    @Inject(SegmentsService) private readonly segments: SegmentsService,
    @Inject(SendPolicyService) private readonly sendPolicy: SendPolicyService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(LinksService) private readonly links: LinksService,
    @Inject(WalletService) private readonly wallets: WalletService,
    @Inject(AutomationsService) private readonly automations: AutomationsService,
  ) {}

  // Claims, then queues, with no transaction open. A sweep that stops in between leaves running
  // claims that a later sweep takes again once they are five minutes old.
  async wakeDueRuns(queueSteps: (claims: DueRun[]) => Promise<void>) {
    for (let batch = 0; batch < CLAIM_BATCHES_PER_SWEEP; batch++) {
      const claims = await this.repository.claimDue(CLAIM_BATCH_SIZE);
      await queueSteps(claims);
      if (claims.length < CLAIM_BATCH_SIZE) return;
    }
  }

  // Returns the claim on the next step when the run goes straight on, for its job to queue.
  async continueRun(storeId: string, claim: RunClaim): Promise<RunClaim | undefined> {
    const found = await this.repository.findRun(storeId, claim.runId);
    if (!found || !holdsClaim(found, claim)) return undefined;
    const attempts = await this.repository.startWork(storeId, claim);
    if (attempts === undefined) return undefined;
    const run = { ...found, attempts };
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
      return this.resend({ storeId, claim, contactId: run.contactId, step }, started, now);
    const facts: RunFacts = {
      storeId,
      runId: claim.runId,
      automationId: run.automationId,
      balancePausedAt: run.balancePausedAt,
      contactId: run.contactId,
      tags: await this.contacts.findTags(storeId, run.contactId),
      tappedStepKeys: await this.repository.listTappedStepKeys(storeId, claim.runId),
      wakeAt: run.wakeAt,
    };
    const exitReason = await this.exitReason(run.graph, facts, now);
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
      const body = await this.writeSend({ storeId, claim, contactId, step }, now);
      if (body !== undefined) return { decision, body };
      await this.automations.pauseForBalance(storeId, facts.automationId);
      return 'no_credits';
    });
    // The workflow is paused for its balance: the run waits at this step, which the sweep skips
    // until a top-up resumes the workflow.
    if (started === 'no_credits')
      return { claim: renewed, run: { status: 'waiting', wakeAt: facts.wakeAt ?? now } };
    // A pause, stop or archive, or another claim, came first: nothing was reserved.
    if (started === 'not_live') return this.heldOrStale(storeId, claim, now);
    const { decision } = started;
    if ('body' in started)
      return this.deliver(
        { storeId, claim: renewed, contactId, step, body: started.body, isFirstTry: true },
        now,
        now,
      );
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

  private async heldOrStale(storeId: string, claim: RunClaim, now: Date) {
    const run = await this.repository.findRun(storeId, claim.runId);
    return run && holdsClaim(run, claim) ? holdOrEnd(run, now) : undefined;
  }

  // Inside the gate's transaction. The credits are reserved first, so a short balance leaves
  // nothing behind; the opt-out address has a fixed length, so a stand-in code counts the same parts.
  private async writeSend(
    { storeId, claim, contactId, step }: Omit<Delivery, 'body' | 'isFirstTry'>,
    now: Date,
  ): Promise<string | undefined> {
    const isMarketing = step.category === 'marketing';
    const standIn = isMarketing ? this.links.optOutUrl('00000000') : undefined;
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
      optOutCode: optOut?.code ?? null,
      sentAt: now,
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

  // Feature 09: consent, block and the address are checked again right before the provider gets
  // the message. The frequency cap is not, because the send row already counts. The first try may
  // have reached the provider, so a refusal here keeps the credits reserved.
  private async resend(
    delivery: Omit<Delivery, 'body' | 'isFirstTry'>,
    started: SendingStep,
    now: Date,
  ): Promise<StepResult | undefined> {
    const { storeId, contactId, step } = delivery;
    const renewal = { status: 'running', claimedAt: now } as const;
    if (!(await this.repository.moveRun(storeId, delivery.claim, renewal))) return undefined;
    const claim = { ...delivery.claim, claimedAt: now };
    const request = { contactId, channel: 'sms', category: step.category, at: now } as const;
    const skipReason = await this.sendPolicy.recheck(storeId, request);
    if (skipReason) {
      const next = ifNotReachable(step, now);
      return {
        ...next,
        run: { ...next.run, lastError: UNKNOWN_OUTCOME },
        claim,
        stepChange: { outcome: 'failed', skipReason },
      };
    }
    const optOutUrl = started.optOutCode ? this.links.optOutUrl(started.optOutCode) : undefined;
    const body = messageBody(step, optOutUrl);
    return this.deliver({ ...delivery, claim, body, isFirstTry: false }, started.sentAt, now);
  }

  // Called with no transaction open. The operation key makes a repeat return the first result, so
  // a retry after an unknown outcome sends once.
  private async deliver(
    { storeId, claim, contactId, step, body, isFirstTry }: Delivery,
    firstTriedAt: Date,
    now: Date,
  ): Promise<StepResult> {
    try {
      const message = {
        channel: 'sms',
        contactId,
        body,
        operationKey: operationKey(claim),
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
        return {
          ...failed(error.message, now),
          claim,
          stepChange: { outcome: 'failed' },
          ...(isFirstTry && { credits: { settle: 'release' } }),
        };
      const tried = now.getTime() - firstTriedAt.getTime();
      if (tried >= SEND_RETRY_LIMIT_MS)
        return {
          ...failed(`The SMS provider did not answer for 36 hours. ${UNKNOWN_OUTCOME}`, now),
          claim,
          stepChange: { outcome: 'failed' },
        };
      // The wait doubles with the time already spent, from a minute up to six hours.
      const delay = Math.min(Math.max(tried, MINUTE_MS), SEND_RETRY_MAX_DELAY_MS);
      const lastError = 'The SMS provider did not answer; trying again';
      return {
        claim,
        run: { status: 'waiting', wakeAt: new Date(now.getTime() + delay), lastError },
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
