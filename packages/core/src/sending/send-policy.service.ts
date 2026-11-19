import { Inject, Injectable } from '@nestjs/common';

import type { recipientSkipReasons } from '@dakly/contracts/campaigns';
import type { messageSendCategories } from '@dakly/contracts/chats';
import type { ConsentChannel, ConsentStatus, ContactKind } from '@dakly/contracts/contacts';
import type { SendingSettings } from '@dakly/contracts/stores';

import { ConsentService } from '../consents/consent.service';
import { ContactsService } from '../contacts/contacts.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError, PLATFORM_ERRORS } from '../platform/errors/app-error';
import { HOUR_MS } from '../platform/time';
import { type StoreSendingSettings, StoresService } from '../stores/stores.service';
import { type MarketingSend, SendingRepository } from './sending.repository';

export type SendCategory = (typeof messageSendCategories)[number];
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

export type AudienceRequest = Omit<SendRequest, 'contactId'> & { contactIds: string[] };
// The phone is frozen as the SMS destination of a campaign recipient.
export type AudienceDecision = { contactId: string; phone: string | null; decision: SendDecision };
type CapReadOptions = {
  dispatch?: boolean;
  excludeWorkflowStepId?: string;
  includeCommittedFuture?: boolean;
};
type SendWindow = { windowClosesAt?: Date | null };

// The most contacts one checkAudience call takes: its consent read's limit.
export const AUDIENCE_PAGE_SIZE = ConsentService.AUDIENCE_LIMIT;

const SEND: SendDecision = { action: 'send' };
const WEEK_MS = 7 * 24 * HOUR_MS;

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
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // Check eligibility and freeze the destination after the contact locks.
  async checkForSend(
    storeId: string,
    request: Omit<SendRequest, 'at'> & SendWindow,
    lockedContactExists?: boolean,
  ) {
    this.requireTransaction();
    const exists = lockedContactExists ?? (await this.lockForDispatch(storeId, request.contactId));
    const at = this.clock.now();
    if (!exists) return { decision: skip('no_address'), destination: null, at };
    const [checked] = await this.evaluateAudience(
      storeId,
      { ...request, contactIds: [request.contactId], at },
      { includeCommittedFuture: true },
    );
    return { decision: checked!.decision, destination: checked!.phone, at };
  }

  // Workflow gates take this lock before locking the workflow, then pass the result to the check.
  async lockForDispatch(storeId: string, contactId: string) {
    this.requireTransaction();
    await this.repository.lockContact(storeId, contactId);
    try {
      await this.contacts.lockForConsent(storeId, [contactId]);
      return true;
    } catch (error) {
      if (error instanceof AppError && error.code === 'CONTACT_NOT_FOUND') return false;
      throw error;
    }
  }

  async check(
    storeId: string,
    request: Omit<SendRequest, 'at'> & { at: Date | (() => Date) },
  ): Promise<SendDecision> {
    if (
      request.category === 'marketing' &&
      !(await this.lockForDispatch(storeId, request.contactId))
    )
      return skip('no_address');
    // A campaign samples its clock after waiting on the contact locks.
    const at = typeof request.at === 'function' ? request.at() : request.at;
    const reason = await this.recipientReason(storeId, { ...request, at });
    if (reason) return skip(reason);
    if (request.category !== 'marketing') return SEND;

    const settings = await this.stores.sendingSettings(storeId);
    const quietUntil = quietHoursEnd(at, settings.quietHours, settings.timeZone);
    if (quietUntil) return { action: 'defer', until: quietUntil };
    const sends = await this.listWeekOfSends(storeId, [request.contactId], at, { dispatch: true });
    return capReached(sends, { ...request, at }, settings.frequencyCap)
      ? skip('frequency_cap')
      : SEND;
  }

  private async recipientReason(
    storeId: string,
    request: SendRequest,
  ): Promise<SkipReason | undefined> {
    const contact = await this.contacts.findRecipient(storeId, request.contactId);
    const [consent] =
      contact && request.category === 'marketing'
        ? await this.consents.current(storeId, [request.contactId], request.channel)
        : [];
    return recipientSkip(contact, consent?.status, request);
  }

  // The recipient and workflow stay locked while the runner prepares the final time and cap check.
  async recheckRetryRecipient(
    storeId: string,
    request: Omit<SendRequest, 'at'>,
    lockedContactExists?: boolean,
  ) {
    this.requireTransaction();
    const exists = lockedContactExists ?? (await this.lockForDispatch(storeId, request.contactId));
    const at = this.clock.now();
    const reason = exists ? await this.recipientReason(storeId, { ...request, at }) : 'no_address';
    return { decision: reason ? skip(reason) : SEND, at };
  }

  // Prepare cap evidence under the contact lock using settings locked at the start of the gate.
  async prepareMarketingRetryCheck(
    storeId: string,
    {
      contactId,
      workflowStepId,
      settings: { quietHours, timeZone, frequencyCap },
    }: { contactId: string; workflowStepId: string; settings: StoreSendingSettings },
  ) {
    this.requireTransaction();
    const sends = await this.listWeekOfSends(storeId, [contactId], this.clock.now(), {
      excludeWorkflowStepId: workflowStepId,
      includeCommittedFuture: true,
    });
    return (): { decision: SendDecision; at: Date } => {
      const at = this.clock.now();
      const until = quietHoursEnd(at, quietHours, timeZone);
      if (until) return { decision: { action: 'defer', until }, at };
      const weekStart = new Date(at.getTime() - WEEK_MS);
      const counted = sends.filter((send) => send.sentAt > weekStart);
      const reached = capReached(counted, { channel: 'sms', at }, frequencyCap);
      return { decision: reached ? skip('frequency_cap') : SEND, at };
    };
  }

  // Approval freezes these skips with the same rules, a page at a time and with no lock. The
  // check inside the send transaction can still skip a queued recipient, never send a skipped one.
  async checkAudience(storeId: string, request: AudienceRequest): Promise<AudienceDecision[]> {
    return this.evaluateAudience(storeId, request);
  }

  private async evaluateAudience(
    storeId: string,
    { contactIds, channel, category, at, windowClosesAt }: AudienceRequest & SendWindow,
    capRead?: CapReadOptions,
  ): Promise<AudienceDecision[]> {
    const contacts = new Map(
      (await this.contacts.findRecipients(storeId, contactIds)).map((row) => [
        row.id,
        { ...row, hasPhone: row.phone !== null },
      ]),
    );
    const isMarketing = category === 'marketing';
    const consents = isMarketing
      ? await this.consents.currentForAudience(storeId, contactIds, channel)
      : [];
    const consentOf = new Map(consents.map((row) => [row.contactId, row.status]));
    const limits = isMarketing
      ? await this.audienceLimits(storeId, { contactIds, channel, at }, capRead)
      : undefined;
    const request = { channel, category, at, windowClosesAt };
    return contactIds.map((contactId) => {
      const contact = contacts.get(contactId);
      const reason = recipientSkip(contact, consentOf.get(contactId), request);
      const decision = reason ? skip(reason) : (limits?.(contactId) ?? SEND);
      return { contactId, phone: contact?.phone ?? null, decision };
    });
  }

  // The cap lock must last until the caller marks the message sending and commits.
  private requireTransaction(): void {
    if (!this.transaction.isOpen())
      throw new AppError('STORE_TRANSACTION_REQUIRED', PLATFORM_ERRORS.STORE_TRANSACTION_REQUIRED);
  }

  private async audienceLimits(
    storeId: string,
    { contactIds, channel, at }: Pick<AudienceRequest, 'contactIds' | 'channel' | 'at'>,
    capRead?: CapReadOptions,
  ): Promise<(contactId: string) => SendDecision> {
    const settings = await this.stores.sendingSettings(storeId);
    const quietUntil = quietHoursEnd(at, settings.quietHours, settings.timeZone);
    if (quietUntil) return () => ({ action: 'defer', until: quietUntil });
    const sendsOf = new Map<string, MarketingSend[]>();
    for (const send of await this.listWeekOfSends(storeId, contactIds, at, capRead)) {
      const own = sendsOf.get(send.contactId);
      if (own) own.push(send);
      else sendsOf.set(send.contactId, [send]);
    }
    return (contactId) =>
      capReached(sendsOf.get(contactId) ?? [], { channel, at }, settings.frequencyCap)
        ? skip('frequency_cap')
        : SEND;
  }

  // Live checks count committed rows even if another worker's clock was ahead.
  private listWeekOfSends(
    storeId: string,
    contactIds: string[],
    at: Date,
    capRead?: CapReadOptions,
  ) {
    return this.repository.listMarketingSends(storeId, contactIds, {
      after: new Date(at.getTime() - WEEK_MS),
      until: at,
      ...capRead,
    });
  }
}

// Checks 1 to 4 in feature 09, in order: what the contact, its consent and the channel decide.
function recipientSkip(
  contact:
    | { kind: ContactKind; isBlocked: boolean; isOverPlanLimit: boolean; hasPhone: boolean }
    | undefined,
  consent: ConsentStatus | undefined,
  {
    channel,
    category,
    at,
    windowClosesAt,
  }: Pick<SendRequest, 'channel' | 'category' | 'at'> & SendWindow,
): SkipReason | undefined {
  if (!contact) return 'no_address';
  if (contact.isBlocked) return 'blocked';
  if (category === 'marketing') {
    if (contact.kind === 'not_customer') return 'not_customer';
    if (contact.isOverPlanLimit) return 'over_plan_limit';
    if (consent !== 'granted') return 'no_consent';
  }
  if (channel === 'sms' && !contact.hasPhone) return 'no_address';
  if (!windowAllowsSend(channel, at, windowClosesAt)) return 'window_closed';
  return undefined;
}

function windowAllowsSend(channel: SendChannel, at: Date, closesAt?: Date | null): boolean {
  return channel === 'sms' || (channel !== 'whatsapp' && !!closesAt && at < closesAt);
}

function capReached(
  sends: MarketingSend[],
  { channel, at }: Pick<SendRequest, 'channel' | 'at'>,
  { perChannelPerDay, perSevenDays }: SendingSettings['frequencyCap'],
): boolean {
  const dayStart = new Date(at.getTime() - 24 * HOUR_MS);
  const onChannelToday = sends.filter(
    (send) => send.channel === channel && send.sentAt > dayStart,
  ).length;
  return onChannelToday >= perChannelPerDay || sends.length >= perSevenDays;
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
  return new Date(at.getTime() + hoursToEnd * HOUR_MS - intoHour);
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
