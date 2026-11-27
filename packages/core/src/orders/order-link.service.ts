import { Inject, Injectable } from '@nestjs/common';

import type {
  OrderLinkUrlResponse,
  PlaceOrderLinkOrderInput,
  PlacedOrderLinkOrder,
} from '@dakly/contracts/order-link';
import type { OrderCatalogueProduct } from '@dakly/contracts/orders';
import type { BotCheckDriver } from '@dakly/providers/bot-check/bot-check-driver';

import { DeliveryService } from '../delivery/delivery.service';
import { RateLimiter } from '../platform/cache/rate-limiter';
import { loadEnv } from '../platform/config/env';
import { hashToken } from '../platform/crypto/token-hash';
import { AppError } from '../platform/errors/app-error';
import { DAY_MS, HOUR_MS } from '../platform/time';
import { ProductsService } from '../products/products.service';
import { StoresService } from '../stores/stores.service';
import { BOT_CHECK_DRIVER } from './order-link-provider';
import { orderError } from './orders.errors';
import { OrdersService } from './orders.service';

const VIEWS_PER_IP_PER_MINUTE = 120;
const ORDERS_PER_IP_PER_HOUR = 30;
const ORDERS_PER_PHONE_PER_DAY = 5;
const HOUR = HOUR_MS / 1000;
const DAY = DAY_MS / 1000;
const noPhone = { seeFullPhone: false };

export type OrderLinkView = {
  storeName: string;
  product: OrderCatalogueProduct;
  districts: { id: number; name: string; nameBn: string | null; chargePoisha: number }[];
  botCheckSiteKey: string | null;
};

@Injectable()
export class OrderLinkService {
  constructor(
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(DeliveryService) private readonly delivery: DeliveryService,
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
    @Inject(BOT_CHECK_DRIVER) private readonly botCheck: BotCheckDriver | null,
  ) {}

  // Every miss gives the same answer, so a stranger cannot tell a missing shop from a hidden product.
  async view(slug: string, productId: string, ip: string): Promise<OrderLinkView> {
    await this.limit(`order-link:view:${ip}`, VIEWS_PER_IP_PER_MINUTE, 60);
    const { storeId, storeName } = await this.locate(slug);
    const product = await this.offered(storeId, productId);
    const districts = await this.delivery.listDistrictCharges(storeId);
    return {
      storeName,
      product,
      districts,
      botCheckSiteKey: this.botCheck?.siteKey ?? null,
    };
  }

  // What a person pastes in a chat. A product the page would not show gets no link.
  async urlFor(storeId: string, productId: string): Promise<OrderLinkUrlResponse> {
    const { slug } = await this.stores.settings(storeId);
    if (!slug) throw orderError('ORDER_LINK_NOT_FOUND');
    await this.offered(storeId, productId);
    return { url: `${loadEnv().SHORT_LINK_BASE_URL}/o/${slug}/${productId}` };
  }

  async place(
    slug: string,
    productId: string,
    input: PlaceOrderLinkOrderInput,
    ip: string,
  ): Promise<PlacedOrderLinkOrder> {
    if (!this.botCheck) throw orderError('ORDER_LINK_NOT_FOUND');
    await this.limit(`order-link:ip:${ip}`, ORDERS_PER_IP_PER_HOUR, HOUR);
    if (!(await this.botCheck.verify(input.botCheckToken, ip)))
      throw orderError('ORDER_LINK_BOT_CHECK_FAILED');
    const { storeId } = await this.locate(slug);
    const product = await this.offered(storeId, productId);
    if (!product.variants.some(({ id }) => id === input.variantId))
      throw orderError('ORDER_LINK_NOT_FOUND');

    const { recipient } = input;
    const recipientPhone = recipient.isBuyer ? input.buyer.phone : recipient.phone;
    // The phone is hashed so the cache holds no number.
    const phoneKey = hashToken(recipientPhone).toString('hex');
    if (
      !(await this.limiter.consume(`order-link:phone:${phoneKey}`, ORDERS_PER_PHONE_PER_DAY, DAY))
        .allowed
    )
      throw orderError('ORDER_LINK_PHONE_LIMIT');

    // No price, discount or charge goes in: createOrder reads the price from the variant and the
    // charge from the delivery zone.
    const order = await this.orders.createOrder(
      storeId,
      {
        confirm: false,
        buyer: input.buyer,
        recipient: {
          isBuyer: recipient.isBuyer,
          name: recipient.isBuyer ? input.buyer.name : recipient.name,
          phone: recipientPhone,
          address: recipient.address,
          areaId: recipient.areaId,
        },
        items: [{ variantId: input.variantId, quantity: input.quantity, lineDiscountPoisha: 0 }],
        orderDiscountPoisha: 0,
        advancePaidPoisha: 0,
      },
      {
        idempotencyKey: `order-link:${input.idempotencyKey}`,
        access: noPhone,
        actor: { kind: 'system' },
        source: 'order_link',
        createdByType: 'customer',
      },
    );
    return { orderNumber: order.number, totalPoisha: order.totalPoisha };
  }

  private async locate(slug: string) {
    const store = await this.stores.findPublicBySlug(slug);
    if (!store) throw orderError('ORDER_LINK_NOT_FOUND');
    return { storeId: store.id, storeName: store.name };
  }

  // A variant with no price is not offered, so the page never shows a price the order would refuse.
  private async offered(storeId: string, productId: string): Promise<OrderCatalogueProduct> {
    const product = await this.products.getForOrderLink(storeId, productId).catch((error) => {
      throw error instanceof AppError && error.code === 'PRODUCT_NOT_FOUND'
        ? orderError('ORDER_LINK_NOT_FOUND')
        : error;
    });
    const variants = product.variants.filter(({ pricePoisha }) => pricePoisha > 0);
    if (!variants.length) throw orderError('ORDER_LINK_NOT_FOUND');
    return { ...product, variants };
  }

  private async limit(key: string, limit: number, windowSeconds: number) {
    if (!(await this.limiter.consume(key, limit, windowSeconds)).allowed)
      throw orderError('ORDER_LINK_RATE_LIMITED');
  }
}
