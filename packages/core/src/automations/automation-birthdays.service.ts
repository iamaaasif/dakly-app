import { Inject, Injectable } from '@nestjs/common';

import { ContactsService } from '../contacts/contacts.service';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';

const CONTACT_PAGE_SIZE = 200;

@Injectable()
export class AutomationBirthdaysService {
  constructor(
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async recordBirthdays(storeId: string, { day, occurredAt }: { day: string; occurredAt: string }) {
    const birthday = { month: Number(day.slice(5, 7)), day: Number(day.slice(8)) };
    let after: string | null = null;
    for (;;) {
      const ids = await this.contacts.birthdayContactIds(
        storeId,
        birthday,
        after,
        CONTACT_PAGE_SIZE,
      );
      if (ids.length === 0) return;
      await this.transaction.run(storeId, () =>
        this.outbox.publishAll(
          ids.map((contactId) => ({
            type: 'contact.birthday',
            storeId,
            occurredAt,
            payload: { contactId, day },
          })),
        ),
      );
      if (ids.length < CONTACT_PAGE_SIZE) return;
      after = ids.at(-1) ?? null;
    }
  }
}
