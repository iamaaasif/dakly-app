import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { ContactDeletionService } from './contact-deletion.service';
import { ContactIdentitiesRepository } from './contact-identities.repository';
import { ContactIdentitiesService } from './contact-identities.service';
import { ContactsController } from './contacts.controller';
import { ContactsRepository } from './contacts.repository';
import { ContactsService } from './contacts.service';
import { ImportContactsRepository } from './import-contacts.repository';
import { OrderContactsRepository } from './order-contacts.repository';

@Module({
  imports: [ClockModule, OutboxModule],
  controllers: [ContactsController],
  providers: [
    ContactsService,
    ContactDeletionService,
    ContactsRepository,
    ContactIdentitiesRepository,
    ContactIdentitiesService,
    ImportContactsRepository,
    OrderContactsRepository,
  ],
  exports: [ContactsService, ContactIdentitiesService],
})
export class ContactsModule {}
