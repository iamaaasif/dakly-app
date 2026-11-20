import { Module } from '@nestjs/common';

import { AiModule } from './ai.module';
import { KnowledgeRepository } from './knowledge/knowledge.repository';
import { KnowledgeSearchService } from './knowledge-search.service';

@Module({
  imports: [AiModule],
  providers: [KnowledgeRepository, KnowledgeSearchService],
  exports: [KnowledgeSearchService],
})
export class KnowledgeSearchModule {}
