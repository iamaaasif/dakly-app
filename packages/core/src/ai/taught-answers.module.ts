import { Module } from '@nestjs/common';

import { KnowledgeModule } from './knowledge/knowledge.module';
import { TaughtAnswersService } from './taught-answers.service';

@Module({
  imports: [KnowledgeModule],
  providers: [TaughtAnswersService],
  exports: [TaughtAnswersService],
})
export class TaughtAnswersModule {}
