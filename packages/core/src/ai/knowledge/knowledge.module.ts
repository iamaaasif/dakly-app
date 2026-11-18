import { Module } from '@nestjs/common';

import { ClockModule } from '../../platform/clock.module';
import { FileStorageModule } from '../../platform/file-storage/file-storage.module';
import { OutboxModule } from '../../platform/outbox/outbox.module';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeRepository } from './knowledge.repository';
import { KnowledgeService } from './knowledge.service';

@Module({
  imports: [ClockModule, FileStorageModule, OutboxModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeRepository, KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
