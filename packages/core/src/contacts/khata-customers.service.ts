import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../platform/clock';
import { OutboxService } from '../platform/outbox/outbox.service';
import { ContactDeletionService } from './contact-deletion.service';
import { ContactsRepository } from './contacts.repository';
import { ImportContactsRepository } from './import-contacts.repository';

// What a khata import and its undo do to customers.
@Injectable()
export class KhataCustomersService {
  constructor(
    @Inject(ContactsRepository) private readonly contacts: ContactsRepository,
    @Inject(ImportContactsRepository) private readonly importContacts: ImportContactsRepository,
    @Inject(ContactDeletionService) private readonly deletion: ContactDeletionService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // The customer gets no marketing consent (SHOP-R2). Call it inside the import's transaction.
  // Undefined means the phone is already taken.
  async create(
    storeId: string,
    input: { name: string; phone: string },
  ): Promise<string | undefined> {
    const created = await this.contacts.insert(storeId, {
      ...input,
      source: 'khata_import',
      kind: 'customer',
    });
    if (!created) return undefined;
    await this.outbox.publish({
      type: 'contact.created',
      storeId,
      occurredAt: this.clock.now().toISOString(),
      payload: { contactId: created.id },
    });
    return created.id;
  }

  // Only customers nobody has edited since they were added; call it inside a transaction.
  async removeUnedited(storeId: string, ids: string[]): Promise<void> {
    await this.deletion.remove(storeId, await this.importContacts.lockUnedited(storeId, ids));
  }
}
