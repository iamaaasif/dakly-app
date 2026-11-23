import { Inject, Injectable } from '@nestjs/common';

import { getProductTool } from '@dakly/contracts/ai-agent-tools';
import { chatReplyOutputSchema } from '@dakly/contracts/chat-reply';
import { photoSearchText, type handoverReasons } from '@dakly/contracts/chats';
import {
  buildProductCardElement,
  productCardElementSchema,
  type ProductCardElement,
} from '@dakly/contracts/product-card';

import { AiService } from '../ai/ai.service';
import { ContactMemoryService } from '../contact-memory/contact-memory.service';
import { InboxService } from '../messaging/inbox.service';
import { ProductsService } from '../products/products.service';
import { StoresService } from '../stores/stores.service';
import {
  conversationEntries,
  type HistoryMessage,
  MATCH_PHOTO_TOOL,
  PRODUCTS_IN_CHAT_TOOL,
  productsInChat,
  recentlyShownProductIds,
  SHOWN_PRODUCTS_SOURCE,
  shownProductIds,
} from './chat-memory';
import { customerConfirms } from './order-confirmation';
import { chatReplyV5 } from './prompts/chat-reply.v5';
import {
  type ToolScope,
  isOutOfStock,
  SalesAgentToolsService,
  salesAgentLlmTools,
} from './sales-agent-tools.service';

const MAX_ROUNDS = 4;
const REPLY_BUDGET_MS = 20_000;
const HISTORY_LENGTH = 20;
const PHOTO_QUERY_LENGTH = 1000;
const CARD_TOOL = 'send_product_card';
const HAND_OVER_TOOL = 'hand_over';
const DRAFT_TOOL = 'draft_order';
const CONFIRM_TOOL = 'confirm_order';
const SOURCE_KEYS = ['productId', 'itemId', 'orderNumber'];

type Reason = (typeof handoverReasons)[number];
type ToolResult = { tool: string; result: object };

export type ComposedReply =
  | {
      kind: 'reply';
      text: string;
      aiRunId: string;
      cards: ProductCard[];
      toolResults: object[];
      toolNames: string[];
      sources: { tool: string; refs: string[] }[];
    }
  | { kind: 'handover'; reason: Reason }
  | { kind: 'busy' };

// The photo is sent before the text; a card with no photo is text only.
export type ProductCard = {
  text: string;
  // The same product drawn as a Meta card; absent when it cannot be drawn.
  element?: ProductCardElement;
  image?: { objectKey: string; contentType: string; sizeBytes: number };
};

export type ComposeInput = ToolScope & { customerTexts: string[] };

// Runs the model and the read-only tools. It sends nothing and holds no transaction.
@Injectable()
export class SalesAgentService {
  constructor(
    @Inject(AiService) private readonly ai: AiService,
    @Inject(SalesAgentToolsService) private readonly tools: SalesAgentToolsService,
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(ContactMemoryService) private readonly memory: ContactMemoryService,
  ) {}

  async compose(input: ComposeInput): Promise<ComposedReply> {
    const { storeId } = input;
    const signal = AbortSignal.timeout(REPLY_BUDGET_MS);
    const results: ToolResult[] = [];
    // A practice question has no saved conversation, so the question itself is the whole history.
    const history = input.chat
      ? await this.inbox.replyHistory(storeId, input.chat.conversationId, HISTORY_LENGTH)
      : undefined;
    const inChat = history ? await this.readProductsInChat(input, history) : undefined;
    if (inChat) results.push(inChat);
    const candidates = await this.productCandidates(input);
    if (candidates) results.push(candidates);
    const context = await this.context(input, history, inChat, candidates);
    let transcript = '';
    for (let round = 1; round <= MAX_ROUNDS; round += 1) {
      const attempt = await this.ai.run(storeId, {
        tier: 'reply',
        purpose: 'chat_reply',
        prompt: chatReplyV5,
        input: context + transcript,
        output: chatReplyOutputSchema,
        tools: salesAgentLlmTools,
        signal,
      });
      if (attempt.kind === 'failure')
        return attempt.code === 'AI_STORE_BUSY'
          ? { kind: 'busy' }
          : { kind: 'handover', reason: 'ai_unavailable' };
      if (attempt.kind === 'output')
        return {
          kind: 'reply',
          text: attempt.output.reply,
          aiRunId: attempt.aiRunId,
          cards: await this.cards(storeId, results),
          toolResults: results.map(({ result }) => result),
          toolNames: results.map(({ tool }) => tool),
          sources: withShownProducts(
            sourcesOf(results),
            shownProductIds(results, attempt.output.reply),
          ),
        };
      const outcome = await this.answerToolCalls(input, attempt.toolCalls, results);
      if ('handover' in outcome) return { kind: 'handover', reason: outcome.handover };
      transcript += `\n<tool_results untrusted="true" round="${round}">${JSON.stringify(outcome.answered)}</tool_results>`;
    }
    return { kind: 'handover', reason: 'out_of_scope' };
  }

  private async cards(storeId: string, results: ToolResult[]): Promise<ProductCard[]> {
    const cards: ProductCard[] = [];
    for (const { tool, result } of results) {
      if (tool !== CARD_TOOL || !('cardText' in result)) continue;
      const { productId, photoFileId, cardVariantId } = result as {
        productId?: string;
        photoFileId?: string | null;
        cardVariantId?: string;
      };
      const image =
        productId && photoFileId
          ? await this.products.chatPhotoFile(storeId, productId, photoFileId)
          : undefined;
      const element = productId
        ? await this.cardElement(storeId, productId, cardVariantId, image?.objectKey)
        : undefined;
      cards.push({ text: String(result.cardText), image, element });
    }
    return cards;
  }

  // The price line and buttons come from the product again, never from the model's words.
  private async cardElement(
    storeId: string,
    productId: string,
    onlyVariantId: string | undefined,
    imageObjectKey: string | undefined,
  ) {
    const product = await this.products.getForChat(storeId, productId);
    const element = buildProductCardElement({
      productId,
      name: product.name,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        title: variant.title,
        pricePoisha: variant.pricePoisha,
        inStock: !isOutOfStock(product, variant),
      })),
      onlyVariantId,
      imageObjectKey,
    });
    return productCardElementSchema.safeParse(element).data;
  }

  private async answerToolCalls(
    input: ComposeInput,
    calls: readonly { name: string; argumentsJson: string }[],
    results: ToolResult[],
  ): Promise<{ handover: Reason } | { answered: { name: string; result: object }[] }> {
    const answered: { name: string; result: object }[] = [];
    for (const call of calls) {
      const result = isUnconfirmed(call, input.customerTexts, results)
        ? { error: 'CONFIRMATION_NOT_GIVEN' }
        : await this.tools.run(input, call.name, call.argumentsJson);
      if (call.name === HAND_OVER_TOOL && 'reason' in result)
        return { handover: result.reason as Reason };
      results.push({ tool: call.name, result });
      answered.push({ name: call.name, result });
    }
    return { answered };
  }

  // Search the customer's own words first, so the model starts with likely products.
  private async productCandidates(input: ComposeInput): Promise<ToolResult | undefined> {
    const photo = photoQuery(input.customerTexts);
    if (photo) return { tool: MATCH_PHOTO_TOOL, result: await this.tools.matchPhoto(input, photo) };
    const query = input.customerTexts.join(' ').slice(0, 100).trim();
    if (query.length < 3) return undefined;
    const result = await this.tools.run(input, 'search_products', JSON.stringify({ query }));
    return { tool: 'search_products', result };
  }

  // Read again now, so a price or stock count is never an old one from the earlier message.
  private async readProductsInChat(
    input: ComposeInput,
    history: readonly HistoryMessage[],
  ): Promise<ToolResult | undefined> {
    const products: object[] = [];
    for (const productId of recentlyShownProductIds(history)) {
      const product = await this.tools.run(
        input,
        getProductTool.name,
        JSON.stringify({ productId }),
      );
      if (!('error' in product)) products.push(product);
    }
    return products.length
      ? { tool: PRODUCTS_IN_CHAT_TOOL, result: productsInChat(products) }
      : undefined;
  }

  // Stable parts first so the provider's prompt cache can reuse them.
  private async context(
    input: ComposeInput,
    history: readonly HistoryMessage[] | undefined,
    inChat: ToolResult | undefined,
    candidates: ToolResult | undefined,
  ) {
    const shop = await this.stores.settings(input.storeId);
    const memory = await this.memory.contextFor(input.storeId, input.contactId);
    const conversation = history
      ? conversationEntries(history)
      : input.customerTexts.map((text) => ({ from: 'customer', text: text.slice(0, 2000) }));
    return [
      `<shop>${JSON.stringify({ name: shop.name, phone: shop.phone, district: shop.district })}</shop>`,
      ...(memory ? [`<customer_memory untrusted="true">${memory}</customer_memory>`] : []),
      `<conversation untrusted="true">${JSON.stringify(conversation)}</conversation>`,
      ...(inChat
        ? [`<products_in_this_chat>${JSON.stringify(inChat.result)}</products_in_this_chat>`]
        : []),
      `<product_candidates>${JSON.stringify(candidates?.result ?? { products: [] })}</product_candidates>`,
    ].join('\n');
  }
}

// The photo's words and the shopper's caption, kept whole: a caption like "red ta" narrows the match.
function photoQuery(texts: string[]): string | undefined {
  const parts = texts.map((text) => photoSearchText(text) ?? text);
  return texts.some((text) => photoSearchText(text) !== undefined)
    ? parts.join(' ').slice(0, PHOTO_QUERY_LENGTH)
    : undefined;
}

// An order is confirmed only on the customer's own yes, and never in the turn that drafted it.
function isUnconfirmed(
  call: { name: string; argumentsJson: string },
  customerTexts: readonly string[],
  results: readonly ToolResult[],
) {
  if (call.name !== CONFIRM_TOOL) return false;
  if (!customerConfirms(customerTexts)) return true;
  const drafted = results.some(
    ({ tool, result }) =>
      tool === DRAFT_TOOL &&
      'orderNumber' in result &&
      call.argumentsJson.includes(String(result.orderNumber)),
  );
  return drafted;
}

// Saved with the reply, so the next turn knows which products "this one" can mean.
function withShownProducts(sources: { tool: string; refs: string[] }[], shown: string[]) {
  return shown.length ? [...sources, { tool: SHOWN_PRODUCTS_SOURCE, refs: shown }] : sources;
}

function sourcesOf(results: ToolResult[]) {
  return results
    .map(({ tool, result }) => ({ tool, refs: refsIn(result) }))
    .filter((s) => s.refs.length);
}

function refsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(refsIn);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) =>
    SOURCE_KEYS.includes(key) ? [String(item)] : refsIn(item),
  );
}
