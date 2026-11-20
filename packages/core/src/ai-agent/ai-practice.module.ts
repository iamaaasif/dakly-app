import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { KnowledgeSearchModule } from '../ai/knowledge-search.module';
import { AuditModule } from '../audit/audit.module';
import { MetaAuthorizationModule } from '../channels/meta-authorization.module';
import { ClockModule } from '../platform/clock.module';
import { ProductsModule } from '../products/products.module';
import { StoresModule } from '../stores/stores.module';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';
import { AiPracticeController } from './ai-practice.controller';
import { AiPracticeService } from './ai-practice.service';
import { SalesAgentModule } from './sales-agent.module';

@Module({
  imports: [
    AiModule,
    AuditModule,
    ClockModule,
    KnowledgeSearchModule,
    MetaAuthorizationModule,
    ProductsModule,
    SalesAgentModule,
    StoresModule,
  ],
  controllers: [AiPracticeController],
  providers: [AiAgentSettingsRepository, AiPracticeService],
})
export class AiPracticeModule {}
