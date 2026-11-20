import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import {
  type ChatClassification,
  chatClassificationSchema,
} from '@dakly/contracts/chat-classification';
import type { handoverReasons } from '@dakly/contracts/chats';

import { AiRunsService } from '../ai/ai-runs.service';
import { AiService } from '../ai/ai.service';
import { ConsentService } from '../consents/consent.service';
import { ContactIdentitiesService } from '../contacts/contact-identities.service';
import { ContactsService } from '../contacts/contacts.service';
import { InboxService } from '../messaging/inbox.service';
import { MessagingService } from '../messaging/messaging.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { OutboxService } from '../platform/outbox/outbox.service';
import { QUEUES } from '../platform/queue/queues';
import { MINUTE_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { UsageService } from '../usage/usage.service';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';
import { classifyChat } from './prompts/classify-chat.v1';
import { checkReplyFacts } from './reply-fact-check';
import { type ComposedReply, SalesAgentService } from './sales-agent.service';

export const REPLY_TO_CUSTOMER = 'reply-to-customer';
const HOLDING_REPLY = 'একটু অপেক্ষা করুন, আমাদের টিম আপনাকে জানাবে।';
type Reason = (typeof handoverReasons)[number];
type Turn = NonNullable<Awaited<ReturnType<InboxService['aiReplyTurn']>>>;
type EligibleTurn = {
  turn: Turn;
  target: {
    contactId: string;
    channel: Exclude<Turn['channel'], 'whatsapp'>;
    connectionId: string;
    identityId: string;
  };
  debounceSeconds: number;
  claimTimeoutMinutes: number | null;
};

@Injectable()
export class AiAgentService {
  constructor(
    @Inject(AiAgentSettingsRepository) private readonly settings: AiAgentSettingsRepository,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(AiRunsService) private readonly runs: AiRunsService,
    @Inject(SalesAgentService) private readonly sales: SalesAgentService,
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(ContactIdentitiesService) private readonly identities: ContactIdentitiesService,
    @Inject(ConsentService) private readonly consent: ConsentService,
    @Inject(UsageService) private readonly usage: UsageService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @InjectQueue(QUEUES.aiReply) private readonly queue: Queue,
  ) {}

  async schedule(storeId: string, conversationId: string, messageId: string) {
    const settings = await this.enabledSettings(storeId);
    if (!settings) return;
    const turn = await this.inbox.aiReplyTurn(storeId, conversationId);
    const arrival = turn?.inbound.find(({ id }) => id === messageId);
    if (!turn || arrival?.createdAt.getTime() !== turn.latest.createdAt.getTime()) return;
    const delay = settings.debounceSeconds * 1000;
    await this.queue.add(
      REPLY_TO_CUSTOMER,
      { storeId, conversationId, messageId: turn.latest.id },
      {
        jobId: `ai-reply-${messageId}`,
        delay,
        deduplication: {
          id: `${storeId}-${conversationId}`,
          replace: true,
          keepLastIfActive: true,
        },
        attempts: 3,
        backoff: { type: 'exponential', delay: MINUTE_MS },
        removeOnComplete: { age: 60 * 60 },
        removeOnFail: 100,
      },
    );
  }

  // A person's reply keeps the chat with people until the store's return timer runs out.
  async restartReturnAfterStaffReply(storeId: string, messageId: string) {
    const settings = await this.enabledSettings(storeId);
    if (settings?.returnToAiMinutes)
      await this.inbox.restartReturnAfterStaffReply(storeId, messageId, settings.returnToAiMinutes);
  }

  async reply(storeId: string, conversationId: string, messageId: string) {
    const candidate = await this.eligibleTurn(storeId, conversationId);
    if (!candidate) return;
    const { turn, debounceSeconds } = candidate;
    if (turn.latest.id !== messageId) {
      // A later event may have arrived while an older subscriber was adding its job.
      await this.schedule(storeId, conversationId, turn.latest.id);
      return;
    }
    const texts = burstText(turn, debounceSeconds * 1000);
    // A window that already holds a unit finishes even when the allowance is used up.
    const reference = await this.windowReference(storeId, turn.contactId);
    const hasRoom =
      (await this.usage.isConsumed(storeId, 'ai_conversation', reference)) ||
      (await this.usage.hasAllowance(storeId, 'ai_conversation', 1));
    const reason = hasRoom ? await this.classify(storeId, texts) : 'allowance_used';
    if (reason === 'busy') return this.retryLater();
    if (reason) return this.handOver(storeId, conversationId, candidate, reason);
    const composed = await this.sales.compose({
      storeId,
      conversationId,
      contactId: turn.contactId,
      customerTexts: texts,
    });
    if (composed.kind === 'busy') return this.retryLater();
    if (composed.kind === 'handover')
      return this.handOver(storeId, conversationId, candidate, composed.reason);
    const shop = await this.stores.settings(storeId);
    const checked = checkReplyFacts(composed.text, composed.toolResults, {
      phone: shop.phone,
      linkBaseUrl: loadEnv().SHORT_LINK_BASE_URL,
    });
    if (!checked.isSafe) {
      await this.runs.setOutcome(storeId, composed.aiRunId, 'failed_check', checked.failure);
      return this.handOver(storeId, conversationId, candidate, 'out_of_scope');
    }
    return this.send(storeId, conversationId, candidate, composed);
  }

  private retryLater() {
    return { delayUntil: this.clock.now().getTime() + 1000 };
  }

  private async eligibleTurn(
    storeId: string,
    id: string,
    lock = false,
  ): Promise<EligibleTurn | undefined> {
    const settings = await this.enabledSettings(storeId);
    if (!settings) return;
    const turn = await this.inbox.aiReplyTurn(storeId, id, lock);
    if (!turn || turn.channel === 'whatsapp') return;
    const { contactId, channel, connectionId, latest } = turn;
    const contact = await this.contacts.findRecipient(storeId, contactId);
    if (!contact || contact.kind === 'not_customer' || contact.isBlocked) return;
    const consent = await this.consent.current(storeId, [contactId], channel);
    if (consent.some(({ status }) => status === 'withdrawn')) return;
    const target = { contactId, channel, connectionId, identityId: latest.senderIdentityId };
    if (!(await this.identities.findOutboundIdentity(storeId, target))) return;
    return {
      turn,
      target,
      debounceSeconds: settings.debounceSeconds,
      claimTimeoutMinutes: settings.claimTimeoutMinutes,
    };
  }

  private async enabledSettings(storeId: string) {
    const settings = await this.settings.enabled(storeId);
    if (settings && (await this.stores.settings(storeId)).extensions.includes('chats'))
      return settings;
  }

  private async classify(storeId: string, texts: string[]): Promise<Reason | 'busy' | null> {
    if (!texts.length) return null;
    const result = await this.ai.run(storeId, {
      tier: 'fast',
      purpose: 'classify',
      prompt: classifyChat,
      input: JSON.stringify({ customer_messages: texts }),
      output: chatClassificationSchema,
    });
    if (result.kind === 'output') return handoverReason(texts, result.output);
    if (result.kind === 'failure' && result.code === 'AI_STORE_BUSY') return 'busy';
    return 'ai_unavailable';
  }

  private async handOver(
    storeId: string,
    conversationId: string,
    before: EligibleTurn,
    reason: Reason,
  ) {
    await this.transaction.runLocked(storeId, async () => {
      const current = await this.lockCurrent(storeId, conversationId, before);
      if (!current) return;
      const change = await this.inbox.handOver(
        storeId,
        conversationId,
        reason,
        current.claimTimeoutMinutes,
      );
      if (!change) return;
      await this.outbox.publish({
        type: 'conversation.handed_over',
        storeId,
        occurredAt: this.clock.now().toISOString(),
        payload: { conversationId, reason },
      });
      await this.messaging.queueChannelMessage(storeId, {
        ...current.target,
        category: 'staff_reply',
        actor: { kind: 'system' },
        content: HOLDING_REPLY,
        operationKey: `ai-handover:${current.turn.latest.id}`,
      });
      await this.notifications.notify(storeId, {
        assigneeUserId: change.assigneeUserId,
        type: 'conversation.handed_over',
        category: 'fix_now',
        dedupeKey: `handover:${current.turn.latest.id}`,
        title: 'A conversation needs your reply',
      });
    });
  }

  // Sends the product cards, then the reply, and spends one AI conversation unit with them.
  private async send(
    storeId: string,
    conversationId: string,
    before: EligibleTurn,
    composed: Extract<ComposedReply, { kind: 'reply' }>,
  ) {
    const { aiRunId, cardTexts, sources, text } = composed;
    let isSaved = false;
    try {
      await this.transaction.runLocked(storeId, async () => {
        const current = await this.lockCurrent(storeId, conversationId, before);
        if (!current) return;
        const latestId = current.turn.latest.id;
        const send = (content: string, key: string, aiSources?: typeof sources) =>
          this.messaging.queueChannelMessage(storeId, {
            ...current.target,
            category: 'staff_reply',
            actor: { kind: 'ai', aiRunId },
            content,
            operationKey: `ai-reply:${latestId}:${key}`,
            aiSources,
          });
        for (const [index, card] of cardTexts.entries()) await send(card, `card-${index}`);
        await send(text, 'reply', sources);
        // After queuing, so the window starts at the earliest saved AI reply.
        await this.usage.consume(storeId, {
          unit: 'ai_conversation',
          quantity: 1,
          reference: await this.windowReference(storeId, current.target.contactId),
        });
        isSaved = true;
      });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      // A retried job finds its reply already saved under the same operation key.
      if (error.code === 'USAGE_ALLOWANCE_EXCEEDED')
        return this.handOver(storeId, conversationId, before, 'allowance_used');
      if (error.code !== 'MESSAGE_OPERATION_CONFLICT') throw error;
    }
    if (isSaved) await this.runs.setOutcome(storeId, aiRunId, 'sent');
  }

  // One unit covers every AI reply to a contact in the 24 hours after the first.
  private async windowReference(storeId: string, contactId: string) {
    const start = (await this.inbox.firstAiReplyInDay(storeId, contactId)) ?? this.clock.now();
    return `ai-window:${contactId}:${start.toISOString()}`;
  }

  // Returns the turn only when nothing changed since the model started.
  private async lockCurrent(storeId: string, conversationId: string, before: EligibleTurn) {
    try {
      await this.contacts.lockForConsent(storeId, [before.target.contactId]);
    } catch (error) {
      if (error instanceof AppError && error.code === 'CONTACT_NOT_FOUND') return undefined;
      throw error;
    }
    const current = await this.eligibleTurn(storeId, conversationId, true);
    const unchanged =
      current &&
      current.target.contactId === before.target.contactId &&
      current.turn.version === before.turn.version &&
      current.turn.inbound.length === before.turn.inbound.length &&
      current.turn.inbound.every(({ id }, index) => id === before.turn.inbound[index]?.id);
    return unchanged ? current : undefined;
  }
}

function burstText(turn: Turn, delay: number) {
  const texts: string[] = [];
  let previous = turn.latest.createdAt.getTime();
  for (const message of turn.inbound) {
    if (message.senderIdentityId !== turn.latest.senderIdentityId) break;
    const receivedAt = message.createdAt.getTime();
    if (previous - receivedAt > delay) break;
    if (message.body) texts.push(message.body.slice(0, 2000));
    previous = receivedAt;
  }
  return texts.reverse();
}

export function handoverReason(texts: string[], result: ChatClassification): Reason | null {
  if (result.asksForPerson) return 'asked_for_person';
  const text = texts.join('\n').normalize('NFKC').toLowerCase();
  const rule = handoverRules.find(
    ({ intent, pattern }) => intent === result.intent || pattern.test(text),
  );
  if (rule) return rule.reason;
  if (result.handover) return result.handover;
  if (result.sentiment === 'angry') return 'angry';
  return result.confidence === 'low' || result.intent === 'special_request' ? 'out_of_scope' : null;
}

const handoverRules: { intent?: ChatClassification['intent']; pattern: RegExp; reason: Reason }[] =
  [
    { intent: 'exchange', pattern: /\b(refund|exchange|ferot)\b|ফেরত|বদল/u, reason: 'refund' },
    {
      intent: 'complaint',
      pattern: /\b(damaged|fake|chera|broken)\b|নকল|ছেঁড়া/u,
      reason: 'complaint',
    },
    { pattern: /\b(discount|chhar)\b|ছাড়/u, reason: 'discount' },
  ];
