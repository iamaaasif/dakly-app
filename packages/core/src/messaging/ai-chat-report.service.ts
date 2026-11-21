import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../platform/clock';
import { AiChatReportRepository, type AiChatReportRange } from './ai-chat-report.repository';

@Injectable()
export class AiChatReportService {
  constructor(
    @Inject(AiChatReportRepository) private readonly repository: AiChatReportRepository,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // Chats the AI replied in during the range, by what happened to them (glossary: AI agent metrics).
  chats(storeId: string, range: AiChatReportRange) {
    return this.repository.read(storeId, range, this.clock.now());
  }
}
