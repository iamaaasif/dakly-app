import { Inject, Injectable } from '@nestjs/common';

import { MessagingService } from '../messaging/messaging.service';
import { newId } from '../platform/database/new-id';
import { AppError } from '../platform/errors/app-error';
import { SendPolicyService } from '../sending/send-policy.service';
import { AutomationOrderTextService } from './automation-order-text.service';
import { AutomationRunsRepository, type RunClaim } from './automation-runs.repository';
import {
  failed,
  type GateResult,
  goOn,
  MESSENGER_WINDOW_MS,
  operationKey,
  type SendStep,
  type StepResult,
} from './automation-step-rules';

type Route = NonNullable<Awaited<ReturnType<MessagingService['latestMessengerRoute']>>>;

// A workflow send step on Messenger: it goes through the chat transport while the contact's
// window is open. It never retries, because a second try could send the text twice.
@Injectable()
export class AutomationMessengerSendService {
  constructor(
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(SendPolicyService) private readonly sendPolicy: SendPolicyService,
    @Inject(AutomationOrderTextService) private readonly orderText: AutomationOrderTextService,
    @Inject(AutomationRunsRepository) private readonly repository: AutomationRunsRepository,
  ) {}

  // The channels are tried in this order: Messenger, then SMS. Undefined when the step lists
  // neither.
  async checkChannels(
    storeId: string,
    step: SendStep,
    contactId: string,
    lockedContactExists: boolean | undefined,
  ) {
    const messenger = await this.checkMessenger(storeId, step, contactId, lockedContactExists);
    if (messenger || !step.channels.includes('sms')) return messenger;
    const checked = await this.sendPolicy.checkForSend(
      storeId,
      { contactId, channel: 'sms', category: step.category },
      lockedContactExists,
    );
    return { ...checked, channel: 'sms' as const };
  }

  // Undefined when the step does not list Messenger, or the contact cannot be reached there and
  // the step lists SMS to try instead.
  private async checkMessenger(
    storeId: string,
    step: SendStep,
    contactId: string,
    lockedContactExists: boolean | undefined,
  ) {
    if (!step.channels.includes('messenger')) return undefined;
    const route = await this.messaging.latestMessengerRoute(storeId, contactId);
    const checked = await this.sendPolicy.checkForSend(
      storeId,
      {
        contactId,
        channel: 'messenger',
        category: step.category,
        windowClosesAt: route && new Date(route.lastInboundAt.getTime() + MESSENGER_WINDOW_MS),
      },
      lockedContactExists,
    );
    if (checked.decision.action === 'skip' && step.channels.includes('sms')) return undefined;
    return { ...checked, channel: 'messenger' as const, route };
  }

  // Inside the gate's transaction: the step row is written before the message is sent.
  async reserve(
    { storeId, claim, orderId, step, contactId }: ReserveInput,
    route: Route | undefined,
    times: { sentAt: Date; firstTriedAt: Date },
  ): Promise<GateResult> {
    if (!route) return { decision: { action: 'skip', reason: 'window_closed' } };
    const prepared = await this.orderText.prepare(storeId, orderId, step.message.text);
    const body = (await prepared?.render()) ?? step.message.text;
    const stepId = newId();
    await this.repository.insertStep(storeId, claim.runId, contactId, {
      stepKey: claim.stepKey,
      kind: 'send',
      category: step.category,
      id: stepId,
      outcome: 'sending',
      channel: 'messenger',
      ...times,
      renderedText: body,
    });
    return {
      decision: { action: 'send' },
      body,
      destination: route.address,
      at: times.sentAt,
      firstTriedAt: times.firstTriedAt,
      messenger: { connectionId: route.connectionId, identityId: route.identityId, stepId },
    };
  }

  async deliver(
    { storeId, contactId, step }: { storeId: string; contactId: string; step: SendStep },
    { claim, at, body, messenger }: PlannedSend,
  ): Promise<StepResult> {
    const { connectionId, identityId, stepId } = messenger;
    const result = await this.messaging
      .sendCampaignMessage(storeId, {
        channel: 'messenger',
        contactId,
        connectionId,
        identityId,
        content: body,
        category: step.category,
        operationKey: operationKey(claim),
        buttons: step.message.buttons.map(({ key, label }) => ({
          title: label,
          payload: `workflow:${stepId}:${key}`,
        })),
      })
      .catch((error: unknown) => {
        if (!(error instanceof AppError)) throw error;
        return { status: 'failed', errorCode: error.code } as const;
      });
    const now = await this.repository.schedulerTime(storeId);
    if (result.status === 'sent')
      return {
        ...goOn(step.next, now),
        claim,
        stepChange: { outcome: 'sent', providerMessageId: result.externalMessageId, sentAt: at },
      };
    if (result.status === 'failed')
      return {
        ...failed(`Messenger did not send the message (${result.errorCode})`, now),
        claim,
        stepChange: { outcome: 'failed' },
      };
    return { ...unconfirmed(now), claim };
  }

  // A worker stopped after the step row was written, so the message may or may not have gone out.
  interrupted(now: Date): StepResult {
    return unconfirmed(now);
  }
}

function unconfirmed(now: Date): StepResult {
  return {
    ...failed('Messenger did not confirm this message, so it is not sent again', now),
    stepChange: { outcome: 'unconfirmed' },
  };
}

type ReserveInput = {
  storeId: string;
  claim: RunClaim;
  contactId: string;
  orderId: string | null;
  step: SendStep;
};
type PlannedSend = {
  claim: RunClaim;
  at: Date;
  body: string;
  messenger: NonNullable<Extract<GateResult, { messenger?: unknown }>['messenger']>;
};
