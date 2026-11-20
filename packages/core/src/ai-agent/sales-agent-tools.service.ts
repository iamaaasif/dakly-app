import { Inject, Injectable } from '@nestjs/common';
import { ZodError } from 'zod';

import {
  getDeliveryChargeTool,
  getMyOrdersTool,
  getOrderStatusTool,
  getProductTool,
  handOverTool,
  salesAgentTools,
  searchKnowledgeTool,
  searchProductsTool,
  sendProductCardTool,
} from '@dakly/contracts/ai-agent-tools';
import { formatMoney } from '@dakly/contracts/money';
import type { LlmTool } from '@dakly/providers/llm/llm-driver';

import { KnowledgeSearchService } from '../ai/knowledge-search.service';
import { DeliveryService } from '../delivery/delivery.service';
import { BuyerOrdersService } from '../orders/buyer-orders.service';
import { AppError } from '../platform/errors/app-error';
import { type ChatProduct, ProductsService } from '../products/products.service';

// The agent job supplies both ids. No tool argument can name another store or customer.
export type ToolScope = { storeId: string; contactId: string };
type Handler = (scope: ToolScope, raw: unknown) => Promise<object>;

const SEARCH_PRODUCT_LIMIT = 3;
const AREA_LIMIT = 3;
const ZONE_LIMIT = 20;
const KNOWLEDGE_LIMIT = 4;
const OWN_ORDER_LIMIT = 5;

export const salesAgentLlmTools: readonly LlmTool[] = salesAgentTools.map((tool) => ({
  name: tool.name,
  input: tool.input,
  description: [
    tool.description,
    `Words customers use: ${tool.aliases.join(', ')}.`,
    ...Object.entries(tool.units).map(([field, unit]) => `${field}: ${unit}.`),
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
    [handOverTool.name]: (_scope, raw) => this.handOver(raw),
  };

  constructor(
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(DeliveryService) private readonly delivery: DeliveryService,
    @Inject(KnowledgeSearchService) private readonly knowledge: KnowledgeSearchService,
    @Inject(BuyerOrdersService) private readonly orders: BuyerOrdersService,
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

  private async searchProducts({ storeId }: ToolScope, raw: unknown) {
    const { query } = searchProductsTool.input.parse(raw);
    const found = await this.products.searchForChat(storeId, query, SEARCH_PRODUCT_LIMIT);
    return { products: found.map(productResult) };
  }

  private async getProduct({ storeId }: ToolScope, raw: unknown) {
    const { productId } = getProductTool.input.parse(raw);
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

  private async searchKnowledge({ storeId }: ToolScope, raw: unknown) {
    const { question } = searchKnowledgeTool.input.parse(raw);
    const hits = await this.knowledge.search(storeId, question, KNOWLEDGE_LIMIT);
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
    const { productId } = sendProductCardTool.input.parse(raw);
    const product = await this.products.getForChat(storeId, productId);
    return { cardText: productCardText(product), ...productResult(product) };
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

function productResult(product: ChatProduct) {
  return {
    productId: product.id,
    name: product.name,
    category: product.category,
    description: product.description,
    variants: product.variants.map((variant) => ({
      variantId: variant.id,
      title: variant.title,
      priceTaka: taka(variant.pricePoisha),
      stock: product.isStockTracked ? variant.available : null,
    })),
  };
}

function productCardText(product: ChatProduct) {
  const lines = product.variants.map(
    (variant) => `${variant.title}: ${formatMoney(variant.pricePoisha)}`,
  );
  return [product.name, ...lines].join('\n');
}
