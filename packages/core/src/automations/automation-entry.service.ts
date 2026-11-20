import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { TriggerKey } from '@dakly/contracts/automations/catalogue';
import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import {
  consentChangedEventSchema,
  contactBirthdayEventSchema,
  contactTagAddedEventSchema,
} from '@dakly/contracts/events/contacts';
import {
  orderCreatedEventSchema,
  orderStageChangedEventSchema,
} from '@dakly/contracts/events/orders';
import type { OrderStage } from '@dakly/contracts/orders';

import { ContactsService } from '../contacts/contacts.service';
import { OrderReportingService } from '../orders/order-reporting.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { DAY_MS } from '../platform/time';
import { SegmentsService } from '../segments/segments.service';
import { AutomationEntryRepository } from './automation-entry.repository';

export const automationConsentEvent = consentChangedEventSchema.extend({ id: z.uuid() });
export const automationTagEvent = contactTagAddedEventSchema.extend({ id: z.uuid() });
export const automationBirthdayEvent = contactBirthdayEventSchema.extend({ id: z.uuid() });
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
type TriggerEvent =
  | Omit<z.infer<typeof automationConsentEvent>, 'storeId'>
  | Omit<z.infer<typeof automationTagEvent>, 'storeId'>
  | Omit<z.infer<typeof automationBirthdayEvent>, 'storeId'>
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
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async startMatching(storeId: string, event: TriggerEvent): Promise<void> {
    const key = triggerFor(event);
    if (!key) return;
    const workflows = await this.repository.activeWorkflows(storeId, key);
    for (const { id } of workflows) await this.start(storeId, id, event);
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

      const previous = await this.repository.previousEntry(storeId, automationId, contactId);
      const now = this.clock.now();
      if (
        previous &&
        (previous.active || !canReEnter(version.graph.reEntry, previous.enteredAt, now))
      )
        return;

      await this.repository.insert(storeId, {
        automationId,
        contactId,
        versionId: version.id,
        triggerKey: event.id,
        currentStepKey: version.graph.firstStepKey,
        enteredAt: now,
        wakeAt: now,
      });
    });
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
  if (isOrderEvent(event)) return orderTriggerFor(event);
  if (event.payload.status === 'granted' && event.payload.source !== 'import')
    return 'consent_given';
  return null;
}

function matchesTrigger(trigger: AutomationGraph['trigger'], event: TriggerEvent): boolean {
  if (trigger.key !== triggerFor(event)) return false;
  return trigger.filters.every((filter) =>
    isOrderEvent(event) ? matchesOrderFilter(filter, event) : matchesContactFilter(filter, event),
  );
}

type TriggerFilter = AutomationGraph['trigger']['filters'][number];

function matchesContactFilter(
  filter: TriggerFilter,
  event: Exclude<TriggerEvent, OrderTriggerEvent>,
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

function isOrderEvent(event: TriggerEvent): event is OrderTriggerEvent {
  return event.type === 'order.created' || event.type === 'order.stage_changed';
}

function canReEnter(rule: AutomationGraph['reEntry'], enteredAt: Date, now: Date) {
  if (rule.rule === 'once') return false;
  return rule.rule === 'every_time' || now.getTime() - enteredAt.getTime() >= rule.days * DAY_MS;
}
