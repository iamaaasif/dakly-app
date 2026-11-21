import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { AiChatReportRepository } from './ai-chat-report.repository';
import { AiChatReportService } from './ai-chat-report.service';

@Module({
  imports: [ClockModule],
  providers: [AiChatReportRepository, AiChatReportService],
  exports: [AiChatReportService],
})
export class AiChatReportModule {}
