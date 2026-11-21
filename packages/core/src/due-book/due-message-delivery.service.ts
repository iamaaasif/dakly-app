import { Inject, Injectable } from '@nestjs/common';

import type { DueMessageSkipReason } from '@dakly/contracts/due-book';
import { countSmsParts } from '@dakly/contracts/sms';

import { ContactsService } from '../contacts/contacts.service';
import { MessagingService } from '../messaging/messaging.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { SendPolicyService } from '../sending/send-policy.service';
import { StoresService } from '../stores/stores.service';
import { WalletService } from '../wallets/wallet.service';
import { DueBalancesRepository } from './due-balances.repository';
import { type DueMessage, DueMessagesRepository } from './due-messages.repository';
import { isInsideReminderHours } from './due-reminder-hours';

const system = { kind: 'system' } as const;

type Start = { kind: 'send'; message: DueMessage } | { kind: 'done' };

// Sends one stored baki notice or reminder through the shop's SMS credits. Safe to run again:
// a finished message is left alone, and a message that stopped midway is sent under the same
// operation key, so the provider does not send it twice.
@Injectable()
export class DueMessageDeliveryService {
  constructor(
    @Inject(DueMessagesRepository) private readonly messages: DueMessagesRepository,
    @Inject(DueBalancesRepository) private readonly balances: DueBalancesRepository,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(SendPolicyService) private readonly policy: SendPolicyService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(WalletService) private readonly wallets: WalletService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async deliver(storeId: string, messageId: string): Promise<void> {
    const start = await this.start(storeId, messageId);
    if (start.kind === 'done') return;
    const { message } = start;
    let receipt;
    try {
      receipt = await this.messaging.send(storeId, {
        channel: 'sms',
        contactId: message.contactId,
        body: message.body,
        operationKey: operationKey(message.id),
      });
    } catch (error) {
      // Any other failure may have reached the provider, so the job runs again and resumes.
      if (!(error instanceof AppError) || error.code !== 'SMS_SEND_REFUSED') throw error;
      await this.finish(storeId, message, { status: 'failed' });
      return;
    }
    await this.finish(storeId, message, {
      status: 'sent',
      providerMessageId: receipt.providerMessageId,
      sentAt: this.clock.now(),
      credits: receipt.credits,
    });
  }

  private async start(storeId: string, messageId: string): Promise<Start> {
    try {
      return await this.transaction.run(storeId, () => this.claim(storeId, messageId));
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'WALLET_BALANCE_TOO_LOW') throw error;
      await this.transaction.run(storeId, () => this.skip(storeId, messageId, 'no_credits'));
      return { kind: 'done' };
    }
  }

  // Everything that can stop a message is decided here, under the customer's lock.
  private async claim(storeId: string, messageId: string): Promise<Start> {
    const found = await this.messages.findById(storeId, messageId);
    if (!found || ['sent', 'skipped', 'failed'].includes(found.status)) return { kind: 'done' };
    await this.contacts.lockForDueBook(storeId, found.contactId);
    // The lock may have waited on another change, so read the row again.
    const message = (await this.messages.findById(storeId, messageId))!;
    if (message.status === 'sending') return { kind: 'send', message };
    if (message.status !== 'queued') return { kind: 'done' };

    const reason = await this.refusal(storeId, message);
    if (reason) {
      await this.skip(storeId, messageId, reason);
      return { kind: 'done' };
    }
    const credits = countSmsParts(message.body);
    await this.wallets.reserve(storeId, {
      wallet: 'sms_credits',
      quantity: credits,
      idempotencyKey: operationKey(message.id),
      actor: system,
    });
    await this.messages.change(storeId, message.id, { status: 'sending', credits });
    return { kind: 'send', message: { ...message, status: 'sending', credits } };
  }

  private async refusal(
    storeId: string,
    message: DueMessage,
  ): Promise<DueMessageSkipReason | undefined> {
    if (message.kind === 'reminder') {
      const { balancePoisha } = await this.balances.balanceOf(storeId, message.contactId);
      if (balancePoisha <= 0) return 'not_owing';
      const now = this.clock.now();
      if (!isInsideReminderHours(now, await this.stores.timeZone(storeId))) return 'outside_hours';
    }
    const decision = await this.policy.check(storeId, {
      contactId: message.contactId,
      channel: 'sms',
      category: 'transactional',
      at: this.clock.now(),
    });
    if (decision.action === 'send') return undefined;
    return decision.action === 'skip' && decision.reason === 'blocked' ? 'blocked' : 'no_address';
  }

  private skip(storeId: string, messageId: string, skipReason: DueMessageSkipReason) {
    return this.messages.change(storeId, messageId, { status: 'skipped', skipReason });
  }

  // The credits that were reserved are charged for a sent message and returned for a refused one.
  private finish(
    storeId: string,
    message: DueMessage,
    result:
      | { status: 'failed' }
      | { status: 'sent'; providerMessageId: string; sentAt: Date; credits: number },
  ): Promise<void> {
    return this.transaction.run(storeId, async () => {
      const key = operationKey(message.id);
      const reservationId = (await this.wallets.findByIdempotencyKey(storeId, key))!.entryId;
      if (result.status === 'sent')
        await this.wallets.charge(storeId, {
          reservationId,
          quantity: result.credits,
          idempotencyKey: `${key}:charge`,
          actor: system,
        });
      else
        await this.wallets.release(storeId, {
          reservationId,
          idempotencyKey: `${key}:release`,
          actor: system,
        });
      await this.messages.change(storeId, message.id, result);
    });
  }
}

function operationKey(messageId: string): string {
  return `due-message-${messageId}`;
}
