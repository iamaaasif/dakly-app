import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../auth/users.module';
import { ContactsModule } from '../contacts/contacts.module';
import { OrdersModule } from '../orders/orders.module';
import { ClockModule } from '../platform/clock.module';
import { SendingModule } from '../sending/sending.module';
import { StoresModule } from '../stores/stores.module';
import { TeamModule } from '../team/team.module';
import { ConversationOrdersService } from './conversation-orders.service';
import { ConversationReplyService } from './conversation-reply.service';
import { InboxShownProductsRepository } from './inbox-shown-products.repository';
import { InboxController } from './inbox.controller';
import { InboxRepository } from './inbox.repository';
import { InboxService } from './inbox.service';
import { MessagingModule } from './messaging.module';

@Module({
  imports: [
    AuditModule,
    ClockModule,
    ContactsModule,
    MessagingModule,
    OrdersModule,
    SendingModule,
    StoresModule,
    TeamModule,
    UsersModule,
  ],
  controllers: [InboxController],
  providers: [
    InboxRepository,
    InboxShownProductsRepository,
    InboxService,
    ConversationReplyService,
    ConversationOrdersService,
  ],
  exports: [InboxRepository, InboxService],
})
export class InboxModule {}
