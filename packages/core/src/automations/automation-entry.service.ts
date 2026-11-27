import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { TriggerKey } from '@dakly/contracts/automations/catalogue';
import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import type { CommentIntent } from '@dakly/contracts/comments';
import {
  consentChangedEventSchema,
  contactBirthdayEventSchema,
  contactTagAddedEventSchema,
} from '@dakly/contracts/events/contacts';
import { messageBurstReceivedEventSchema } from '@dakly/contracts/events/messaging';
import {
  orderCreatedEventSchema,
  orderStageChangedEventSchema,
} from '@dakly/contracts/events/orders';
import { commentReceivedEventSchema } from '@dakly/contracts/events/social';
import type { OrderStage } from '@dakly/contracts/orders';

import { CommentPostProductsService } from '../comments/comment-post-products.service';
import { CommentsService } from '../comments/comments.service';
import { ContactsService } from '../contacts/contacts.service';
import { ConversationIntentService } from '../messaging/conversation-intent.service';
import { OrderReportingService } from '../orders/order-reporting.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { DAY_MS } from '../platform/time';
import { SegmentsService } from '../segments/segments.service';
import { AutomationEntryRepository } from './automation-entry.repository';
import { commentIntents, hasReadableWords } from './comment-intent';
import { matchesAnyKeyword } from './message-keywords';

export const automationConsentEvent = consentChangedEventSchema.extend({ id: z.uuid() });
export const automationTagEvent = contactTagAddedEventSchema.extend({ id: z.uuid() });
export const automationBirthdayEvent = contactBirthdayEventSchema.extend({ id: z.uuid() });
export const automationMessageBurstEvent = messageBurstReceivedEventSchema.extend({
  id: z.uuid(),
});
export const automationCommentEvent = commentReceivedEventSchema.extend({ id: z.uuid() });
export const automationOrderCreatedEvent = orderCreatedEventSchema.extend({ id: z.uuid() });
export const automationOrderStageEvent = orderStageChangedEventSchema.extend({ id: z.uuid() });
type OrderEvent =
  | Omit<z.infer<typeof automationOrderCreatedEvent>, 'storeId'>
  | Omit<z.infer<typeof automationOrderStageEvent>, 'storeId'>;
type OrderFacts = NonNullable<Awaited<ReturnType<OrderReportingService['triggerFacts']>>>;
// An order event carries the buyer and the order facts that the trigger filters read.
type WithFacts<E> = E extends { payload: infer P }
  ? Omit<E, 'payload'> & { payload: P & OrderFacts }
  : never;
type OrderTriggerEvent = WithFacts<OrderEvent>;
type MessageBurstEvent = Omit<z.infer<typeof automationMessageBurstEvent>, 'storeId'>;
// The keyword filter reads the words, which the event leaves out.
type MessageTriggerEvent = Omit<MessageBurstEvent, 'payload'> & {
  payload: MessageBurstEvent['payload'] & { text: string };
};
// The facts the filters read; the event carries only the comment id.
type CommentTriggerEvent = {
  id: string;
  type: 'comment.received';
  occurredAt: string;
  payload: {
    contactId: string;
    commentId: string;
    channelConnectionId: string;
    externalPostId: string;
    text: string;
    intents: CommentIntent[];
    productIds: string[];
  };
};
type TriggerEvent =
  | CommentTriggerEvent
  | Omit<z.infer<typeof automationConsentEvent>, 'storeId'>
  | Omit<z.infer<typeof automationTagEvent>, 'storeId'>
  | Omit<z.infer<typeof automationBirthdayEvent>, 'storeId'>
  | MessageTriggerEvent
  | OrderTriggerEvent;

const stageTriggers: Partial<Record<OrderStage, TriggerKey>> = {
  with_courier: 'order_shipped',
  delivered: 'order_delivered',
  cancelled: 'order_cancelled',
  returned: 'order_returned',
};

@Injectable()
export class AutomationEntryService {
  constructor(
    @Inject(AutomationEntryRepository) private readonly repository: AutomationEntryRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(SegmentsService) private readonly segments: SegmentsService,
    @Inject(OrderReportingService) private readonly orders: OrderReportingService,
    @Inject(ConversationIntentService) private readonly conversations: ConversationIntentService,
    @Inject(CommentsService) private readonly comments: CommentsService,
    @Inject(CommentPostProductsService) private readonly postProducts: CommentPostProductsService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async startMatching(storeId: string, event: TriggerEvent): Promise<void> {
    const key = triggerFor(event);
    if (!key) return;
    const workflows = await this.repository.activeWorkflows(storeId, key);
    for (const { id } of workflows) await this.start(storeId, id, event);
  }

  async startMatchingMessage(storeId: string, event: MessageBurstEvent): Promise<void> {
    const { conversationId, messageIds } = event.payload;
    const text = await this.conversations.burstText(storeId, conversationId, messageIds);
    await this.startMatching(storeId, { ...event, payload: { ...event.payload, text } });
  }

  // Only the first matching workflow answers a comment, and only a comment that matches gets a
  // contact, so a store's other commenters stay out of its customer list.
  async startMatchingComment(
    storeId: string,
    event: Omit<z.infer<typeof automationCommentEvent>, 'storeId'>,
  ): Promise<void> {
    const workflows = await this.repository.activeWorkflows(storeId, 'comment_on_post');
    if (!workflows.length) return;
    const comment = await this.comments.triggerFacts(storeId, event.payload.commentId);
    if (!comment || !hasReadableWords(comment.text)) return;
    const { productIds } = await this.postProducts.forPost(storeId, comment);
    const facts = {
      commentId: comment.commentId,
      channelConnectionId: comment.channelConnectionId,
      externalPostId: comment.externalPostId,
      text: comment.text,
      intents: commentIntents(comment.text),
      productIds,
    };
    const probe = { ...event, payload: { ...facts, contactId: event.payload.commentId } };
    let first: string | undefined;
    for (const { id } of workflows) {
      const version = await this.repository.lockPublishedVersion(storeId, id);
      if (
        version &&
        new Date(event.occurredAt) >= version.publishedAt &&
        matchesTrigger(version.graph.trigger, probe)
      ) {
        first = id;
        break;
      }
    }
    if (!first || !(await this.comments.claimForAutomation(storeId, comment.commentId))) return;
    const { contactId } = await this.contacts.findOrCreateByIdentity(storeId, {
      connectionId: comment.channelConnectionId,
      externalId: comment.authorExternalId,
      channel: comment.channel,
    });
    await this.start(storeId, first, { ...event, payload: { ...facts, contactId } });
  }

  async startMatchingOrder(storeId: string, event: OrderEvent): Promise<void> {
    if (!orderTriggerFor(event)) return;
    const facts = await this.orders.triggerFacts(storeId, event.payload.orderId);
    if (!facts) return;
    // Spreading the union loses the link between type and payload, so each branch is typed alone.
    await this.startMatching(
      storeId,
      event.type === 'order.created'
        ? { ...event, payload: { ...event.payload, ...facts } }
        : { ...event, payload: { ...event.payload, ...facts } },
    );
  }

  async start(storeId: string, automationId: string, event: TriggerEvent): Promise<void> {
    const { contactId } = event.payload;
    await this.transaction.run(storeId, async () => {
      try {
        await this.contacts.lockForConsent(storeId, [contactId]);
      } catch (error) {
        if (error instanceof AppError && error.code === 'CONTACT_NOT_FOUND') return;
        throw error;
      }
      const version = await this.repository.lockPublishedVersion(storeId, automationId);
      if (!version || new Date(event.occurredAt) < version.publishedAt) return;
      if (!(await this.matchesTrigger(storeId, version.graph.trigger, event))) return;

      const now = this.clock.now();
      if (
        await this.isBlockedFromEntry(storeId, { automationId, graph: version.graph, event, now })
      )
        return;

      await this.repository.insert(storeId, {
        automationId,
        contactId,
        versionId: version.id,
        triggerKey: triggerKeyOf(event),
        triggerOrderId: orderIdOf(event),
        triggerCommentId: event.type === 'comment.received' ? event.payload.commentId : null,
        currentStepKey: version.graph.firstStepKey,
        enteredAt: now,
        wakeAt: now,
      });
    });
  }

  // A comment's rule is one entry per person per post, so the re-entry setting does not apply.
  private async isBlockedFromEntry(
    storeId: string,
    {
      automationId,
      graph,
      event,
      now,
    }: {
      automationId: string;
      graph: AutomationGraph;
      event: TriggerEvent;
      now: Date;
    },
  ) {
    const { contactId } = event.payload;
    if (event.type === 'comment.received')
      return this.repository.hasEntryForPost(storeId, automationId, contactId, event.payload);
    const previous = await this.repository.previousEntry(storeId, automationId, contactId);
    return !!previous && (previous.active || !canReEnter(graph.reEntry, previous.enteredAt, now));
  }

  private async matchesTrigger(
    storeId: string,
    trigger: AutomationGraph['trigger'],
    event: TriggerEvent,
  ) {
    if (!matchesTrigger(trigger, event)) return false;
    const segment = trigger.filters.find((filter) => filter.field === 'segment');
    return (
      !segment || this.segments.hasContact(storeId, segment.segmentId, event.payload.contactId)
    );
  }
}

function orderTriggerFor(event: OrderEvent): TriggerKey | undefined {
  return event.type === 'order.created' ? 'order_placed' : stageTriggers[event.payload.to];
}

function triggerFor(event: TriggerEvent) {
  if (event.type === 'contact.tag_added') return 'tag_added';
  if (event.type === 'contact.birthday') return 'birthday';
  if (event.type === 'message.burst_received') return 'message_received';
  if (event.type === 'comment.received') return 'comment_on_post';
  if (isOrderEvent(event)) return orderTriggerFor(event);
  if (event.payload.status === 'granted' && event.payload.source !== 'import')
    return 'consent_given';
  return null;
}

function matchesTrigger(trigger: AutomationGraph['trigger'], event: TriggerEvent): boolean {
  if (trigger.key !== triggerFor(event)) return false;
  return trigger.filters.every((filter) => {
    if (isOrderEvent(event)) return matchesOrderFilter(filter, event);
    if (event.type === 'message.burst_received') return matchesMessageFilter(filter, event);
    if (event.type === 'comment.received') return matchesCommentFilter(filter, event);
    return matchesContactFilter(filter, event);
  });
}

type TriggerFilter = AutomationGraph['trigger']['filters'][number];

function matchesContactFilter(
  filter: TriggerFilter,
  event: Exclude<TriggerEvent, OrderTriggerEvent | MessageTriggerEvent | CommentTriggerEvent>,
): boolean {
  switch (filter.field) {
    case 'segment':
      return event.type === 'contact.birthday';
    case 'tag':
      return event.type === 'contact.tag_added' && event.payload.tag === filter.tag;
    case 'channel':
      return event.type === 'consent.changed' && filter.channels.includes(event.payload.channel);
    case 'consent_source':
      return event.type === 'consent.changed' && filter.sources.includes(event.payload.source);
    default:
      return false;
  }
}

function matchesMessageFilter(filter: TriggerFilter, { payload }: MessageTriggerEvent): boolean {
  switch (filter.field) {
    case 'channel':
      return filter.channels.includes(payload.channel);
    case 'intent':
      return payload.intent !== null && filter.intents.includes(payload.intent);
    case 'keywords':
      return matchesAnyKeyword(payload.text, filter.keywords);
    default:
      return false;
  }
}

function matchesCommentFilter(filter: TriggerFilter, { payload }: CommentTriggerEvent): boolean {
  switch (filter.field) {
    case 'post':
      return filter.externalPostIds.includes(payload.externalPostId);
    case 'product':
      return payload.productIds.some((id) => filter.productIds.includes(id));
    case 'keywords':
      return matchesAnyKeyword(payload.text, filter.keywords);
    case 'comment_intent':
      return filter.intents.some((intent) => payload.intents.includes(intent));
    default:
      return false;
  }
}

function matchesOrderFilter(filter: TriggerFilter, { payload }: OrderTriggerEvent): boolean {
  switch (filter.field) {
    case 'order_total':
      return filter.operator === 'at_least'
        ? payload.totalPoisha >= filter.amountPoisha
        : payload.totalPoisha <= filter.amountPoisha;
    case 'product':
      return payload.productIds.some((id) => filter.productIds.includes(id));
    case 'payment_status':
      return filter.statuses.includes(payload.paymentStatus);
    case 'delivery_district':
      return payload.bdAreaId !== null && filter.bdAreaIds.includes(payload.bdAreaId);
    case 'first_order':
      return payload.isFirstOrder;
    default:
      return false;
  }
}

// A retried reply announces the same burst again; its newest message makes the repeat the same
// entry.
function triggerKeyOf(event: TriggerEvent) {
  if (event.type === 'comment.received') return event.payload.commentId;
  return event.type === 'message.burst_received'
    ? (event.payload.messageIds[0] ?? event.id)
    : event.id;
}

function orderIdOf(event: TriggerEvent) {
  return isOrderEvent(event) ? event.payload.orderId : null;
}

function isOrderEvent(event: TriggerEvent): event is OrderTriggerEvent {
  return event.type === 'order.created' || event.type === 'order.stage_changed';
}

function canReEnter(rule: AutomationGraph['reEntry'], enteredAt: Date, now: Date) {
  if (rule.rule === 'once') return false;
  return rule.rule === 'every_time' || now.getTime() - enteredAt.getTime() >= rule.days * DAY_MS;
}
