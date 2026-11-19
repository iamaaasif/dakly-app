import { Inject, Injectable } from '@nestjs/common';

import { ContactsService } from '../contacts/contacts.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { StoresService } from '../stores/stores.service';

const STORE_PAGE_SIZE = 100;
const CONTACT_PAGE_SIZE = 200;

@Injectable()
export class AutomationBirthdaysService {
  constructor(
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async sweep() {
    const at = this.clock.now();
    let after: string | null = null;
    for (;;) {
      const stores = await this.stores.maintenanceStoreIds(after, STORE_PAGE_SIZE);
      for (const storeId of stores) await this.recordBirthdays(storeId, at);
      if (stores.length < STORE_PAGE_SIZE) return;
      after = stores.at(-1) ?? null;
    }
  }

  async recordBirthdays(storeId: string, at: Date) {
    const timeZone = await this.stores.timeZone(storeId);
    const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone, dateStyle: 'short' }).format(at);
    const birthday = { month: Number(localDate.slice(5, 7)), day: Number(localDate.slice(8)) };
    const occurredAt = at.toISOString();
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
            payload: { contactId, day: localDate },
          })),
        ),
      );
      if (ids.length < CONTACT_PAGE_SIZE) return;
      after = ids.at(-1) ?? null;
    }
  }
}
