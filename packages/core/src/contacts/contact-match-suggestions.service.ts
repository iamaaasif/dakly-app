import { Inject, Injectable } from '@nestjs/common';

import type { MatchSuggestionResponse } from '@dakly/contracts/contacts';
import { maskPhone } from '@dakly/contracts/phone';
import type { StoreAccess } from '@dakly/contracts/team';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { contactError } from './contacts.errors';
import { ContactsRepository } from './contacts.repository';
import { OrderContactsRepository } from './order-contacts.repository';

@Injectable()
export class ContactMatchSuggestionsService {
  constructor(
    @Inject(ContactsRepository) private readonly contacts: ContactsRepository,
    @Inject(OrderContactsRepository) private readonly orderContacts: OrderContactsRepository,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  // D27: a buyer's own phone given in a chat or at order entry. Returns nothing, so the caller
  // cannot learn who else holds the number.
  captureOwnPhone(
    storeId: string,
    input: { contactId: string; phone: string; orderId?: string; conversationId?: string },
  ): Promise<void> {
    return this.transaction.run(storeId, async () => {
      const { contactId, ...source } = input;
      const contact = await this.contacts.findById(storeId, contactId);
      if (!contact) throw contactError('CONTACT_NOT_FOUND');
      if (input.phone === contact.phone) return;
      await this.saveOwnPhone(storeId, contactId, { ...source, now: this.clock.now() });
    });
  }

  // Call inside a store transaction. The phone fills an empty profile; when another contact has
  // it, both profiles stay as they are and staff get a possible match (D27).
  async saveOwnPhone(
    storeId: string,
    contactId: string,
    {
      phone,
      orderId,
      conversationId,
      now,
    }: { phone: string; orderId?: string; conversationId?: string; now: Date },
  ): Promise<void> {
    if (await this.orderContacts.saveOrderPhone(storeId, contactId, phone, now)) return;
    const [owner] = await this.contacts.list(storeId, { phone, limit: 1 });
    if (owner && owner.id !== contactId)
      await this.orderContacts.suggestOrderPhoneMatch(storeId, {
        contactId,
        matchedContactId: owner.id,
        phone,
        orderId,
        conversationId,
        createdAt: now,
      });
  }

  async list(
    storeId: string,
    contactId: string,
    { seeFullPhone }: Pick<StoreAccess, 'seeFullPhone'>,
  ): Promise<MatchSuggestionResponse[]> {
    const rows = await this.orderContacts.listOpenSuggestions(storeId, contactId);
    return rows.map((row) => ({
      id: row.id,
      reason: row.reason,
      otherContact: {
        id: row.otherId,
        name: row.otherName,
        phone: row.otherPhone && !seeFullPhone ? maskPhone(row.otherPhone) : row.otherPhone,
      },
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async dismiss(storeId: string, id: string, userId: string): Promise<void> {
    const dismissed = await this.orderContacts.dismissSuggestion(storeId, id, {
      userId,
      now: this.clock.now(),
    });
    if (!dismissed) throw contactError('MATCH_SUGGESTION_NOT_FOUND');
  }
}
