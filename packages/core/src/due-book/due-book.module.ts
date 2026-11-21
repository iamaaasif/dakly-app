import { Module } from '@nestjs/common';

import { ContactsModule } from '../contacts/contacts.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { SendingModule } from '../sending/sending.module';
import { StoresModule } from '../stores/stores.module';
import { TeamModule } from '../team/team.module';
import { WalletsModule } from '../wallets/wallets.module';
import { BakiNoticesService } from './baki-notices.service';
import { DueBalancesRepository } from './due-balances.repository';
import { DueBookController } from './due-book.controller';
import { DueBookService } from './due-book.service';
import { DueEntriesRepository } from './due-entries.repository';
import { DueMessageDeliveryService } from './due-message-delivery.service';
import { DueMessagesRepository } from './due-messages.repository';
import { DueRemindersService } from './due-reminders.service';

@Module({
  imports: [
    ClockModule,
    ContactsModule,
    MessagingModule,
    OutboxModule,
    SendingModule,
    StoresModule,
    TeamModule,
    WalletsModule,
  ],
  controllers: [DueBookController],
  providers: [
    DueEntriesRepository,
    DueBalancesRepository,
    DueMessagesRepository,
    DueBookService,
    DueMessageDeliveryService,
    BakiNoticesService,
    DueRemindersService,
  ],
  exports: [DueBookService, BakiNoticesService, DueMessageDeliveryService],
})
export class DueBookModule {}
