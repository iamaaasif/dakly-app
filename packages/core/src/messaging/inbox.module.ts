import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../auth/users.module';
import { ContactsModule } from '../contacts/contacts.module';
import { OrdersModule } from '../orders/orders.module';
import { ClockModule } from '../platform/clock.module';
import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { ProductsModule } from '../products/products.module';
import { SendingModule } from '../sending/sending.module';
import { StoresModule } from '../stores/stores.module';
import { TeamModule } from '../team/team.module';
import { ConversationIntentRepository } from './conversation-intent.repository';
import { ConversationIntentService } from './conversation-intent.service';
import { ConversationOrdersService } from './conversation-orders.service';
import { ConversationReplyService } from './conversation-reply.service';
import { InboxShownProductsRepository } from './inbox-shown-products.repository';
import { InboxController } from './inbox.controller';
import { InboxRepository } from './inbox.repository';
import { InboxService } from './inbox.service';
import { MessagingModule } from './messaging.module';
import { OrderInquiriesController } from './order-inquiries.controller';
import { OrderInquiriesRepository } from './order-inquiries.repository';
import { OrderInquiriesService } from './order-inquiries.service';
import { OrderTabCountsService } from './order-tab-counts.service';

@Module({
  imports: [
    AuditModule,
    ClockModule,
    ContactsModule,
    FileStorageModule,
    MessagingModule,
    OrdersModule,
    OutboxModule,
    ProductsModule,
    SendingModule,
    StoresModule,
    TeamModule,
    UsersModule,
  ],
  controllers: [InboxController, OrderInquiriesController],
  providers: [
    ConversationIntentRepository,
    ConversationIntentService,
    InboxRepository,
    InboxShownProductsRepository,
    InboxService,
    ConversationReplyService,
    ConversationOrdersService,
    OrderInquiriesRepository,
    OrderInquiriesService,
    OrderTabCountsService,
  ],
  exports: [ConversationIntentService, ConversationReplyService, InboxRepository, InboxService],
})
export class InboxModule {}
