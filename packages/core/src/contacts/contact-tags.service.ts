import { Inject, Injectable } from '@nestjs/common';

import { type BulkTagResponse, MAX_CONTACT_TAGS } from '@dakly/contracts/contacts';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { ContactTagsRepository } from './contact-tags.repository';
import { ContactsRepository, type TagChange } from './contacts.repository';

@Injectable()
export class ContactTagsService {
  constructor(
    @Inject(ContactTagsRepository) private readonly repository: ContactTagsRepository,
    @Inject(ContactsRepository) private readonly contacts: ContactsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // Every tag on the shop's live customers, for pickers such as the chat Label menu.
  inUse(storeId: string): Promise<string[]> {
    return this.repository.inUse(storeId);
  }

  // A hand-picked group's Add tag and its Undo. Contacts that already have the tag, are full, or
  // are gone are left out of changedIds.
  changeForMany(
    storeId: string,
    contactIds: string[],
    change: TagChange,
  ): Promise<BulkTagResponse> {
    return this.transaction.run(storeId, async () => {
      const changedIds = await this.contacts.changeTagForMany(
        storeId,
        contactIds,
        change,
        MAX_CONTACT_TAGS,
      );
      if (change.change === 'add')
        for (const contactId of changedIds)
          await this.outbox.publish({
            type: 'contact.tag_added',
            storeId,
            occurredAt: this.clock.now().toISOString(),
            payload: { contactId, tag: change.tag },
          });
      return { changedIds, unchanged: contactIds.length - changedIds.length };
    });
  }
}
