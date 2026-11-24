import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ZodError } from 'zod';

import {
  confirmOrderTool,
  draftOrderTool,
  findAlternativesTool,
  getDeliveryChargeTool,
  getMyOrdersTool,
  getOrderStatusTool,
  getProductTool,
  handOverTool,
  joinRestockListTool,
  salesAgentTools,
  searchKnowledgeTool,
  searchProductsTool,
  sendProductCardTool,
} from '@dakly/contracts/ai-agent-tools';
import { formatMoney } from '@dakly/contracts/money';
import type { LlmTool } from '@dakly/providers/llm/llm-driver';

import { KnowledgeSearchService } from '../ai/knowledge-search.service';
import { ContactMatchSuggestionsService } from '../contacts/contact-match-suggestions.service';
import { DeliveryService } from '../delivery/delivery.service';
import { BuyerOrdersService } from '../orders/buyer-orders.service';
import { ChatOrdersService } from '../orders/chat-orders.service';
import { AppError } from '../platform/errors/app-error';
import { type PhotoMatch, ProductSearchService } from '../product-search/product-search.service';
import { type ChatProduct, ProductsService } from '../products/products.service';
import { RestockRequestsService } from '../products/restock-requests.service';

// The agent job supplies both ids. No tool argument can name another store or customer.
export type ToolScope = {
  storeId: string;
  contactId: string;
  // A practice question has no chat, so it can read but cannot take an order.
  chat?: { conversationId: string; channel: 'messenger' | 'instagram' };
  // Set while the chat is answered from an ad: search and product reads stay inside these products.
  adProductIds?: readonly string[];
  // The owner's Suggest add-ons switch; confirming an order then returns what goes with it.
  suggestAddOns?: boolean;
};
type Handler = (scope: ToolScope, raw: unknown) => Promise<object>;

const SEARCH_PRODUCT_LIMIT = 3;
const AREA_LIMIT = 3;
const ZONE_LIMIT = 20;
const KNOWLEDGE_LIMIT = 4;
const OWN_ORDER_LIMIT = 5;

const ALIAS_LIMIT = 3;

// The field names already say taka, so only the units that add something go to the model.
export const salesAgentLlmTools: readonly LlmTool[] = salesAgentTools.map((tool) => ({
  name: tool.name,
  input: tool.input,
  description: [
    tool.description,
    `Words customers use: ${tool.aliases.slice(0, ALIAS_LIMIT).join(', ')}.`,
    ...Object.entries(tool.units)
      .filter(([, unit]) => !unit.endsWith('converted from poisha'))
      .map(([field, unit]) => `${field}: ${unit}.`),
  ].join(' '),
}));

@Injectable()
export class SalesAgentToolsService {
  private readonly handlers: Record<string, Handler> = {
    [searchProductsTool.name]: (scope, raw) => this.searchProducts(scope, raw),
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
  ) {}

  // The result goes back to the model, so a failure the model can act on is a result, not a throw.
  async run(scope: ToolScope, name: string, argumentsJson: string): Promise<object> {
    const handler = Object.hasOwn(this.handlers, name) ? this.handlers[name] : undefined;
    if (!handler) return { error: 'UNKNOWN_TOOL' };
    try {
      return await handler(scope, parseJson(argumentsJson));
    } catch (error) {
      if (error instanceof ZodError) return { error: 'INVALID_ARGUMENTS' };
      if (error instanceof AppError && error.status < 500) return { error: error.code };
      throw error;
    }
  }

  private async searchProducts({ storeId, adProductIds }: ToolScope, raw: unknown) {
    const { query } = searchProductsTool.input.parse(raw);
    const found = adProductIds
      ? await this.productSearch.searchWithin(storeId, adProductIds, query, SEARCH_PRODUCT_LIMIT)
      : await this.productSearch.search(storeId, query, SEARCH_PRODUCT_LIMIT);
    return { products: found.map(productResult) };
  }

  // What the ad sells, read now so a price or stock count is never an old one.
  async adProducts({ storeId }: ToolScope, productIds: readonly string[]): Promise<object[]> {
    const found = await this.products.getManyForChat(storeId, [...productIds]);
    return found.map(productResult);
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
        items: items.map((item) => ({ ...item, lineDiscountPoisha: 0 })),
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
      { channel: chat.channel, idempotencyKey: draftKey(chat.conversationId, input, areaId) },
    );
    return {
      orderNumber: order.number,
      stage: order.stage,
      items: order.items.map((item) => ({
        product: item.productName,
        variant: item.variantTitle,
        quantity: item.quantity,
        unitPriceTaka: taka(item.unitPricePoisha),
      })),
      deliveryTo: `${order.recipientAddress}, ${order.recipientDistrict}`,
      deliveryChargeTaka: taka(order.deliveryChargePoisha),
      totalTaka: taka(order.totalPoisha),
    };
  }

  private async confirmOrder({ storeId, contactId, suggestAddOns }: ToolScope, raw: unknown) {
    const { orderNumber } = confirmOrderTool.input.parse(raw);
    const order = await this.chatOrders.confirm(storeId, contactId, orderNumber);
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

  private async handOver(raw: unknown) {
    const { reason } = handOverTool.input.parse(raw);
    return { handedOver: true, reason };
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

// The rule tells the model what it may do with the answer, so a guess is never presented as a match.
export function describePhotoMatch(
  match: PhotoMatch,
  present: (product: ChatProduct) => object,
  alternatives: ChatProduct[],
): object {
  if (match.kind === 'sure') return describeSureMatch(match, present);
  if (match.kind === 'unsure')
    return {
      photoMatch: 'unsure',
      rule: 'Do not pick one. Ask "কোন প্রোডাক্টটি চাচ্ছেন?" and send a card for each product with send_product_card.',
      products: match.products.map(present),
    };
  if (match.kind === 'sold_out')
    return {
      photoMatch: 'sold_out',
      rule: 'The photo shows this product and it has no stock. Say so. Do not offer it or take an order for it.',
      ...describeAlternatives(match.product, alternatives, present),
    };
  return {
    photoMatch: 'none',
    rule: 'No product fits the photo. Do not guess. Ask for the product name or a clearer photo.',
    products: [],
  };
}

function describeSureMatch(
  match: Extract<PhotoMatch, { kind: 'sure' }>,
  present: (product: ChatProduct) => object,
) {
  const products = [present(match.product)];
  if (match.soldOutVariantId)
    return {
      photoMatch: 'sure',
      rule: 'The photo shows this product but the colour or size in it has no stock. Say so. Offer only the in-stock variants listed here, with their listed prices. Ask "নতুন স্টক এলে জানাবো?" and call join_restock_list with soldOutVariantId only after the customer says yes.',
      soldOutVariantId: match.soldOutVariantId,
      products,
    };
  if (match.colourMissing)
    return {
      photoMatch: 'sure',
      rule: 'The photo shows this product but the shop has no photo in that colour. Say so and list the colours in the photos. Send a card with withoutPhoto true so another colour is not shown as the one asked for. Price and stock only from the listing.',
      products,
    };
  return {
    photoMatch: 'sure',
    rule:
      'Answer as this product, with its listed price and stock only.' +
      (match.photoId
        ? ' Send its card with photoId (and variantId when given) so the customer sees the matching photo.'
        : ''),
    ...(match.variantId ? { matchedVariantId: match.variantId } : {}),
    ...(match.photoId ? { photoId: match.photoId } : {}),
    products,
  };
}

const alternativesRule =
  'Say the product or size is out of stock. Offer only the in-stock sizes and alternatives listed here, with their listed prices. If there are none, say there is nothing similar in stock now. Then ask "নতুন স্টক এলে জানাবো?". Call join_restock_list with a soldOutVariants variantId only after the customer says yes.';

// What the model may offer in place of a sold-out product, and what the customer can wait for.
export function describeAlternatives(
  product: ChatProduct,
  alternatives: ChatProduct[],
  present: (product: ChatProduct) => object,
): object {
  const soldOut = product.isStockTracked
    ? product.variants.filter((variant) => variant.available <= 0)
    : [];
  return {
    rule: alternativesRule,
    products: [present(product)],
    inStockSizes: product.variants
      .filter((variant) => !product.isStockTracked || variant.available > 0)
      .map((variant) => ({ variantId: variant.id, title: variant.title })),
    soldOutVariants: soldOut.map((variant) => ({ variantId: variant.id, title: variant.title })),
    alternatives: alternatives.map(present),
  };
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

export function productCardText(product: ChatProduct, only?: ChatVariant) {
  const lines = (only ? [only] : product.variants).map(
    (variant) =>
      `${variant.title}: ${formatMoney(variant.pricePoisha)}${isOutOfStock(product, variant) ? ' · স্টক নেই (out of stock)' : ''}`,
  );
  return [product.name, ...lines].join('\n');
}
