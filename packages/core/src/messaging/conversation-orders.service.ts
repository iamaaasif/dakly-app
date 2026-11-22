import { Inject, Injectable } from '@nestjs/common';

import type { CreateConversationOrderInput, OrderDetail } from '@dakly/contracts/orders';
import type { StoreAccess } from '@dakly/contracts/team';

import { ChatOrdersService } from '../orders/chat-orders.service';
import { StoresService } from '../stores/stores.service';
import { InboxRepository } from './inbox.repository';
import { messagingError } from './messaging.errors';

@Injectable()
export class ConversationOrdersService {
  constructor(
    @Inject(InboxRepository) private readonly repository: InboxRepository,
    @Inject(ChatOrdersService) private readonly chatOrders: ChatOrdersService,
    @Inject(StoresService) private readonly stores: StoresService,
  ) {}

  async place(
    storeId: string,
    conversationId: string,
    placed: { userId: string; access: StoreAccess; idempotencyKey: string },
    input: CreateConversationOrderInput,
  ): Promise<OrderDetail> {
    const { extensions } = await this.stores.settings(storeId);
    if (!extensions.includes('chats')) throw messagingError('CHATS_DISABLED');
    const route = await this.repository.replyRoute(storeId, conversationId);
    if (!route) throw messagingError('CONVERSATION_NOT_FOUND');
    return this.chatOrders.placeByStaff(
      storeId,
      { ...input, contactId: route.contactId },
      { ...placed, channel: route.channel },
    );
  }
}
