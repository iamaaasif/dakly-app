import { Inject, Injectable } from '@nestjs/common';

import type { recipientSkipReasons } from '@dakly/contracts/campaigns';
import type { ConsentChannel, ContactKind } from '@dakly/contracts/contacts';
import type { SendingSettings } from '@dakly/contracts/stores';

import { ConsentService } from '../consents/consent.service';
import { ContactsService } from '../contacts/contacts.service';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError, PLATFORM_ERRORS } from '../platform/errors/app-error';
import { StoresService } from '../stores/stores.service';
import { SendingRepository } from './sending.repository';

export type SendCategory = 'staff_reply' | 'transactional' | 'marketing';
export type SendChannel = Exclude<ConsentChannel, 'email'>;
export type SkipReason = (typeof recipientSkipReasons)[number];

export type SendRequest = {
  contactId: string;
  channel: SendChannel;
  category: SendCategory;
  at: Date;
};

export type SendDecision =
  { action: 'send' } | { action: 'defer'; until: Date } | { action: 'skip'; reason: SkipReason };

const HOUR = 60 * 60 * 1000;

function skip(reason: SkipReason): SendDecision {
  return { action: 'skip', reason };
}

// The final send gate (A1): campaigns, workflows and staff replies call it in the transaction
// that moves a message to sending, and nothing else decides these rules.
@Injectable()
export class SendPolicyService {
  constructor(
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(ConsentService) private readonly consents: ConsentService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(SendingRepository) private readonly repository: SendingRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  async check(storeId: string, request: SendRequest): Promise<SendDecision> {
    this.requireTransactionForMarketing(request.category);
    const contact = await this.contacts.findRecipient(storeId, request.contactId);
    if (!contact) return skip('no_address');
    if (contact.isBlocked) return skip('blocked');
    if (request.category === 'marketing') {
      const reason = await this.audienceSkip(storeId, contact, request);
      if (reason) return skip(reason);
    }
    if (request.channel === 'sms' && !contact.hasPhone) return skip('no_address');
    // SMS has no window. Other channels have no inbound message times or templates until CHAT-2
    // and CHN-3, so no window can be shown open.
    if (request.channel !== 'sms') return skip('window_closed');
    if (request.category !== 'marketing') return { action: 'send' };
    return this.marketingLimits(storeId, request);
  }

  // The cap lock must last until the caller marks the message sending and commits.
  private requireTransactionForMarketing(category: SendCategory): void {
    if (category === 'marketing' && !this.transaction.isOpen())
      throw new AppError('STORE_TRANSACTION_REQUIRED', PLATFORM_ERRORS.STORE_TRANSACTION_REQUIRED);
  }

  private async audienceSkip(
    storeId: string,
    contact: { kind: ContactKind; isOverPlanLimit: boolean },
    { contactId, channel }: SendRequest,
  ): Promise<SkipReason | undefined> {
    if (contact.kind === 'not_customer') return 'not_customer';
    if (contact.isOverPlanLimit) return 'over_plan_limit';
    const [consent] = await this.consents.current(storeId, [contactId], channel);
    return consent?.status === 'granted' ? undefined : 'no_consent';
  }

  // Quiet hours come before the cap, so a deferred message is counted when it is sent.
  private async marketingLimits(
    storeId: string,
    { contactId, channel, at }: SendRequest,
  ): Promise<SendDecision> {
    const settings = await this.stores.sendingSettings(storeId);
    const quietUntil = quietHoursEnd(at, settings.quietHours, settings.timeZone);
    if (quietUntil) return { action: 'defer', until: quietUntil };

    await this.repository.lockContact(storeId, contactId);
    const dayStart = new Date(at.getTime() - 24 * HOUR);
    const sends = await this.repository.listMarketingSends(
      storeId,
      contactId,
      new Date(at.getTime() - 7 * 24 * HOUR),
      at,
    );
    const onChannelToday = sends.filter(
      (send) => send.channel === channel && send.sentAt > dayStart,
    ).length;
    const { perChannelPerDay, perSevenDays } = settings.frequencyCap;
    if (onChannelToday >= perChannelPerDay || sends.length >= perSevenDays)
      return skip('frequency_cap');
    return { action: 'send' };
  }
}

// Quiet hours always span midnight.
function quietHoursEnd(
  at: Date,
  { startHour, endHour }: SendingSettings['quietHours'],
  timeZone: string,
): Date | undefined {
  const local = localClock(at, timeZone);
  if (local.hour >= endHour && local.hour < startHour) return undefined;
  const hoursToEnd = (endHour - local.hour + 24) % 24;
  const intoHour = (local.minute * 60 + local.second) * 1000 + at.getUTCMilliseconds();
  return new Date(at.getTime() + hoursToEnd * HOUR - intoHour);
}

function localClock(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return { hour: part('hour'), minute: part('minute'), second: part('second') };
}
