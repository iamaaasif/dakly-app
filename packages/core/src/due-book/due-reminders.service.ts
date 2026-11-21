import { Inject, Injectable } from '@nestjs/common';

import {
  OVERDUE_DAYS,
  REMINDER_INTERVAL_DAYS,
  type RemindOverdueResponse,
  type RemindResponse,
} from '@dakly/contracts/due-book';

import { ContactsService } from '../contacts/contacts.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { DAY_MS } from '../platform/time';
import { SendPolicyService } from '../sending/send-policy.service';
import { StoresService } from '../stores/stores.service';
import { DueBalancesRepository } from './due-balances.repository';
import { dueBookError } from './due-book.errors';
import { reminderText } from './due-message-templates';
import { DueMessagesRepository } from './due-messages.repository';
import { isInsideReminderHours } from './due-reminder-hours';

// One call reaches this many customers, oldest debt first; a second call reaches the rest because
// the first customers now count as reminded.
const REMIND_OVERDUE_LIMIT = 500;
const PAGE_SIZE = 100;

type Outcome = 'queued' | 'recently_reminded' | 'no_phone' | 'blocked' | 'not_owing';

// A reminder is stored and announced here; the subscriber of `due.reminder_requested` sends it,
// so no vendor call runs inside this request.
@Injectable()
export class DueRemindersService {
  constructor(
    @Inject(DueBalancesRepository) private readonly balances: DueBalancesRepository,
    @Inject(DueMessagesRepository) private readonly messages: DueMessagesRepository,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(SendPolicyService) private readonly policy: SendPolicyService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async remind(storeId: string, contactId: string, userId: string): Promise<RemindResponse> {
    const result = await this.queue(storeId, contactId, userId);
    if (result.outcome === 'queued') return { messageId: result.messageId };
    throw dueBookError(REFUSALS[result.outcome]);
  }

  async remindOverdue(storeId: string, userId: string): Promise<RemindOverdueResponse> {
    await this.requireReminderHours(storeId);
    const counts = { queued: 0, recently_reminded: 0, no_phone: 0, blocked: 0, not_owing: 0 };
    let cursor: { oldestDebtAt: Date; contactId: string } | undefined;
    let seen = 0;
    while (seen < REMIND_OVERDUE_LIMIT) {
      const page = await this.balances.listOwing(storeId, {
        overdueBefore: new Date(this.clock.now().getTime() - OVERDUE_DAYS * DAY_MS),
        filter: 'over_30_days',
        cursor,
        limit: PAGE_SIZE,
      });
      for (const row of page) counts[(await this.queue(storeId, row.contactId, userId)).outcome]++;
      seen += page.length;
      const last = page.at(-1);
      if (page.length < PAGE_SIZE || !last) break;
      cursor = { oldestDebtAt: last.oldestDebtAt, contactId: last.contactId };
    }
    return {
      queued: counts.queued,
      skippedRecentlyReminded: counts.recently_reminded,
      skippedNoPhone: counts.no_phone,
      skippedBlocked: counts.blocked,
    };
  }

  private async requireReminderHours(storeId: string): Promise<void> {
    const timeZone = await this.stores.timeZone(storeId);
    if (!isInsideReminderHours(this.clock.now(), timeZone))
      throw dueBookError('DUE_REMINDER_OUTSIDE_HOURS');
  }

  // Each customer is checked and stored under their own lock, so two taps on Remind make one reminder.
  private queue(
    storeId: string,
    contactId: string,
    userId: string,
  ): Promise<{ outcome: 'queued'; messageId: string } | { outcome: Exclude<Outcome, 'queued'> }> {
    return this.transaction.run(storeId, async () => {
      // The lock comes first so an unknown customer is reported as not found at any hour.
      await this.contacts.lockForDueBook(storeId, contactId);
      await this.requireReminderHours(storeId);
      const now = this.clock.now();
      const { balancePoisha } = await this.balances.balanceOf(storeId, contactId);
      if (balancePoisha <= 0) return { outcome: 'not_owing' };
      const since = new Date(now.getTime() - REMINDER_INTERVAL_DAYS * DAY_MS);
      if ((await this.messages.remindedSince(storeId, [contactId], since)).size)
        return { outcome: 'recently_reminded' };
      const decision = await this.policy.check(storeId, {
        contactId,
        channel: 'sms',
        category: 'transactional',
        at: now,
      });
      if (decision.action !== 'send')
        return {
          outcome:
            decision.action === 'skip' && decision.reason === 'blocked' ? 'blocked' : 'no_phone',
        };
      const store = await this.stores.settings(storeId);
      const message = await this.messages.insert(storeId, {
        contactId,
        kind: 'reminder',
        body: reminderText(store.name, balancePoisha),
        requestedByUserId: userId,
      });
      await this.outbox.publish({
        type: 'due.reminder_requested',
        storeId,
        occurredAt: now.toISOString(),
        payload: { contactId, messageId: message!.id },
      });
      return { outcome: 'queued', messageId: message!.id };
    });
  }
}

const REFUSALS = {
  recently_reminded: 'DUE_REMINDER_TOO_SOON',
  no_phone: 'DUE_REMINDER_NO_PHONE',
  blocked: 'DUE_REMINDER_BLOCKED',
  not_owing: 'DUE_NOT_OWING',
} as const;
