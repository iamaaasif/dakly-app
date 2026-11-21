import { Module } from '@nestjs/common';

import { TaughtAnswersModule } from '../ai/taught-answers.module';
import { AuditModule } from '../audit/audit.module';
import { ClockModule } from '../platform/clock.module';
import { StoresModule } from '../stores/stores.module';
import { AiReplyFeedbackController } from './ai-reply-feedback.controller';
import { AiReplyFeedbackRepository } from './ai-reply-feedback.repository';
import { AiReplyFeedbackService } from './ai-reply-feedback.service';

@Module({
  imports: [AuditModule, TaughtAnswersModule, ClockModule, StoresModule],
  providers: [AiReplyFeedbackRepository, AiReplyFeedbackService],
  controllers: [AiReplyFeedbackController],
})
export class AiReplyFeedbackModule {}
