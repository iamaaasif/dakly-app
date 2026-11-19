import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import {
  consentChangedEventSchema,
  contactTagAddedEventSchema,
} from '@dakly/contracts/events/contacts';

import { ContactsService } from '../contacts/contacts.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { DAY_MS } from '../platform/time';
import { AutomationEntryRepository } from './automation-entry.repository';

export const automationConsentEvent = consentChangedEventSchema.extend({ id: z.uuid() });
export const automationTagEvent = contactTagAddedEventSchema.extend({ id: z.uuid() });
export const automationTriggerEvent = z.discriminatedUnion('type', [
  automationConsentEvent,
  automationTagEvent,
]);
export type TriggerEvent =
  | Omit<z.infer<typeof automationConsentEvent>, 'storeId'>
  | Omit<z.infer<typeof automationTagEvent>, 'storeId'>;

@Injectable()
export class AutomationEntryService {
  constructor(
    @Inject(AutomationEntryRepository) private readonly repository: AutomationEntryRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async startMatching(storeId: string, event: TriggerEvent): Promise<void> {
    const key = triggerFor(event);
    if (!key) return;
    const workflows = await this.repository.activeWorkflows(storeId, key);
    for (const { id } of workflows) await this.start(storeId, id, event);
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
      if (!matchesTrigger(version.graph.trigger, event)) return;

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
}

export function triggerFor(event: TriggerEvent) {
  if (event.type === 'contact.tag_added') return 'tag_added';
  if (event.payload.status === 'granted' && event.payload.source !== 'import')
    return 'consent_given';
  return null;
}

function matchesTrigger(trigger: AutomationGraph['trigger'], event: TriggerEvent): boolean {
  if (trigger.key !== triggerFor(event)) return false;
  return trigger.filters.every((filter) => {
    switch (filter.field) {
      case 'tag':
        return event.type === 'contact.tag_added' && event.payload.tag === filter.tag;
      case 'channel':
        return event.type === 'consent.changed' && filter.channels.includes(event.payload.channel);
      case 'consent_source':
        return event.type === 'consent.changed' && filter.sources.includes(event.payload.source);
      default:
        return false;
    }
  });
}

function canReEnter(rule: AutomationGraph['reEntry'], enteredAt: Date, now: Date) {
  if (rule.rule === 'once') return false;
  return rule.rule === 'every_time' || now.getTime() - enteredAt.getTime() >= rule.days * DAY_MS;
}
