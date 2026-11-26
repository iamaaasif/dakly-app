import { Inject, Injectable } from '@nestjs/common';

import {
  editablePaymentStatuses,
  type CreateOrderInput,
  type OrderDetail,
} from '@dakly/contracts/orders';
import type { StoreAccess } from '@dakly/contracts/team';

import { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { PriceOffersService } from '../price-offers/price-offers.service';
import { ProductsService } from '../products/products.service';
import { BuyerOrdersRepository } from './buyer-orders.repository';
import { ChatOrderTotalsRepository } from './chat-order-totals.repository';
import { offerChanges, recordPriceOffer } from './order-price-offers';
import { orderError } from './orders.errors';
import { OrdersRepository, type OrderWrite } from './orders.repository';
import { OrdersService } from './orders.service';

type ChatOrderChannel = Extract<OrderWrite['source'], 'messenger' | 'instagram' | 'whatsapp'>;
type DraftChat = { channel: ChatOrderChannel; idempotencyKey: string; conversationId: string };
const access = { seeFullPhone: false };

// What the AI sales agent may do to orders in a chat. Every method acts for the chat's own contact.
@Injectable()
export class ChatOrdersService {
  constructor(
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(BuyerOrdersRepository) private readonly buyerOrders: BuyerOrdersRepository,
    @Inject(ChatOrderTotalsRepository) private readonly totals: ChatOrderTotalsRepository,
    @Inject(OrdersRepository) private readonly repository: OrdersRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(PriceOffersService) private readonly priceOffers: PriceOffersService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ProductsService) private readonly products: ProductsService,
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
    chat: DraftChat,
  ): Promise<OrderDetail> {
    const { contactId, ...rest } = input;
    const { idempotencyKey, channel, conversationId } = chat;
    return this.transaction.runLocked(storeId, async () => {
      const existing = await this.repository.findByIdempotencyKey(storeId, idempotencyKey);
      if (existing)
        return this.refreshDraftOffer(storeId, existing.id, { contactId, conversationId });
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
          idempotencyKey,
          access,
          actor: { kind: 'system' },
          source: channel,
          createdByType: 'ai',
          offerConversationId: conversationId,
        },
      );
    });
  }

  private async refreshDraftOffer(
    storeId: string,
    orderId: string,
    party: { contactId: string; conversationId: string },
  ): Promise<OrderDetail> {
    const order = await this.repository.lock(storeId, orderId);
    if (!order || order.buyerContactId !== party.contactId) throw orderError('ORDER_NOT_FOUND');
    if (
      order.createdByType !== 'ai' ||
      order.stage !== 'to_confirm' ||
      order.confirmedAt ||
      !editablePaymentStatuses.includes(order.paymentStatus)
    )
      return this.orders.getById(storeId, orderId, access);

    const previous = await this.repository.items(storeId, orderId);
    const variantIds = previous.map(({ variantId }) => variantId);
    const offers = await this.priceOffers.forOrder(storeId, party, variantIds);
    if (!offers.length) return this.orders.getById(storeId, orderId, access);
    // An offer can expire while waiting for the variant locks that editOrder also needs.
    await this.products.orderVariants(storeId, [], variantIds);
    const discountRoomPoisha = order.itemsSubtotalPoisha - order.orderDiscountPoisha;
    const items = offerChanges(previous, offers, this.clock.now(), discountRoomPoisha);
    if (items) {
      await recordPriceOffer(storeId, orderId, this.audit);
      return this.orders.editOrder(
        storeId,
        orderId,
        { items },
        { actor: { kind: 'system' }, access },
      );
    }
    return this.orders.getById(storeId, orderId, access);
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
