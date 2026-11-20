import { Module } from '@nestjs/common';

import { AiPracticeServiceModule } from './ai-practice-service.module';
import { AiPracticeController } from './ai-practice.controller';

@Module({
  imports: [AiPracticeServiceModule],
  controllers: [AiPracticeController],
})
export class AiPracticeModule {}
