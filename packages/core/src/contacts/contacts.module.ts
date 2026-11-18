import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { ContactsController } from './contacts.controller';
import { ContactsRepository } from './contacts.repository';
import { ContactsService } from './contacts.service';
import { ImportContactsRepository } from './import-contacts.repository';

@Module({
  imports: [ClockModule, OutboxModule],
  controllers: [ContactsController],
  providers: [ContactsService, ContactsRepository, ImportContactsRepository],
  exports: [ContactsService],
})
export class ContactsModule {}
