import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';
import { MetaAuthorizationModule } from '../channels/meta-authorization.module';
import { ConsentsModule } from '../consents/consents.module';
import { ContactsModule } from '../contacts/contacts.module';
import { KillSwitchesModule } from '../kill-switches/kill-switches.module';
import { InboxModule } from '../messaging/inbox.module';
import { MessagingModule } from '../messaging/messaging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { QUEUES } from '../platform/queue/queues';
import { ProductsModule } from '../products/products.module';
import { StoresModule } from '../stores/stores.module';
import { UsageModule } from '../usage/usage.module';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';
import { AiAgentService } from './ai-agent.service';
import { CardTapRepliesService } from './card-tap-replies.service';
import { ChatClassifierService } from './chat-classifier.service';
import { AnswerCardTap } from './jobs/answer-card-tap.job';
import { DraftSuggestedReply } from './jobs/draft-suggested-reply.job';
import { ReplyToCustomerJob } from './jobs/reply-to-customer.job';
import { RestartReturnOnStaffReply } from './jobs/restart-return-on-staff-reply.job';
import { ScheduleAiReplyOnMessage } from './jobs/schedule-ai-reply-on-message.job';
import { SalesAgentModule } from './sales-agent.module';
import { SuggestedReplyService } from './suggested-reply.service';

@Module({
  imports: [
    BillingModule,
    BullModule.registerQueue({ name: QUEUES.aiReply }),
    AiModule,
    ClockModule,
    ConsentsModule,
    ContactsModule,
    InboxModule,
    KillSwitchesModule,
    MessagingModule,
    MetaAuthorizationModule,
    NotificationsModule,
    OutboxModule,
    ProductsModule,
    SalesAgentModule,
    StoresModule,
    UsageModule,
  ],
  providers: [
    AiAgentSettingsRepository,
    AiAgentService,
    CardTapRepliesService,
    ChatClassifierService,
    AnswerCardTap,
    DraftSuggestedReply,
    ReplyToCustomerJob,
    RestartReturnOnStaffReply,
    ScheduleAiReplyOnMessage,
    SuggestedReplyService,
  ],
})
export class AiAgentModule {}
