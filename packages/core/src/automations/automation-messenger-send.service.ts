import { Inject, Injectable } from '@nestjs/common';

import { MessagingService } from '../messaging/messaging.service';
import { newId } from '../platform/database/new-id';
import { AppError } from '../platform/errors/app-error';
import { SendPolicyService, type SkipReason } from '../sending/send-policy.service';
import { AutomationOrderTextService } from './automation-order-text.service';
import { AutomationRunsRepository, type RunClaim } from './automation-runs.repository';
import {
  failed,
  type ChatChannel,
  type GateResult,
  goOn,
  MESSENGER_WINDOW_MS,
  operationKey,
  type SendStep,
  type StepResult,
} from './automation-step-rules';

type Route = NonNullable<Awaited<ReturnType<MessagingService['latestChatRoute']>>>;
const CHAT_CHANNELS: readonly ChatChannel[] = ['messenger', 'instagram'];
const CHANNEL_NAMES = { messenger: 'Messenger', instagram: 'Instagram' } as const;

// A workflow send step on Messenger or Instagram: it goes through the chat transport while the
// contact's 24-hour window is open. It never retries, because a second try could send the text
// twice.
@Injectable()
export class AutomationMessengerSendService {
  constructor(
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(SendPolicyService) private readonly sendPolicy: SendPolicyService,
    @Inject(AutomationOrderTextService) private readonly orderText: AutomationOrderTextService,
    @Inject(AutomationRunsRepository) private readonly repository: AutomationRunsRepository,
  ) {}

  // The channels are tried in this order: Messenger, Instagram, then SMS. Undefined when the step
  // lists none of them.
  async checkChannels(
    storeId: string,
    step: SendStep,
    contactId: string,
    lockedContactExists: boolean | undefined,
  ) {
    const chats = CHAT_CHANNELS.filter((channel) => step.channels.includes(channel));
    for (const [index, channel] of chats.entries()) {
      const hasFallback = index < chats.length - 1 || step.channels.includes('sms');
      const checked = await this.checkChat(
        storeId,
        { step, contactId, channel, hasFallback },
        lockedContactExists,
      );
      if (checked) return checked;
    }
    if (!step.channels.includes('sms')) return undefined;
    const checked = await this.sendPolicy.checkForSend(
      storeId,
      { contactId, channel: 'sms', category: step.category },
      lockedContactExists,
    );
    return { ...checked, channel: 'sms' as const };
  }

  // Undefined when the contact cannot be reached on this channel and the step lists another to
  // try instead.
  private async checkChat(
    storeId: string,
    {
      step,
      contactId,
      channel,
      hasFallback,
    }: { step: SendStep; contactId: string; channel: ChatChannel; hasFallback: boolean },
    lockedContactExists: boolean | undefined,
  ) {
    const route = await this.messaging.latestChatRoute(storeId, contactId, channel);
    const policy = await this.sendPolicy.checkForSend(
      storeId,
      {
        contactId,
        channel,
        category: step.category,
        windowClosesAt: route && new Date(route.lastInboundAt.getTime() + MESSENGER_WINDOW_MS),
      },
      lockedContactExists,
    );
    // With no chat on any Page the contact has no address here; the window check would say
    // window_closed first.
    const { decision } = policy;
    const noChat = !route && decision.action === 'skip' && decision.reason === 'window_closed';
    const checked = noChat ? { ...policy, decision: skipped('no_address') } : policy;
    if (checked.decision.action === 'skip' && hasFallback) return undefined;
    return { ...checked, channel, route };
  }

  // Inside the gate's transaction: the step row is written before the message is sent.
  async reserve(
    { storeId, claim, orderId, step, contactId, channel }: ReserveInput,
    route: Route | undefined,
    times: { sentAt: Date; firstTriedAt: Date },
  ): Promise<GateResult> {
    if (!route) return { decision: skipped('no_address') };
    const text = step.message.messengerText ?? step.message.text;
    const prepared = await this.orderText.prepare(storeId, orderId, text);
    const body = (await prepared?.render()) ?? text;
    const stepId = newId();
    await this.repository.insertStep(storeId, claim.runId, contactId, {
      stepKey: claim.stepKey,
      kind: 'send',
      category: step.category,
      id: stepId,
      outcome: 'sending',
      channel,
      ...times,
      renderedText: body,
    });
    return {
      decision: { action: 'send' },
      body,
      destination: route.address,
      at: times.sentAt,
      firstTriedAt: times.firstTriedAt,
      chat: { channel, connectionId: route.connectionId, identityId: route.identityId, stepId },
    };
  }

  async deliver(
    { storeId, contactId, step }: { storeId: string; contactId: string; step: SendStep },
    { claim, at, body, chat }: PlannedSend,
  ): Promise<StepResult> {
    const { channel, connectionId, identityId, stepId } = chat;
    const result = await this.messaging
      .sendCampaignMessage(storeId, {
        channel,
        contactId,
        connectionId,
        identityId,
        content: body,
        category: step.category,
        operationKey: operationKey(claim),
        // The Instagram driver sends text and cards only, so a reply button is a Messenger feature.
        buttons:
          channel === 'messenger'
            ? step.message.buttons.map(({ key, label }) => ({
                title: label,
                payload: `workflow:${stepId}:${key}`,
              }))
            : [],
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
        ...failed(`${CHANNEL_NAMES[channel]} did not send the message (${result.errorCode})`, now),
        claim,
        stepChange: { outcome: 'failed' },
      };
    return { ...unconfirmed(now, channel), claim };
  }

  // A worker stopped after the step row was written, so the message may or may not have gone out.
  interrupted(now: Date, channel: ChatChannel): StepResult {
    return unconfirmed(now, channel);
  }
}

function skipped(reason: SkipReason) {
  return { action: 'skip', reason } as const;
}

function unconfirmed(now: Date, channel: ChatChannel): StepResult {
  return {
    ...failed(
      `${CHANNEL_NAMES[channel]} did not confirm this message, so it is not sent again`,
      now,
    ),
    stepChange: { outcome: 'unconfirmed' },
  };
}

type ReserveInput = {
  storeId: string;
  claim: RunClaim;
  contactId: string;
  orderId: string | null;
  step: SendStep;
  channel: ChatChannel;
};
type PlannedSend = {
  claim: RunClaim;
  at: Date;
  body: string;
  chat: NonNullable<Extract<GateResult, { chat?: unknown }>['chat']>;
};
