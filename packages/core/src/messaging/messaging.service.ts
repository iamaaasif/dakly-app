import { Inject, Injectable } from '@nestjs/common';

import { countSmsParts } from '@dakly/contracts/sms';

import { ContactsService } from '../contacts/contacts.service';
import { StoreTransaction } from '../platform/database/store-transaction';
import { SmsService } from '../sms/sms.service';
import { SmsSendersService } from '../sms-senders/sms-senders.service';
import { messagingError } from './messaging.errors';

export type OutgoingMessage = {
  channel: 'sms';
  contactId: string;
  body: string;
  operationKey: string;
};

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
  async send(storeId: string, message: OutgoingMessage): Promise<SentMessage> {
    if (this.transaction.isOpen()) throw messagingError('MESSAGING_INSIDE_TRANSACTION');
    // The full phone goes only to the driver; nothing here returns or logs it.
    const contact = await this.contactsService.getById(storeId, message.contactId, {
      seeFullPhone: true,
    });
    if (!contact.phone) throw messagingError('MESSAGING_CONTACT_HAS_NO_PHONE');
    const parts = countSmsParts(message.body);
    const sender = await this.smsSenders.approvedSenderName(storeId);
    const { providerMessageId } = await this.smsService.send({
      to: contact.phone,
      text: message.body,
      idempotencyKey: message.operationKey,
      sender,
    });
    // One SMS credit pays for one part (glossary: message cost).
    return { providerMessageId, parts, credits: parts };
  }
}
