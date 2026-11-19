import { Module } from '@nestjs/common';

import { FakeLlmDriver } from '@dakly/providers/llm/fake-llm-driver';
import type { LlmDriver } from '@dakly/providers/llm/llm-driver';
import { OpenAiLlmDriver } from '@dakly/providers/llm/openai/openai-llm-driver';

import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { loadEnv } from '../platform/config/env';
import { UsageModule } from '../usage/usage.module';
import { AiGate } from './ai-gate';
import { AiRunsRepository } from './ai-runs.repository';
import { AiRunsService } from './ai-runs.service';
import { AI_CONFIG, LLM_DRIVER, loadAiConfig } from './ai.config';
import { aiError } from './ai.errors';
import { AiService } from './ai.service';

@Module({
  imports: [CacheModule, ClockModule, UsageModule],
  providers: [
    AiGate,
    AiRunsRepository,
    AiRunsService,
    AiService,
    { provide: AI_CONFIG, useFactory: loadAiConfig },
    {
      provide: LLM_DRIVER,
      useFactory: (): LlmDriver => {
        const env = loadEnv();
        if (env.LLM_DRIVER === 'openai' && env.OPENAI_API_KEY)
          return new OpenAiLlmDriver(env.OPENAI_API_KEY);
        if (env.NODE_ENV === 'production') throw aiError('AI_DRIVER_REQUIRED');
        return new FakeLlmDriver([]);
      },
    },
  ],
  exports: [AiService, AiRunsService],
})
export class AiModule {}
