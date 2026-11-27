import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';
import { InboxModule } from '../messaging/inbox.module';
import { ClockModule } from '../platform/clock.module';
import { UsageModule } from '../usage/usage.module';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';
import { ProductCardRepliesController } from './product-card-replies.controller';
import { ProductCardRepliesService } from './product-card-replies.service';
import { ReplyDraftsController } from './reply-drafts.controller';
import { ReplyDraftsService } from './reply-drafts.service';
import { SalesAgentModule } from './sales-agent.module';

// The reply box's tools. The API serves them; the AI reply jobs live in the worker's AiAgentModule.
@Module({
  imports: [AiModule, BillingModule, ClockModule, InboxModule, SalesAgentModule, UsageModule],
  controllers: [ProductCardRepliesController, ReplyDraftsController],
  providers: [AiAgentSettingsRepository, ProductCardRepliesService, ReplyDraftsService],
})
export class ReplyToolsModule {}
