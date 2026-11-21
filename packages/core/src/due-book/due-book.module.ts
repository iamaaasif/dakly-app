import { Module } from '@nestjs/common';

import { ContactsModule } from '../contacts/contacts.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { TeamModule } from '../team/team.module';
import { DueBalancesRepository } from './due-balances.repository';
import { DueBookController } from './due-book.controller';
import { DueBookService } from './due-book.service';
import { DueEntriesRepository } from './due-entries.repository';

@Module({
  imports: [ClockModule, ContactsModule, OutboxModule, TeamModule],
  controllers: [DueBookController],
  providers: [DueEntriesRepository, DueBalancesRepository, DueBookService],
  exports: [DueBookService],
})
export class DueBookModule {}
