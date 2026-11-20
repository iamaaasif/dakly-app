import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { ClockModule } from '../platform/clock.module';
import { AiAgentSettingsController } from './ai-agent-settings.controller';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';
import { AiAgentSettingsService } from './ai-agent-settings.service';

@Module({
  imports: [AuditModule, ClockModule],
  controllers: [AiAgentSettingsController],
  providers: [AiAgentSettingsRepository, AiAgentSettingsService],
})
export class AiAgentSettingsModule {}
