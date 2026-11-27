import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { TriggerKey } from '@dakly/contracts/automations/catalogue';
import type { AutomationGraph } from '@dakly/contracts/automations/graph';
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
import type { OrderStage } from '@dakly/contracts/orders';

import { ContactsService } from '../contacts/contacts.service';
import { ConversationIntentService } from '../messaging/conversation-intent.service';
import { OrderReportingService } from '../orders/order-reporting.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { DAY_MS } from '../platform/time';
import { SegmentsService } from '../segments/segments.service';
import { SendPolicyService } from '../sending/send-policy.service';
import { AutomationEntryRepository } from './automation-entry.repository';
import { isChatChannel, MESSENGER_WINDOW_MS, type SendStep } from './automation-step-rules';
import { matchesAnyKeyword } from './message-keywords';

export const automationConsentEvent = consentChangedEventSchema.extend({ id: z.uuid() });
export const automationTagEvent = contactTagAddedEventSchema.extend({ id: z.uuid() });
export const automationBirthdayEvent = contactBirthdayEventSchema.extend({ id: z.uuid() });
export const automationMessageBurstEvent = messageBurstReceivedEventSchema.extend({
  id: z.uuid(),
});
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
type TriggerEvent =
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
    @Inject(SendPolicyService) private readonly sendPolicy: SendPolicyService,
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
      const version = await this.enteringVersion(storeId, automationId, event);
      if (!version) return;
      const now = this.clock.now();
      await this.repository.insert(storeId, {
        automationId,
        contactId,
        versionId: version.id,
        triggerKey: triggerKeyOf(event),
        triggerOrderId: orderIdOf(event),
        currentStepKey: version.graph.firstStepKey,
        enteredAt: now,
        wakeAt: now,
      });
    });
  }

  // The AI agent asks this before it replies. A burst that already started a run counts, so the
  // answer does not flip once the run exists. Only a workflow whose first step sends a message
  // answers; one that only tags or waits leaves the reply to the AI.
  async answersMessage(
    storeId: string,
    conversationId: string,
    burst: Omit<MessageBurstEvent['payload'], 'conversationId'>,
  ): Promise<boolean> {
    const messageIds = burst.messageIds.slice(0, 50);
    const text = await this.conversations.burstText(storeId, conversationId, messageIds);
    const event = {
      id: messageIds[0] ?? randomUUID(),
      type: 'message.burst_received',
      occurredAt: this.clock.now().toISOString(),
      payload: { ...burst, conversationId, messageIds, text },
    } as const;
    for (const { id } of await this.repository.activeWorkflows(storeId, 'message_received')) {
      const version = await this.enteringVersion(storeId, id, event);
      const first = version?.graph.steps[version.graph.firstStepKey];
      if (first?.kind === 'send' && (await this.canReach(storeId, event.payload.contactId, first)))
        return true;
    }
    return false;
  }

  // A first send the policy will skip (no consent, blocked contact, frequency cap) answers nobody,
  // so the AI must reply. This only reads; the real send checks again under its locks.
  private async canReach(storeId: string, contactId: string, step: SendStep) {
    const at = this.clock.now();
    for (const channel of step.channels) {
      const windowClosesAtOf = isChatChannel(channel)
        ? new Map([[contactId, new Date(at.getTime() + MESSENGER_WINDOW_MS)]])
        : undefined;
      const [checked] = await this.sendPolicy.checkAudience(storeId, {
        contactIds: [contactId],
        channel,
        category: step.category,
        at,
        windowClosesAtOf,
      });
      if (checked?.decision.action !== 'skip') return true;
    }
    return false;
  }

  // The published version this event would start a run on, if the contact may enter now.
  private async enteringVersion(storeId: string, automationId: string, event: TriggerEvent) {
    const version = await this.repository.lockPublishedVersion(storeId, automationId);
    if (!version || new Date(event.occurredAt) < version.publishedAt) return;
    if (!(await this.matchesTrigger(storeId, version.graph.trigger, event))) return;
    const previous = await this.repository.previousEntry(
      storeId,
      automationId,
      event.payload.contactId,
    );
    if (previous?.triggerKey === triggerKeyOf(event)) return version;
    if (
      previous &&
      (previous.active || !canReEnter(version.graph.reEntry, previous.enteredAt, this.clock.now()))
    )
      return;
    return version;
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
    return matchesContactFilter(filter, event);
  });
}

type TriggerFilter = AutomationGraph['trigger']['filters'][number];

function matchesContactFilter(
  filter: TriggerFilter,
  event: Exclude<TriggerEvent, OrderTriggerEvent | MessageTriggerEvent>,
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
