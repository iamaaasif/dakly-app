import { Inject, Injectable } from '@nestjs/common';

import { getProductTool } from '@dakly/contracts/ai-agent-tools';
import { chatReplyOutputSchema } from '@dakly/contracts/chat-reply';
import { photoSearchText, type handoverReasons } from '@dakly/contracts/chats';
import {
  buildProductCardElement,
  productCardElementSchema,
  type ProductCardElement,
} from '@dakly/contracts/product-card';

import { AdLinksService } from '../ad-links/ad-links.service';
import { AiRunsService } from '../ai/ai-runs.service';
import { AiService } from '../ai/ai.service';
import { ContactMemoryService } from '../contact-memory/contact-memory.service';
import { InboxService } from '../messaging/inbox.service';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { ProductsService } from '../products/products.service';
import { StoresService } from '../stores/stores.service';
import { AD_PRODUCT_LIMIT, AD_PRODUCTS_TOOL, adProducts, isAdContextFresh } from './ad-context';
import {
  conversationEntries,
  type ConversationEntry,
  type HistoryMessage,
  MATCH_PHOTO_TOOL,
  PRODUCTS_IN_CHAT_TOOL,
  productsInChat,
  recentlyShownProductIds,
  SHOWN_PRODUCTS_SOURCE,
  shownProductIds,
} from './chat-memory';
import { conversationBlocks, windowConversation } from './conversation-window';
import { shorten } from './message-shortening';
import { customerConfirms } from './order-confirmation';
import { chatReplyV14 } from './prompts/chat-reply.v14';
import { checkReplyFacts, factCheckFailedBlock, type FactCheckFailure } from './reply-fact-check';
import { promptWith } from './reply-prompt-version';
import {
  type ToolScope,
  isOutOfStock,
  SalesAgentToolsService,
  salesAgentLlmTools,
} from './sales-agent-tools.service';
import { type CompactDeliveryZone, shopBlock, summaryOf } from './shop-block';
import { refuseToolCall, type ShopRules, shopRulesBlock } from './shop-rules';

const MAX_ROUNDS = 4;
const REPLY_BUDGET_MS = 20_000;
const HISTORY_LENGTH = 20;
// The whole recent chat is read; the conversation window decides how much of it the model sees.
const REPLY_HISTORY_LENGTH = 300;
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
      earlierCustomerTexts: string[];
      sources: { tool: string; refs: string[] }[];
    }
  | { kind: 'handover'; reason: Reason; summary?: string }
  | { kind: 'busy' };

// The photo is sent before the text; a card with no photo is text only.
export type ProductCard = {
  text: string;
  // The same product drawn as a Meta card; absent when it cannot be drawn.
  element?: ProductCardElement;
  image?: { objectKey: string; contentType: string; sizeBytes: number };
};

export type PreparedReply = {
  results: ToolResult[];
  scoped: ComposeInput;
  ad: { result: ToolResult } | undefined;
  inChat: ToolResult | undefined;
  history: readonly HistoryMessage[] | undefined;
  deliveryZones: CompactDeliveryZone[];
};

export type ComposeInput = ToolScope & { customerTexts: string[]; rules: ShopRules };

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
    @Inject(AiRunsService) private readonly runs: AiRunsService,
    @Inject(AdLinksService) private readonly adLinks: AdLinksService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // A reply that fails the fact check is written once more with the failure named, so a slip such
  // as an invented amount does not cost the customer a person's wait. A second failure hands over.
  async compose(input: ComposeInput, prepared?: Promise<PreparedReply>): Promise<ComposedReply> {
    const first = await this.composeOnce(input, undefined, prepared);
    const failed = first.kind === 'reply' && (await this.factCheckFailure(input, first));
    if (first.kind !== 'reply' || !failed) return first;
    await this.runs.setOutcome(input.storeId, first.aiRunId, 'failed_check', failed);
    const second = await this.composeOnce(input, { failure: failed, reply: first.text });
    const failedAgain = second.kind === 'reply' && (await this.factCheckFailure(input, second));
    if (second.kind !== 'reply' || !failedAgain) return second;
    await this.runs.setOutcome(input.storeId, second.aiRunId, 'failed_check', failedAgain);
    return { kind: 'handover', reason: 'out_of_scope' };
  }

  private async factCheckFailure(
    input: ComposeInput,
    composed: Extract<ComposedReply, { kind: 'reply' }>,
  ): Promise<FactCheckFailure | false> {
    const shop = await this.stores.settings(input.storeId);
    const checked = checkReplyFacts(
      composed.text,
      composed.toolResults,
      {
        phone: shop.phone,
        linkBaseUrl: loadEnv().SHORT_LINK_BASE_URL,
        earlierCustomerTexts: composed.earlierCustomerTexts,
      },
      input.customerTexts,
    );
    return !checked.isSafe && checked.failure;
  }

  // Reads the chat and the products it already points to. The caller may start it while the
  // hand-over check is still running; the search that costs an AI call waits for the verdict.
  async prepare(input: ComposeInput): Promise<PreparedReply> {
    const results: ToolResult[] = [];
    // A practice question has no saved conversation, so the question itself is the whole history.
    const [history, products, deliveryZones] = await Promise.all([
      input.chat
        ? this.inbox.replyHistory(input.storeId, input.chat.conversationId, REPLY_HISTORY_LENGTH)
        : undefined,
      this.gatherProducts(input, results),
      this.tools.deliveryZones?.(input.storeId) ?? Promise.resolve([]),
    ]);
    if (deliveryZones.length)
      results.push({ tool: 'delivery_zones', result: { zones: deliveryZones } });
    return { results, history, deliveryZones, ...products };
  }

  private async composeOnce(
    input: ComposeInput,
    rejected?: { failure: FactCheckFailure; reply: string },
    prepared?: Promise<PreparedReply>,
  ): Promise<ComposedReply> {
    const { storeId } = input;
    const signal = AbortSignal.timeout(REPLY_BUDGET_MS);
    const ready = await (prepared ?? this.prepare(input));
    // The model's tool rounds add to the list, so a retry must not see the first try's results.
    const results = [...ready.results];
    const { scoped, ad, inChat, history, deliveryZones } = ready;
    const candidates = await this.productCandidates(scoped);
    if (candidates) results.push(candidates);
    const context = await this.context({ input, history, inChat, candidates, ad, deliveryZones });
    let transcript = rejectedBlock(rejected);
    for (let round = 1; round <= MAX_ROUNDS; round += 1) {
      const attempt = await this.ai.run(storeId, {
        tier: 'reply',
        purpose: 'chat_reply',
        prompt: promptWith(chatReplyV14, inChat, ad),
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
          earlierCustomerTexts: customerLines(history),
          sources: withShownProducts(
            sourcesOf(results),
            shownProductIds(results, attempt.output.reply),
          ),
        };
      const outcome = await this.answerToolCalls(scoped, attempt.toolCalls, results);
      if ('handover' in outcome)
        return { kind: 'handover', reason: outcome.handover, summary: outcome.summary };
      transcript += `\n<tool_results untrusted="true" round="${round}">${JSON.stringify(outcome.answered)}</tool_results>`;
    }
    return { kind: 'handover', reason: 'out_of_scope' };
  }

  // The ad's products and the products shown earlier, in the order the prompt lists them.
  // `scoped` is the input the tools run with: inside the ad's products while it has any.
  private async gatherProducts(input: ComposeInput, results: ToolResult[]) {
    const ad = await this.adContext(input);
    if (ad) results.push(ad.result);
    const scoped: ComposeInput = ad?.productIds.length
      ? { ...input, adProductIds: ad.productIds }
      : input;
    const inChat = input.chat ? await this.readProductsInChat(scoped, input.chat) : undefined;
    if (inChat) results.push(inChat);
    return { scoped, ad, inChat };
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
  ): Promise<
    { handover: Reason; summary?: string } | { answered: { name: string; result: object }[] }
  > {
    const answered: { name: string; result: object }[] = [];
    for (const call of calls) {
      const refusal = refuseToolCall(input.rules, call);
      if (refusal?.kind === 'handover') return { handover: refusal.reason };
      const result =
        refusal?.result ??
        (isUnconfirmed(call, input.customerTexts, results)
          ? { error: 'CONFIRMATION_NOT_GIVEN' }
          : await this.tools.run(
              { ...input, suggestAddOns: input.rules.suggestAddOns },
              call.name,
              call.argumentsJson,
            ));
      if (call.name === HAND_OVER_TOOL && 'reason' in result)
        return { handover: result.reason as Reason, summary: summaryOf(result) };
      results.push({ tool: call.name, result });
      answered.push({ name: call.name, result });
    }
    return { answered };
  }

  // The ad or post this chat started from, with what it sells read again now. Null when the chat
  // did not start from one, or the ad is more than a day old. Products come only from the link
  // the owner saved for it, never from a guess.
  private async adContext(
    input: ComposeInput,
  ): Promise<{ productIds: string[]; result: ToolResult } | undefined> {
    if (!input.chat) return undefined;
    const referral = await this.inbox.referralOf(input.storeId, input.chat.conversationId);
    if (!referral || !isAdContextFresh(referral.referredAt, this.clock.now())) return undefined;
    const linkedIds = await this.adLinks.productIdsFor(input.storeId, referral);
    // No saved link: the ad's own title still names its product when it matches exactly one.
    const productIds = (
      linkedIds.length || !referral.title
        ? linkedIds
        : await this.tools.productNamedBy(input, referral.title)
    ).slice(0, AD_PRODUCT_LIMIT);
    const products = await this.tools.adProducts(input, productIds);
    return {
      // A linked product that is no longer offered drops out here, so search cannot reach it.
      productIds: products.flatMap((product) =>
        'productId' in product ? [String(product.productId)] : [],
      ),
      result: { tool: AD_PRODUCTS_TOOL, result: adProducts(products) },
    };
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
    chat: { conversationId: string },
  ): Promise<ToolResult | undefined> {
    const products: object[] = [];
    // All of this customer's chats, not only this one: a customer who comes back on another
    // channel after a merge still means the product they were shown.
    const shown = await this.inbox.shownProductHistory(
      input.storeId,
      chat.conversationId,
      HISTORY_LENGTH,
    );
    for (const productId of recentlyShownProductIds(shown)) {
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
  private async context({
    input,
    history,
    inChat,
    candidates,
    ad,
    deliveryZones,
  }: {
    input: ComposeInput;
    history: readonly HistoryMessage[] | undefined;
    inChat: ToolResult | undefined;
    candidates: ToolResult | undefined;
    ad: { result: ToolResult } | undefined;
    deliveryZones: CompactDeliveryZone[];
  }) {
    const shop = await this.stores.settings(input.storeId);
    const memory = await this.memory.contextFor(input.storeId, input.contactId);
    const conversation: ConversationEntry[] = history
      ? conversationEntries(history)
      : input.customerTexts.map((text) => ({ from: 'customer', text: shorten(text) }));
    return [
      shopBlock(shop, deliveryZones),
      shopRulesBlock(input.rules),
      ...(memory ? [`<customer_memory untrusted="true">${memory}</customer_memory>`] : []),
      ...conversationBlocks(windowConversation(conversation, input.customerTexts)),
      ...(inChat
        ? [`<products_in_this_chat>${JSON.stringify(inChat.result)}</products_in_this_chat>`]
        : []),
      ...(ad ? [`<ad_products>${JSON.stringify(ad.result.result)}</ad_products>`] : []),
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

// The retry's first lines tell the model why its last reply was not sent.
function rejectedBlock(rejected: { failure: FactCheckFailure; reply: string } | undefined) {
  return rejected ? `\n${factCheckFailedBlock(rejected.failure, rejected.reply)}` : '';
}

// Saved with the reply, so the next turn knows which products "this one" can mean.
function withShownProducts(sources: { tool: string; refs: string[] }[], shown: string[]) {
  return shown.length ? [...sources, { tool: SHOWN_PRODUCTS_SOURCE, refs: shown }] : sources;
}

function customerLines(history: readonly HistoryMessage[] | undefined) {
  return conversationEntries(history ?? []).flatMap(({ from, text }) =>
    from === 'customer' ? [text] : [],
  );
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
