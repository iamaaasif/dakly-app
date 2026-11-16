import { Module } from '@nestjs/common';

import { ContactsModule } from '../contacts/contacts.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { ConsentService } from './consent.service';
import { ConsentsController } from './consents.controller';
import { ConsentsRepository } from './consents.repository';

@Module({
  imports: [ClockModule, ContactsModule, OutboxModule],
  controllers: [ConsentsController],
  providers: [ConsentsRepository, ConsentService],
  exports: [ConsentService],
})
export class ConsentsModule {}
