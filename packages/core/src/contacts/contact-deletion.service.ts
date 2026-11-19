import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { ContactsRepository } from './contacts.repository';

@Injectable()
export class ContactDeletionService {
  constructor(
    @Inject(ContactsRepository) private readonly contacts: ContactsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  remove(storeId: string, ids: string[]) {
    return this.transaction.run(storeId, async () => {
      const now = this.clock.now();
      const removed = await this.contacts.softDeleteAll(storeId, ids, now);
      const event = { type: 'contact.deleted', storeId, occurredAt: now.toISOString() } as const;
      await this.outbox.publishAll(
        removed.map((contactId) => ({ ...event, payload: { contactId } })),
      );
      return removed;
    });
  }
}
