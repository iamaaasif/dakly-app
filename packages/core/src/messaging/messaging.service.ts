import { Inject, Injectable } from '@nestjs/common';

import { countSmsParts } from '@dakly/contracts/sms';

import { ContactsService } from '../contacts/contacts.service';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { SmsService } from '../sms/sms.service';
import { SmsSendersService } from '../sms-senders/sms-senders.service';
import { messagingError } from './messaging.errors';

export type OutgoingMessage = {
  channel: 'sms';
  contactId: string;
  body: string;
  operationKey: string;
  destination?: string | null;
};

export type PreparedSmsSender = { storeId: string; name: string | undefined };

export type SentMessage = { providerMessageId: string; parts: number; credits: number };

@Injectable()
export class MessagingService {
  constructor(
    @Inject(ContactsService) private readonly contactsService: ContactsService,
    @Inject(SmsService) private readonly smsService: SmsService,
    @Inject(SmsSendersService) private readonly smsSenders: SmsSendersService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  // The caller records status and cost in its own short transaction, before and after this.
  async send(
    storeId: string,
    message: OutgoingMessage,
    preparedSender?: PreparedSmsSender,
  ): Promise<SentMessage> {
    if (this.transaction.isOpen()) throw messagingError('MESSAGING_INSIDE_TRANSACTION');
    const { to, parts, sender } = await this.prepareSend(storeId, message, preparedSender);
    const { providerMessageId } = await this.smsService.send({
      to,
      text: message.body,
      idempotencyKey: message.operationKey,
      sender,
    });
    // One SMS credit pays for one part (glossary: message cost).
    return { providerMessageId, parts, credits: parts };
  }

  async prepareSender(storeId: string): Promise<PreparedSmsSender> {
    try {
      return { storeId, name: await this.smsSenders.approvedSenderName(storeId) };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw messagingError('MESSAGING_PREPARATION_FAILED');
    }
  }

  // A failed lookup proves only that this attempt did not reach the provider.
  private async prepareSend(
    storeId: string,
    message: OutgoingMessage,
    preparedSender?: PreparedSmsSender,
  ) {
    try {
      const sender =
        preparedSender?.storeId === storeId
          ? preparedSender.name
          : (await this.prepareSender(storeId)).name;
      const phone = await this.contactsService.getPhoneForSend(storeId, message.contactId);
      if (message.destination !== undefined && phone !== message.destination)
        throw messagingError('MESSAGING_DESTINATION_CHANGED');
      if (!phone) throw messagingError('MESSAGING_CONTACT_HAS_NO_PHONE');
      return {
        to: phone,
        parts: countSmsParts(message.body),
        sender,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw messagingError('MESSAGING_PREPARATION_FAILED');
    }
  }
}
