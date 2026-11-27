import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import type { handoverReasons } from '@dakly/contracts/chats';
import { parseCardTap } from '@dakly/contracts/product-card';
import type { ProductCarousel } from '@dakly/contracts/product-card';

import { AiRunsService } from '../ai/ai-runs.service';
import { BillingService } from '../billing/billing.service';
import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { ConsentService } from '../consents/consent.service';
import { ContactIdentitiesService } from '../contacts/contact-identities.service';
import { ContactsService } from '../contacts/contacts.service';
import { KillSwitchesService } from '../kill-switches/kill-switches.service';
import { InboxService } from '../messaging/inbox.service';
import { MessagingService } from '../messaging/messaging.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { OutboxService } from '../platform/outbox/outbox.service';
import { QUEUES } from '../platform/queue/queues';
import { MINUTE_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { UsageService } from '../usage/usage.service';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';
import { cardMessages } from './card-messages';
import { CardTapRepliesService } from './card-tap-replies.service';
import { ChatClassifierService, type Classified } from './chat-classifier.service';
import { type ConversationEntry, conversationEntries } from './chat-memory';
import { declineReply, holdingReply } from './decline-reply';
import { formatHandoverSummary } from './handover-summary';
import { screenCustomerTexts } from './manipulation-screen';
import { burstText, isFlood, isSameTurn, replyToolChat } from './reply-burst';
import { outageRetryDelay, retryAt } from './reply-retry';
import {
  type ComposedReply,
  type ComposeInput,
  type ProductCard,
  SalesAgentService,
} from './sales-agent.service';
import type { ShopRules } from './shop-rules';

export const REPLY_TO_CUSTOMER = 'reply-to-customer';
// Past this a stuck copy or reading no longer holds the reply back.
const MEDIA_WAIT_MS = 3000;
// Enough to see the product or question the latest messages answer, few enough to stay cheap.
const CLASSIFY_HISTORY_LENGTH = 6;
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
  recipientExternalId: string;
  debounceSeconds: number;
  claimTimeoutMinutes: number | null;
  productCardStyle: 'buttons' | 'text';
  rules: ShopRules;
};

@Injectable()
export class AiAgentService {
  constructor(
    @Inject(AiAgentSettingsRepository) private readonly settings: AiAgentSettingsRepository,
    @Inject(ChatClassifierService) private readonly classifier: ChatClassifierService,
    @Inject(AiRunsService) private readonly runs: AiRunsService,
    @Inject(SalesAgentService) private readonly sales: SalesAgentService,
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(ContactIdentitiesService) private readonly identities: ContactIdentitiesService,
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(ChannelConnectionsService) private readonly channels: ChannelConnectionsService,
    @Inject(ConsentService) private readonly consent: ConsentService,
    @Inject(UsageService) private readonly usage: UsageService,
    @Inject(CardTapRepliesService) private readonly tapReplies: CardTapRepliesService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(KillSwitchesService) private readonly switches: KillSwitchesService,
    @InjectQueue(QUEUES.aiReply) private readonly queue: Queue,
  ) {}

  async schedule(storeId: string, conversationId: string, messageId: string) {
    const settings = await this.enabledSettings(storeId);
    if (!settings) return;
    const turn = await this.inbox.aiReplyTurn(storeId, conversationId);
    const arrival = turn?.inbound.find(({ id }) => id === messageId);
    if (!turn || arrival?.createdAt.getTime() !== turn.latest.createdAt.getTime()) return;
    const dedupeId = `${storeId}-${conversationId}`;
    await this.queue.add(
      REPLY_TO_CUSTOMER,
      { storeId, conversationId, messageId: turn.latest.id },
      {
        jobId: `ai-reply-${messageId}`,
        delay: settings.debounceSeconds * 1000,
        deduplication: { id: dedupeId, replace: true, keepLastIfActive: true },
        attempts: 3,
        backoff: { type: 'exponential', delay: MINUTE_MS },
        removeOnComplete: { age: 60 * 60 },
        removeOnFail: 100,
      },
    );
    await this.showTyping(storeId, conversationId);
  }

  // The customer sees "typing" at once, long before the reply is ready.
  private async showTyping(storeId: string, conversationId: string) {
    const candidate = await this.eligibleTurn(storeId, conversationId);
    if (!candidate) return;
    const { target, recipientExternalId } = candidate;
    await this.channels.showMetaTyping(storeId, { ...target, recipientExternalId });
  }

  // A person's reply keeps the chat with people until the store's return timer runs out.
  async restartReturnAfterStaffReply(storeId: string, messageId: string) {
    const settings = await this.enabledSettings(storeId);
    if (settings?.returnToAiMinutes)
      await this.inbox.restartReturnAfterStaffReply(storeId, messageId, settings.returnToAiMinutes);
  }

  // Either way the customer is handed to a person now, so nobody waits for the stop to end.
  // A flood of messages is not read by a model either: no call is made.
  private async stoppedReason(
    storeId: string,
    turn: Turn,
  ): Promise<'store_read_only' | 'ai_paused' | 'other' | undefined> {
    if (await this.billing.isReadOnly(storeId)) return 'store_read_only';
    if (await this.switches.isPaused('ai_replies', storeId)) return 'ai_paused';
    return isFlood(turn) ? 'other' : undefined;
  }

  async reply(storeId: string, conversationId: string, messageId: string) {
    const candidate = await this.eligibleTurn(storeId, conversationId);
    if (!candidate) return;
    const { turn, debounceSeconds } = candidate;
    // A later event may have arrived while an older subscriber was adding its job.
    if (turn.latest.id !== messageId) return this.schedule(storeId, conversationId, turn.latest.id);
    const stopped = await this.stoppedReason(storeId, turn);
    if (stopped) return this.handOver(storeId, conversationId, candidate, { reason: stopped });
    const burst = burstText(turn, debounceSeconds * 1000, this.clock.now());
    // A photo or voice note is read in the background; answering first would ignore what it says.
    if (burst.awaitingMedia) return retryAt(this.clock.now(), MEDIA_WAIT_MS);
    const earlier = await this.earlierMessages(storeId, conversationId, burst.messageIds);
    const compose = {
      storeId,
      contactId: turn.contactId,
      chat: replyToolChat(conversationId, candidate.target.channel, burst),
      customerTexts: burst.texts,
      rules: candidate.rules,
    };
    const { reason, prepared } = await this.checkHandOver(compose, earlier, burst.screenTexts);
    if (reason === 'busy') return retryAt(this.clock.now());
    if (reason)
      return this.stop(storeId, conversationId, candidate, { reason, texts: burst.texts });
    const composed = await this.sales.compose(compose, prepared);
    if (composed.kind === 'busy') return retryAt(this.clock.now());
    if (composed.kind === 'handover')
      return this.stop(storeId, conversationId, candidate, { ...composed, texts: burst.texts });
    return this.send(storeId, conversationId, candidate, composed);
  }

  // The reads for the reply run while the hand-over check waits for its model. They only read,
  // so a hand-over drops them.
  private async checkHandOver(
    compose: ComposeInput,
    earlier: ConversationEntry[],
    screenTexts: string[],
  ) {
    const { storeId, rules } = compose;
    const screened = screenCustomerTexts(screenTexts, {
      handOverDiscounts: rules.handover.discounts,
      earlier,
    });
    const prepared = screened ? undefined : this.sales.prepare(compose);
    prepared?.catch(() => undefined);
    const classified: Classified = screened
      ? { reason: screened }
      : await this.classifyWithAllowance(compose, earlier);
    if (classified.intent && compose.chat)
      await this.inbox.setIntentTag(storeId, compose.chat.conversationId, classified.intent);
    return { reason: classified.reason, prepared };
  }

  private async classifyWithAllowance(
    { storeId, contactId, customerTexts, rules }: ComposeInput,
    earlier: ConversationEntry[],
  ): Promise<Classified> {
    if (!(await this.hasAllowanceRoom(storeId, contactId))) return { reason: 'allowance_used' };
    return this.classifier.classify(storeId, customerTexts, earlier, {
      ...rules.handover,
      takesOrders: rules.takeOrders,
      shopReplies: earlier.filter(({ from }) => from === 'shop').length,
    });
  }

  // The chat before the burst being classified, oldest first.
  private async earlierMessages(storeId: string, conversationId: string, burstIds: string[]) {
    const history = await this.inbox.replyHistory(
      storeId,
      conversationId,
      CLASSIFY_HISTORY_LENGTH + burstIds.length,
    );
    const before = history.filter(({ id }) => !burstIds.includes(id));
    return conversationEntries(before).slice(-CLASSIFY_HISTORY_LENGTH);
  }

  // A window that already holds a unit finishes even when the allowance is used up.
  private async hasAllowanceRoom(storeId: string, contactId: string) {
    const reference = await this.windowReference(storeId, contactId);
    return (
      (await this.usage.isConsumed(storeId, 'ai_conversation', reference)) ||
      (await this.usage.hasAllowance(storeId, 'ai_conversation', 1))
    );
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
    if (!(await this.isAnswerable(storeId, turn, settings.testers))) return;
    if (!(await this.mayContact(storeId, contactId, channel))) return;
    const target = { contactId, channel, connectionId, identityId: latest.senderIdentityId };
    const identity = await this.identities.findOutboundIdentity(storeId, target);
    if (!identity) return;
    return {
      turn,
      target,
      recipientExternalId: identity.externalId,
      debounceSeconds: settings.debounceSeconds,
      claimTimeoutMinutes: settings.claimTimeoutMinutes,
      productCardStyle: settings.productCardStyle,
      rules: settings.rules,
    };
  }

  private async mayContact(
    storeId: string,
    contactId: string,
    channel: EligibleTurn['target']['channel'],
  ) {
    const contact = await this.contacts.findRecipient(storeId, contactId);
    if (!contact || contact.kind === 'not_customer' || contact.isBlocked) return false;
    const consent = await this.consent.current(storeId, [contactId], channel);
    return !consent.some(({ status }) => status === 'withdrawn');
  }

  // A channel in practice answers only the shop's testers, never other customers.
  private async isAnswerable(storeId: string, turn: Turn, testers: string[]) {
    return (
      testers.includes(turn.contactId) || (await this.channels.isAiLive(storeId, turn.connectionId))
    );
  }

  private async enabledSettings(storeId: string) {
    const settings = await this.settings.enabled(storeId);
    if (settings && (await this.stores.settings(storeId)).extensions.includes('chats'))
      return settings;
  }

  // The reason `other` is a message that tries to change the rules or is not about the shop. It gets
  // one short refusal; a person has nothing to do there, so the chat stays with the AI.
  private stop(
    storeId: string,
    conversationId: string,
    before: EligibleTurn,
    outcome: { reason: Reason; summary?: string; texts: string[] },
  ) {
    if (outcome.reason !== 'other') return this.handOver(storeId, conversationId, before, outcome);
    const content = declineReply(before.rules.replyLanguage, outcome.texts);
    const key = `ai-decline:${before.turn.latest.id}`;
    return this.sayLine(storeId, conversationId, before, { content, key });
  }

  // A fixed line from the shop, sent only while the chat is still the one the job read.
  private async sayLine(
    storeId: string,
    conversationId: string,
    before: EligibleTurn,
    line: { content: string; key: string },
  ) {
    await this.transaction.runLocked(storeId, async () => {
      const current = await this.lockCurrent(storeId, conversationId, before);
      if (!current) return;
      await this.messaging.queueChannelMessage(storeId, {
        ...current.target,
        category: 'staff_reply',
        actor: { kind: 'system' },
        content: line.content,
        operationKey: line.key,
      });
    });
  }

  private async handOver(
    storeId: string,
    conversationId: string,
    before: EligibleTurn,
    { reason, summary }: { reason: Reason; summary?: string },
  ) {
    const retryIn = outageRetryDelay(reason, before.turn.latest.createdAt, this.clock.now());
    if (retryIn) return retryAt(this.clock.now(), retryIn);
    await this.transaction.runLocked(storeId, async () => {
      const current = await this.lockCurrent(storeId, conversationId, before);
      if (!current) return;
      const body = formatHandoverSummary({ reason, summary, latestText: current.turn.latest.body });
      const change = await this.inbox.handOver(storeId, conversationId, {
        reason,
        returnAfterMinutes: current.claimTimeoutMinutes,
        summary: body,
      });
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
        content: holdingReply(current.rules.replyLanguage),
        operationKey: `ai-handover:${current.turn.latest.id}`,
      });
      await this.notifications.notify(storeId, {
        assigneeUserId: change.assigneeUserId,
        type: 'conversation.handed_over',
        category: 'fix_now',
        dedupeKey: `handover:${current.turn.latest.id}`,
        title: 'A conversation needs your reply',
        body,
      });
    });
  }

  // A tap on a card button is answered from the product's own data, with no model. A shop that
  // does not take orders in chat hands an order tap to a person instead.
  async answerCardTap(storeId: string, conversationId: string, tapId: string, postback: string) {
    const tap = parseCardTap(postback);
    const before = tap && (await this.eligibleTurn(storeId, conversationId));
    if (!tap || !before) return;
    if (tap.kind === 'human' || (tap.kind === 'order' && !before.rules.takeOrders))
      return this.handOver(storeId, conversationId, before, {
        reason: tap.kind === 'human' ? 'asked_for_person' : 'ready_to_buy',
      });
    const content = await this.tapReplies.reply(storeId, tap);
    await this.sayLine(storeId, conversationId, before, { content, key: `card-tap:${tapId}` });
  }

  // Sends the product cards, then the reply, and spends one AI conversation unit with them.
  private async send(
    storeId: string,
    conversationId: string,
    before: EligibleTurn,
    composed: Extract<ComposedReply, { kind: 'reply' }>,
  ) {
    const { aiRunId, cards, sources, text } = composed;
    let isSaved = false;
    try {
      await this.transaction.runLocked(storeId, async () => {
        const current = await this.lockCurrent(storeId, conversationId, before);
        if (!current) return;
        const latestId = current.turn.latest.id;
        const send = (
          content: string,
          key: string,
          extra: {
            aiSources?: typeof sources;
            image?: ProductCard['image'];
            card?: ProductCarousel;
          } = {},
        ) =>
          this.messaging.queueChannelMessage(storeId, {
            ...current.target,
            category: 'staff_reply',
            actor: { kind: 'ai', aiRunId },
            content,
            operationKey: `ai-reply:${latestId}:${key}`,
            ...extra,
          });
        for (const { content, key, image, card } of cardMessages(cards, before.productCardStyle))
          await send(content, key, { image, card });
        await send(text, 'reply', { aiSources: sources });
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
        return this.handOver(storeId, conversationId, before, { reason: 'allowance_used' });
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
    return current && isSameTurn(current, before) ? current : undefined;
  }
}
