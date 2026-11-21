import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { ClockModule } from '../platform/clock.module';
import { QUEUES } from '../platform/queue/queues';
import { ContactMemoryRepository } from './contact-memory.repository';
import { ContactMemoryService } from './contact-memory.service';
import { ConversationMemoriesSweepService } from './conversation-memories-sweep.service';
import { EraseMemoryOnContactDeleted } from './jobs/erase-memory-on-contact-deleted.job';
import { QueueConversationMemoriesJob } from './jobs/queue-conversation-memories.job';
import { UpdateConversationMemoryJob } from './jobs/update-conversation-memory.job';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.bulk }), AiModule, ClockModule],
  providers: [
    ContactMemoryRepository,
    ContactMemoryService,
    ConversationMemoriesSweepService,
    EraseMemoryOnContactDeleted,
    QueueConversationMemoriesJob,
    UpdateConversationMemoryJob,
  ],
  exports: [ContactMemoryService],
})
export class ContactMemoryModule {}
