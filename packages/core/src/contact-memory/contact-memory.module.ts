import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { ClockModule } from '../platform/clock.module';
import { loadEnv } from '../platform/config/env';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { QUEUES } from '../platform/queue/queues';
import { tokenCounterFor } from './contact-memory-tokenizer';
import { ContactMemoryRepository } from './contact-memory.repository';
import { CONTACT_MEMORY_TOKEN_COUNTER, ContactMemoryService } from './contact-memory.service';
import { ConversationMemorySweepService } from './conversation-memory-sweep.service';
import { ClearMemoryOnContactDeleted } from './jobs/clear-memory-on-contact-deleted.job';
import { QueueConversationMemoryUpdatesJob } from './jobs/queue-conversation-memory-updates.job';
import { RebuildContactMemory } from './jobs/rebuild-contact-memory.job';
import { UpdateConversationMemoryJob } from './jobs/update-conversation-memory.job';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.aiReply }),
    AiModule,
    ClockModule,
    OutboxModule,
  ],
  providers: [
    ContactMemoryRepository,
    ContactMemoryService,
    ConversationMemorySweepService,
    ClearMemoryOnContactDeleted,
    QueueConversationMemoryUpdatesJob,
    RebuildContactMemory,
    UpdateConversationMemoryJob,
    {
      provide: CONTACT_MEMORY_TOKEN_COUNTER,
      useFactory: () => tokenCounterFor(loadEnv().AI_REPLY_MODEL),
    },
  ],
  exports: [ContactMemoryService],
})
export class ContactMemoryModule {}
