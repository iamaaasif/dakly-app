import { Module } from '@nestjs/common';

import { InboxModule } from '../messaging/inbox.module';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';
import { ProductCardRepliesController } from './product-card-replies.controller';
import { ProductCardRepliesService } from './product-card-replies.service';
import { SalesAgentModule } from './sales-agent.module';

// The API serves this; the AI reply jobs live in the worker's AiAgentModule.
@Module({
  imports: [InboxModule, SalesAgentModule],
  controllers: [ProductCardRepliesController],
  providers: [AiAgentSettingsRepository, ProductCardRepliesService],
})
export class ProductCardRepliesModule {}
