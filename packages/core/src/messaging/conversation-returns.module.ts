import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { QUEUES } from '../platform/queue/queues';
import { ConversationReturnsService } from './conversation-returns.service';
import { InboxModule } from './inbox.module';
import { InboxRepository } from './inbox.repository';
import { QueueConversationReturnsJob } from './jobs/queue-conversation-returns.job';
import { ReturnConversationToAiJob } from './jobs/return-conversation-to-ai.job';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.sync }), ClockModule, InboxModule],
  providers: [
    InboxRepository,
    ConversationReturnsService,
    QueueConversationReturnsJob,
    ReturnConversationToAiJob,
  ],
})
export class ConversationReturnsModule {}
