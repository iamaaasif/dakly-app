import { Inject, Injectable } from '@nestjs/common';

import type { SendConversationProductInput } from '@dakly/contracts/chats';

import { ConversationReplyService } from '../messaging/conversation-reply.service';
import { AiAgentSettingsRepository } from './ai-agent-settings.repository';
import { cardMessages } from './card-messages';
import { SalesAgentService } from './sales-agent.service';

@Injectable()
export class ProductCardRepliesService {
  constructor(
    @Inject(SalesAgentService) private readonly sales: SalesAgentService,
    @Inject(AiAgentSettingsRepository) private readonly settings: AiAgentSettingsRepository,
    @Inject(ConversationReplyService) private readonly replies: ConversationReplyService,
  ) {}

  // Sent as the AI sends it, so the customer gets the same price line, photo and Order button.
  async send(
    storeId: string,
    conversationId: string,
    userId: string,
    { productId, operationKey }: SendConversationProductInput,
  ) {
    const card = await this.sales.productCard(storeId, productId);
    const style = await this.settings.productCardStyle(storeId);
    // One product is always one message.
    const [message] = cardMessages([card], style);
    const { content, image, card: carousel } = message!;
    return this.replies.send(storeId, conversationId, userId, {
      content,
      image,
      card: carousel,
      operationKey,
    });
  }
}
