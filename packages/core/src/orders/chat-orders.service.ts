import { Inject, Injectable } from '@nestjs/common';

import type { CreateOrderInput, OrderDetail } from '@dakly/contracts/orders';

import { BuyerOrdersRepository } from './buyer-orders.repository';
import { orderError } from './orders.errors';
import type { OrderWrite } from './orders.repository';
import { OrdersService } from './orders.service';

type ChatOrderChannel = Extract<OrderWrite['source'], 'messenger' | 'instagram'>;
const access = { seeFullPhone: false };

// What the AI sales agent may do to orders in a chat. Every method acts for the chat's own contact.
@Injectable()
export class ChatOrdersService {
  constructor(
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(BuyerOrdersRepository) private readonly buyerOrders: BuyerOrdersRepository,
  ) {}

  // The order waits in To confirm until the customer says yes. The key makes a retried or
  // repeated draft return the same order.
  draft(
    storeId: string,
    input: Omit<CreateOrderInput, 'buyer' | 'confirm'> & { contactId: string },
    chat: { channel: ChatOrderChannel; idempotencyKey: string },
  ): Promise<OrderDetail> {
    const { contactId, ...rest } = input;
    return this.orders.createOrder(
      storeId,
      { ...rest, buyer: { contactId }, confirm: false },
      {
        idempotencyKey: chat.idempotencyKey,
        access,
        actor: { kind: 'system' },
        source: chat.channel,
        createdByType: 'ai',
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
