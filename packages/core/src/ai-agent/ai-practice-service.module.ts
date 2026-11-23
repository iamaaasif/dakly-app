import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { KnowledgeSearchModule } from '../ai/knowledge-search.module';
import { AuditModule } from '../audit/audit.module';
import { MetaAuthorizationModule } from '../channels/meta-authorization.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ClockModule } from '../platform/clock.module';
import { ProductsModule } from '../products/products.module';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';
import { AiPracticeService } from './ai-practice.service';
import { SalesAgentModule } from './sales-agent.module';

// The practice service without its HTTP controller, so the worker can use it too.
@Module({
  imports: [
    AiModule,
    AuditModule,
    ClockModule,
    ContactsModule,
    KnowledgeSearchModule,
    MetaAuthorizationModule,
    ProductsModule,
    SalesAgentModule,
  ],
  providers: [AiAgentSettingsRepository, AiPracticeService],
  exports: [AiPracticeService],
})
export class AiPracticeServiceModule {}
