import { Inject, Injectable } from '@nestjs/common';

import type { CreateOrderInput, OrderDetail } from '@dakly/contracts/orders';
import type { StoreAccess } from '@dakly/contracts/team';

import { BuyerOrdersRepository } from './buyer-orders.repository';
import { ChatOrderTotalsRepository } from './chat-order-totals.repository';
import { orderError } from './orders.errors';
import type { OrderWrite } from './orders.repository';
import { OrdersService } from './orders.service';

type ChatOrderChannel = Extract<OrderWrite['source'], 'messenger' | 'instagram' | 'whatsapp'>;
const access = { seeFullPhone: false };

// What the AI sales agent may do to orders in a chat. Every method acts for the chat's own contact.
@Injectable()
export class ChatOrdersService {
  constructor(
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(BuyerOrdersRepository) private readonly buyerOrders: BuyerOrdersRepository,
    @Inject(ChatOrderTotalsRepository) private readonly totals: ChatOrderTotalsRepository,
  ) {}

  totalsSince(storeId: string, since: Date) {
    return this.totals.since(storeId, since);
  }

  // The order waits in To confirm until the customer says yes. The key makes a retried or
  // repeated draft return the same order.
  draft(
    storeId: string,
    input: Omit<CreateOrderInput, 'buyer' | 'confirm' | 'items'> & {
      contactId: string;
      items: Pick<CreateOrderInput['items'][number], 'variantId' | 'quantity'>[];
    },
    chat: { channel: ChatOrderChannel; idempotencyKey: string; conversationId: string },
  ): Promise<OrderDetail> {
    const { contactId, ...rest } = input;
    return this.orders.createOrder(
      storeId,
      {
        ...rest,
        items: rest.items.map(({ variantId, quantity }) => ({
          variantId,
          quantity,
          lineDiscountPoisha: 0,
        })),
        buyer: { contactId },
        confirm: false,
      },
      {
        idempotencyKey: chat.idempotencyKey,
        access,
        actor: { kind: 'system' },
        source: chat.channel,
        createdByType: 'ai',
        offerConversationId: chat.conversationId,
      },
    );
  }

  // A person makes the order for the chat's contact. It is counted as an order from that channel.
  placeByStaff(
    storeId: string,
    input: Omit<CreateOrderInput, 'buyer'> & { contactId: string },
    placed: {
      channel: ChatOrderChannel;
      userId: string;
      access: StoreAccess;
      idempotencyKey: string;
    },
  ): Promise<OrderDetail> {
    const { contactId, ...rest } = input;
    return this.orders.createOrder(
      storeId,
      { ...rest, buyer: { contactId } },
      {
        idempotencyKey: placed.idempotencyKey,
        access: placed.access,
        actor: { kind: 'user', userId: placed.userId },
        source: placed.channel,
      },
    );
  }

  // A customer with a high return risk pays the delivery charge first, so a person confirms that
  // order after recording the advance.
  async confirm(storeId: string, contactId: string, number: number): Promise<OrderDetail> {
    const order = await this.buyerOrders.find(storeId, contactId, number);
    if (!order) throw orderError('ORDER_NOT_FOUND');
    if ((await this.orders.getById(storeId, order.id, access)).returnRisk === 'high')
      throw orderError('ORDER_ADVANCE_REQUIRED');
    return this.orders.changeStage(
      storeId,
      order.id,
      { to: 'to_pack' },
      {
        actor: { kind: 'system' },
        access,
        onlyFrom: 'to_confirm',
        confirmationMethod: 'chat_reply',
      },
    );
  }
}
