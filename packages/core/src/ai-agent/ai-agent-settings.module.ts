import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { ClockModule } from '../platform/clock.module';
import { ProductsModule } from '../products/products.module';
import { AiAgentSettingsController } from './ai-agent-settings.controller';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';
import { AiAgentSettingsService } from './ai-agent-settings.service';
import { KnowledgeSummaryController } from './knowledge-summary.controller';
import { KnowledgeSummaryService } from './knowledge-summary.service';

@Module({
  imports: [AuditModule, ClockModule, DeliveryModule, ProductsModule],
  controllers: [AiAgentSettingsController, KnowledgeSummaryController],
  providers: [AiAgentSettingsRepository, AiAgentSettingsService, KnowledgeSummaryService],
  exports: [AiAgentSettingsService],
})
export class AiAgentSettingsModule {}
