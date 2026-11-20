import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { KnowledgeSearchModule } from '../ai/knowledge-search.module';
import { ConsentsModule } from '../consents/consents.module';
import { ContactsModule } from '../contacts/contacts.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { InboxModule } from '../messaging/inbox.module';
import { MessagingModule } from '../messaging/messaging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { QUEUES } from '../platform/queue/queues';
import { ProductsModule } from '../products/products.module';
import { StoresModule } from '../stores/stores.module';
import { UsageModule } from '../usage/usage.module';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';
import { AiAgentService } from './ai-agent.service';
import { ReplyToCustomerJob } from './jobs/reply-to-customer.job';
import { RestartReturnOnStaffReply } from './jobs/restart-return-on-staff-reply.job';
import { ScheduleAiReplyOnMessage } from './jobs/schedule-ai-reply-on-message.job';
import { SalesAgentToolsService } from './sales-agent-tools.service';
import { SalesAgentService } from './sales-agent.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.aiReply }),
    AiModule,
    ClockModule,
    ConsentsModule,
    ContactsModule,
    DeliveryModule,
    InboxModule,
    KnowledgeSearchModule,
    MessagingModule,
    NotificationsModule,
    OrdersModule,
    OutboxModule,
    ProductsModule,
    StoresModule,
    UsageModule,
  ],
  providers: [
    AiAgentSettingsRepository,
    AiAgentService,
    ReplyToCustomerJob,
    RestartReturnOnStaffReply,
    SalesAgentService,
    SalesAgentToolsService,
    ScheduleAiReplyOnMessage,
  ],
})
export class AiAgentModule {}
