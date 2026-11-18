import { Module } from '@nestjs/common';

import { FileStorageModule } from '../../platform/file-storage/file-storage.module';
import { AiModule } from '../ai.module';
import { IndexKnowledgeJob } from './jobs/index-knowledge.job';
import { KnowledgeIndexService } from './knowledge-index.service';
import { KnowledgeRepository } from './knowledge.repository';

@Module({
  imports: [AiModule, FileStorageModule],
  providers: [KnowledgeRepository, KnowledgeIndexService, IndexKnowledgeJob],
})
export class KnowledgeIndexModule {}
