import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ZodError } from 'zod';

import {
  browseProductsTool,
  confirmOrderTool,
  draftOrderTool,
  findAlternativesTool,
  getDeliveryChargeTool,
  getMyOrdersTool,
  getOrderStatusTool,
  getProductTool,
  handOverTool,
  joinRestockListTool,
  offerLowerPriceTool,
  searchKnowledgeTool,
  searchProductsTool,
  sendProductCardTool,
} from '@dakly/contracts/ai-agent-tools';
import { formatMoney } from '@dakly/contracts/money';

import { KnowledgeSearchService } from '../ai/knowledge-search.service';
import { ContactMatchSuggestionsService } from '../contacts/contact-match-suggestions.service';
import { DeliveryService } from '../delivery/delivery.service';
import { BuyerOrdersService } from '../orders/buyer-orders.service';
import { ChatOrdersService } from '../orders/chat-orders.service';
import { AppError } from '../platform/errors/app-error';
import { PriceOffersService } from '../price-offers/price-offers.service';
import { ProductSearchService } from '../product-search/product-search.service';
import { type ChatProduct, ProductsService } from '../products/products.service';
import { RestockRequestsService } from '../products/restock-requests.service';
import { offerLowerPrice, type OfferQuote } from './offer-lower-price';
import { describeAlternatives, describePhotoMatch } from './product-match-results';
import type { CompactDeliveryZone } from './shop-block';
import type { ToolScope } from './tool-scope';

export type { ToolScope };
type Handler = (scope: ToolScope, raw: unknown) => Promise<object>;

const SEARCH_PRODUCT_LIMIT = 3;
const BROWSE_PRODUCT_LIMIT = 5;
const AREA_LIMIT = 3;
const ZONE_LIMIT = 20;
const KNOWLEDGE_LIMIT = 4;
const OWN_ORDER_LIMIT = 5;

@Injectable()
export class SalesAgentToolsService {
  private readonly handlers: Record<string, Handler> = {
    [searchProductsTool.name]: (scope, raw) => this.searchProducts(scope, raw),
    [browseProductsTool.name]: (scope, raw) => this.browseProducts(scope, raw),
    [getProductTool.name]: (scope, raw) => this.getProduct(scope, raw),
    [getDeliveryChargeTool.name]: (scope, raw) => this.getDeliveryCharge(scope, raw),
    [searchKnowledgeTool.name]: (scope, raw) => this.searchKnowledge(scope, raw),
    [getMyOrdersTool.name]: (scope, raw) => this.getMyOrders(scope, raw),
    [getOrderStatusTool.name]: (scope, raw) => this.getOrderStatus(scope, raw),
    [sendProductCardTool.name]: (scope, raw) => this.sendProductCard(scope, raw),
    [findAlternativesTool.name]: (scope, raw) => this.findAlternatives(scope, raw),
    [joinRestockListTool.name]: (scope, raw) => this.joinRestockList(scope, raw),
    [draftOrderTool.name]: (scope, raw) => this.draftOrder(scope, raw),
    [confirmOrderTool.name]: (scope, raw) => this.confirmOrder(scope, raw),
    [handOverTool.name]: (_scope, raw) => this.handOver(raw),
  };

  constructor(
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(ProductSearchService) private readonly productSearch: ProductSearchService,
    @Inject(RestockRequestsService) private readonly restock: RestockRequestsService,
    @Inject(DeliveryService) private readonly delivery: DeliveryService,
    @Inject(KnowledgeSearchService) private readonly knowledge: KnowledgeSearchService,
    @Inject(BuyerOrdersService) private readonly orders: BuyerOrdersService,
    @Inject(ChatOrdersService) private readonly chatOrders: ChatOrdersService,
    @Inject(ContactMatchSuggestionsService)
    private readonly phoneMatches: ContactMatchSuggestionsService,
    @Inject(PriceOffersService) private readonly priceOffers: PriceOffersService,
  ) {}

  // The result goes back to the model, so a failure the model can act on is a result, not a throw.
  async run(
    scope: ToolScope,
    name: string,
    argumentsJson: string,
  ): Promise<{ result: object; quote?: OfferQuote }> {
    const handler = Object.hasOwn(this.handlers, name) ? this.handlers[name] : undefined;
    try {
      if (name === offerLowerPriceTool.name)
        return await offerLowerPrice(
          this.priceOffers,
          this.productSearch,
          scope,
          parseJson(argumentsJson),
        );
      if (!handler) return { result: { error: 'UNKNOWN_TOOL' } };
      return { result: await handler(scope, parseJson(argumentsJson)) };
    } catch (error) {
      if (error instanceof ZodError) return { result: { error: 'INVALID_ARGUMENTS' } };
      if (error instanceof AppError && error.status < 500) return { result: { error: error.code } };
      throw error;
    }
  }

  private async browseProducts({ storeId }: ToolScope, raw: unknown) {
    const { category, maxPriceTaka, sort } = browseProductsTool.input.parse(raw);
    const found = await this.productSearch.browse(
      storeId,
      {
        category: category ?? undefined,
        sort: sort ?? undefined,
        maxPricePoisha: maxPriceTaka === null ? undefined : maxPriceTaka * 100,
      },
      BROWSE_PRODUCT_LIMIT,
    );
    return { categories: found.categories, products: found.products.map(productResult) };
  }

  private async searchProducts({ storeId, adProductIds }: ToolScope, raw: unknown) {
    const { query } = searchProductsTool.input.parse(raw);
    const found = adProductIds
      ? await this.productSearch.searchWithin(storeId, adProductIds, query, SEARCH_PRODUCT_LIMIT)
      : await this.productSearch.search(storeId, query, SEARCH_PRODUCT_LIMIT);
    const soldOut = found.filter(isProductSoldOut);
    const alternatives = [
      ...new Map(
        (
          await Promise.all(
            soldOut.map((product) => this.productSearch.alternativesFor(storeId, product)),
          )
        )
          .flat()
          .filter((alternative) => !found.some(({ id }) => id === alternative.id))
          .map((alternative) => [alternative.id, alternative]),
      ).values(),
    ];
    return {
      products: found.map(productResult),
      ...(alternatives.length ? { alternatives: alternatives.map(productResult) } : {}),
    };
  }

  async deliveryZones(storeId: string): Promise<CompactDeliveryZone[]> {
    const zones = await this.delivery.listZones(storeId, { limit: ZONE_LIMIT });
    return zones.items.map((zone) => ({ name: zone.name, chargeTaka: taka(zone.chargePoisha) }));
  }

  // What the ad sells, read now so a price or stock count is never an old one.
  async adProducts({ storeId }: ToolScope, productIds: readonly string[]): Promise<object[]> {
    const found = await this.products.getManyForChat(storeId, [...productIds]);
    return found.map(productResult);
  }

  // The one product a text names clearly, as a photo's words are matched; none when it is unsure.
  async productNamedBy({ storeId }: ToolScope, text: string): Promise<string[]> {
    const match = await this.productSearch.matchPhoto(storeId, text);
    return match.kind === 'sure' ? [match.product.id] : [];
  }

  // The customer sent a photo: say which product it shows, or that the shop cannot tell.
  async matchPhoto({ storeId }: ToolScope, photoText: string): Promise<object> {
    const match = await this.productSearch.matchPhoto(storeId, photoText);
    const alternatives =
      match.kind === 'sold_out'
        ? await this.productSearch.alternativesFor(storeId, match.product)
        : [];
    return describePhotoMatch(match, productResult, alternatives);
  }

  private async findAlternatives({ storeId }: ToolScope, raw: unknown) {
    const { productId } = findAlternativesTool.input.parse(raw);
    const product = await this.products.getForChat(storeId, productId);
    return describeAlternatives(
      product,
      await this.productSearch.alternativesFor(storeId, product),
      productResult,
    );
  }

  // Only a real chat has a customer to put on the list; the service refuses a size that has stock.
  private async joinRestockList({ storeId, contactId, chat }: ToolScope, raw: unknown) {
    const { variantId } = joinRestockListTool.input.parse(raw);
    if (!chat) return { error: 'NOT_IN_A_CHAT' };
    await this.restock.addToWaitingList(storeId, variantId, {
      contactId,
      conversationId: chat.conversationId,
    });
    return { onWaitingList: true, variantId };
  }

  private async getProduct({ storeId, adProductIds }: ToolScope, raw: unknown) {
    const { productId } = getProductTool.input.parse(raw);
    if (adProductIds && !adProductIds.includes(productId)) return { error: 'NOT_AN_AD_PRODUCT' };
    return productResult(await this.products.getForChat(storeId, productId));
  }

  private async getDeliveryCharge({ storeId }: ToolScope, raw: unknown) {
    const { area } = getDeliveryChargeTool.input.parse(raw);
    const found = await this.delivery.calculateChargesByAreaName(storeId, area, AREA_LIMIT);
    if (found.length)
      return {
        places: found.map((place) => ({
          area: place.area,
          district: place.district,
          chargeTaka: taka(place.chargePoisha),
        })),
      };
    // The area table stops at upazilas, so a Dhaka locality has no match; the zones let the model reason from the city.
    const zones = await this.delivery.listZones(storeId, { limit: ZONE_LIMIT });
    return {
      places: [],
      zones: zones.items.map((zone) => ({
        name: zone.name,
        chargeTaka: taka(zone.chargePoisha),
        isDefault: zone.isDefault,
      })),
    };
  }

  private async searchKnowledge({ storeId, chat }: ToolScope, raw: unknown) {
    const { question } = searchKnowledgeTool.input.parse(raw);
    const hits = await this.knowledge.search(storeId, question, KNOWLEDGE_LIMIT);
    // Only a real chat counts as a use; a practice question would inflate the number on the screen.
    if (chat) await this.knowledge.recordUse(storeId, [...new Set(hits.map((hit) => hit.itemId))]);
    return { passages: hits.map(({ itemId, content }) => ({ itemId, content })) };
  }

  private async getMyOrders({ storeId, contactId }: ToolScope, raw: unknown) {
    getMyOrdersTool.input.parse(raw);
    const found = await this.orders.list(storeId, contactId, OWN_ORDER_LIMIT);
    return {
      orders: found.map((order) => ({
        orderNumber: order.number,
        stage: order.stage,
        totalTaka: taka(order.totalPoisha),
        placedOn: order.createdAt.toISOString().slice(0, 10),
      })),
    };
  }

  private async getOrderStatus({ storeId, contactId }: ToolScope, raw: unknown) {
    const { orderNumber } = getOrderStatusTool.input.parse(raw);
    const order = await this.orders.get(storeId, contactId, orderNumber);
    return {
      orderNumber: order.number,
      stage: order.stage,
      paymentStatus: order.paymentStatus,
      totalTaka: taka(order.totalPoisha),
      courier: order.courier,
      trackingCode: order.trackingCode,
      items: order.items.map((item) => ({
        product: item.productName,
        variant: item.variantTitle,
        quantity: item.quantity,
        unitPriceTaka: taka(item.unitPricePoisha),
      })),
    };
  }

  private async sendProductCard({ storeId }: ToolScope, raw: unknown) {
    const { productId, variantId, photoId, withoutPhoto } = sendProductCardTool.input.parse(raw);
    const product = await this.products.getForChat(storeId, productId);
    const variant = variantId ? product.variants.find(({ id }) => id === variantId) : undefined;
    if (variantId && !variant) return { error: 'PRODUCT_VARIANT_NOT_FOUND' };
    const photoFileId = withoutPhoto ? null : cardPhotoId(product, variant, photoId);
    if (photoFileId === 'unknown') return { error: 'PHOTO_NOT_FOUND' };
    return {
      cardText: productCardText(product, variant),
      photoFileId,
      // A named size with no stock is shown as such, never as something to buy.
      ...(variant ? { cardVariantId: variant.id } : {}),
      ...(variant && isOutOfStock(product, variant) ? { outOfStock: true } : {}),
      ...productResult(product),
    };
  }

  private async draftOrder({ storeId, contactId, chat }: ToolScope, raw: unknown) {
    const input = draftOrderTool.input.parse(raw);
    if (!chat) return { error: 'NOT_IN_A_CHAT' };
    const areaId = await this.delivery.findAreaIdByName(storeId, input.area);
    // The own phone is saved before the order so a number held by another contact shows staff a
    // possible match even when the order then fails (D27).
    await this.phoneMatches.captureOwnPhone(storeId, {
      contactId,
      phone: input.phone,
      conversationId: chat.conversationId,
    });
    const items = input.items.map(({ variantId, quantity }) => ({ variantId, quantity }));
    const order = await this.chatOrders.draft(
      storeId,
      {
        contactId,
        items,
        recipient: {
          name: input.recipientName,
          phone: input.phone,
          address: input.address,
          areaId,
          isBuyer: true,
        },
        orderDiscountPoisha: 0,
        advancePaidPoisha: 0,
      },
      {
        channel: chat.channel,
        conversationId: chat.conversationId,
        idempotencyKey: draftKey(chat.conversationId, input, areaId),
      },
    );
    return {
      orderNumber: order.number,
      stage: order.stage,
      items: order.items.map((item) => ({
        product: item.productName,
        variant: item.variantTitle,
        quantity: item.quantity,
        unitPriceTaka: taka(item.unitPricePoisha - item.lineDiscountPoisha / item.quantity),
        ...(item.lineDiscountPoisha > 0 ? { lineDiscountTaka: taka(item.lineDiscountPoisha) } : {}),
      })),
      deliveryTo: `${order.recipientAddress}, ${order.recipientDistrict}`,
      deliveryChargeTaka: taka(order.deliveryChargePoisha),
      totalTaka: taka(order.totalPoisha),
    };
  }

  private async confirmOrder({ storeId, contactId, suggestAddOns }: ToolScope, raw: unknown) {
    const { orderNumber } = confirmOrderTool.input.parse(raw);
    const order = await this.chatOrders.confirm(
      storeId,
      contactId,
      await this.orderToConfirm(storeId, contactId, orderNumber),
    );
    if (!suggestAddOns) return { orderNumber: order.number, stage: order.stage };
    const addOns = await this.productSearch.addOnsFor(storeId, {
      variantIds: order.items.map(({ variantId }) => variantId),
      itemsTotalPoisha: order.itemsSubtotalPoisha,
    });
    return {
      orderNumber: order.number,
      stage: order.stage,
      addOnRule: addOnsRule,
      addOns: addOns.map(productResult),
    };
  }

  // The model often says yes without the number it saw one message earlier and guesses one. When
  // the number is none of this customer's orders and exactly one waits for a yes, that one is meant.
  private async orderToConfirm(storeId: string, contactId: string, orderNumber: number) {
    const own = await this.orders.list(storeId, contactId, OWN_ORDER_LIMIT);
    if (own.some(({ number }) => number === orderNumber)) return orderNumber;
    const waiting = own.filter(({ stage }) => stage === 'to_confirm');
    return waiting.length === 1 ? waiting[0]!.number : orderNumber;
  }

  private async handOver(raw: unknown) {
    const { reason, summary } = handOverTool.input.parse(raw);
    return { handedOver: true, reason, summary: summary ?? undefined };
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const taka = (poisha: number) => poisha / 100;

// No "offer", "discount" or "free" in this text: the fact check allows a word that a tool result holds.
export const addOnsRule =
  'Mention at most two of these, once, after you say the order is confirmed. Use only their names and the priceTaka shown here. Ask if the customer wants one added; never add it yourself. When addOns is empty, say nothing about other products.';

// The same chat and the same details give the same key, so a retried job or a repeated model call
// returns the order it already made.
function draftKey(
  conversationId: string,
  input: ReturnType<typeof draftOrderTool.input.parse>,
  areaId: number,
) {
  const items = input.items.map(({ variantId, quantity }) => `${variantId}x${quantity}`).sort();
  const details = [...items, input.phone, input.address, areaId].join('|');
  return `ai-order:${conversationId}:${createHash('sha256').update(details).digest('hex').slice(0, 32)}`;
}
function productResult(product: ChatProduct) {
  return {
    productId: product.id,
    name: product.name,
    category: product.category,
    description: product.description,
    photos: product.photos.map(({ id, variantId, description, tags }) => ({
      photoId: id,
      variantId,
      description,
      tags,
    })),
    variants: product.variants.map((variant) => ({
      variantId: variant.id,
      title: variant.title,
      priceTaka: taka(variant.pricePoisha),
      stock: product.isStockTracked ? variant.available : null,
    })),
  };
}

// The photo the model chose, else the variant's own, else the product's first one; sending it is
// up to the reply sender.
function cardPhotoId(
  product: ChatProduct,
  variant: ChatProduct['variants'][number] | undefined,
  photoId: string | null,
) {
  if (photoId) return product.photos.some(({ id }) => id === photoId) ? photoId : 'unknown';
  return variant?.photoFileId ?? product.variants[0]?.photoFileId ?? null;
}

type ChatVariant = ChatProduct['variants'][number];

export const isOutOfStock = (product: ChatProduct, variant: ChatVariant) =>
  product.isStockTracked && variant.available <= 0;

export const isProductSoldOut = (product: ChatProduct) =>
  product.isStockTracked && product.variants.every((variant) => isOutOfStock(product, variant));

export function productCardText(product: ChatProduct, only?: ChatVariant) {
  const lines = (only ? [only] : product.variants).map(
    (variant) =>
      `${variant.title}: ${formatMoney(variant.pricePoisha)}${isOutOfStock(product, variant) ? ' · স্টক নেই (out of stock)' : ''}`,
  );
  return [product.name, ...lines].join('\n');
}
