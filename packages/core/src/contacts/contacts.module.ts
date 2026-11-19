import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { ContactIdentitiesRepository } from './contact-identities.repository';
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
    ContactsRepository,
    ContactIdentitiesRepository,
    ImportContactsRepository,
    OrderContactsRepository,
  ],
  exports: [ContactsService],
})
export class ContactsModule {}
