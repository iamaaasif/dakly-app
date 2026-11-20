import { Module } from '@nestjs/common';

import { AiPracticeServiceModule } from '../ai-agent/ai-practice-service.module';
import { GoldenEvalService } from './golden-eval.service';
import { RunGoldenEvalJob } from './jobs/run-golden-eval.job';

@Module({
  imports: [AiPracticeServiceModule],
  providers: [GoldenEvalService, RunGoldenEvalJob],
})
export class AiEvalModule {}
