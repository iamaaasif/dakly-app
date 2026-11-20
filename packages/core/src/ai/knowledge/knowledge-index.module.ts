import { Module } from '@nestjs/common';

import { FileStorageModule } from '../../platform/file-storage/file-storage.module';
import { AiModule } from '../ai.module';
import { KnowledgeSearchModule } from '../knowledge-search.module';
import { IndexKnowledgeJob } from './jobs/index-knowledge.job';
import { KnowledgeIndexService } from './knowledge-index.service';
import { KnowledgeRepository } from './knowledge.repository';

@Module({
  imports: [AiModule, FileStorageModule, KnowledgeSearchModule],
  providers: [KnowledgeRepository, KnowledgeIndexService, IndexKnowledgeJob],
  exports: [KnowledgeSearchModule],
})
export class KnowledgeIndexModule {}
