import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { ConsentsModule } from '../consents/consents.module';
import { ContactsModule } from '../contacts/contacts.module';
import { InboxModule } from '../messaging/inbox.module';
import { MessagingModule } from '../messaging/messaging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { QUEUES } from '../platform/queue/queues';
import { StoresModule } from '../stores/stores.module';
import { UsageModule } from '../usage/usage.module';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';
import { AiAgentService } from './ai-agent.service';
import { ReplyToCustomerJob } from './jobs/reply-to-customer.job';
import { ScheduleAiReplyOnMessage } from './jobs/schedule-ai-reply-on-message.job';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.aiReply }),
    AiModule,
    ClockModule,
    ConsentsModule,
    ContactsModule,
    InboxModule,
    MessagingModule,
    NotificationsModule,
    OutboxModule,
    StoresModule,
    UsageModule,
  ],
  providers: [
    AiAgentSettingsRepository,
    AiAgentService,
    ReplyToCustomerJob,
    ScheduleAiReplyOnMessage,
  ],
})
export class AiAgentModule {}
