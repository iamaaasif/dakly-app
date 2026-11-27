import {
  chatClassificationSchema,
  type ChatClassification,
} from '@dakly/contracts/chat-classification';
import { chatReplyOutputSchema } from '@dakly/contracts/chat-reply';
import { photoSearchText, type handoverReasons } from '@dakly/contracts/chats';
import { LlmError, type LlmDriver, type LlmRequest } from '@dakly/providers/llm/llm-driver';

import { adProducts } from '../../ai-agent/ad-context';
import {
  classifierInput,
  type ConversationEntry,
  productsInChat,
} from '../../ai-agent/chat-memory';
import { conversationBlocks, windowConversation } from '../../ai-agent/conversation-window';
import { handoverReason } from '../../ai-agent/handover-reason';
import { productDiscountRequest } from '../../ai-agent/manipulation-screen';
import { chatReplyV18 } from '../../ai-agent/prompts/chat-reply.v18';
import { chatReplyV9 } from '../../ai-agent/prompts/chat-reply.v9';
import { classifyChat } from '../../ai-agent/prompts/classify-chat.v4';
import {
  checkReplyFacts,
  factCheckFailedBlock,
  type FactCheckFailure,
} from '../../ai-agent/reply-fact-check';
import { salesAgentToolsFor } from '../../ai-agent/sales-agent-tool-definitions';
import { shopBlock } from '../../ai-agent/shop-block';
import {
  defaultShopRules,
  refuseToolCall,
  type ShopRules,
  shopRulesBlock,
} from '../../ai-agent/shop-rules';
import type { EvalOutcome, GoldenCase } from '../golden-case';
import { deliveryZones, evalPhotoKey, evalProducts, evalShop } from './eval-catalog';
import type { EvalMeter } from './eval-meter';
import { matchEvalPhoto, runFixtureTool } from './fixture-tools';

const MAX_ROUNDS = 4;
const TIMEOUT_MS = 60_000;
const MIN_SEARCH_LENGTH = 3;
// The zones the agent puts in the shop block, without the flag only the delivery tool reads.
const evalShopZones = deliveryZones.map(({ name, chargeTaka }) => ({ name, chargeTaka }));
type Reason = (typeof handoverReasons)[number];

// A failed call still billed its tokens, so the meter counts them before the error goes on.
export async function meteredRespond(
  driver: LlmDriver,
  meter: EvalMeter,
  label: string,
  request: LlmRequest,
) {
  try {
    const result = await driver.respond(request);
    meter.record(label, request.model, result.usage);
    return result;
  } catch (error) {
    if (error instanceof LlmError && error.usage) meter.record(label, request.model, error.usage);
    throw error;
  }
}

export async function classifyQuestion(
  driver: LlmDriver,
  meter: EvalMeter,
  model: string,
  { question, earlier = [] }: Pick<GoldenCase, 'question' | 'earlier'>,
): Promise<ChatClassification | undefined> {
  try {
    const result = await meteredRespond(driver, meter, `fast:${model}`, {
      model,
      instructions: classifyChat.instructions,
      input: classifierInput([question], earlier),
      output: chatClassificationSchema,
      timeoutMs: TIMEOUT_MS,
    });
    if (result.kind !== 'output') return undefined;
    const parsed = chatClassificationSchema.safeParse(result.output);
    return parsed.success ? parsed.data : undefined;
  } catch (error) {
    if (error instanceof LlmError) return undefined;
    throw error;
  }
}

// The owner's settings a case runs under: the defaults, then what the case changes.
export function evalShopRules(
  golden: Pick<GoldenCase, 'handsOverDiscounts' | 'ownerSettings'>,
): ShopRules {
  const { handoverOff = [], ...changes } = golden.ownerSettings ?? {};
  return {
    ...defaultShopRules,
    ...changes,
    extraRules: changes.extraRules ?? null,
    handover: {
      ...defaultShopRules.handover,
      ...Object.fromEntries(handoverOff.map((name) => [name, false])),
      ...(golden.handsOverDiscounts ? { discounts: true } : {}),
    },
  };
}

export function handoverFor(
  golden: Pick<GoldenCase, 'question' | 'handsOverDiscounts' | 'ownerSettings' | 'earlier'>,
  classified: ChatClassification | undefined,
): Reason | null {
  return classified
    ? handoverReason([golden.question], classified, {
        ...evalShopRules(golden).handover,
        takesOrders: evalShopRules(golden).takeOrders,
        shopReplies: (golden.earlier ?? []).filter(({ from }) => from === 'shop').length,
      })
    : 'ai_unavailable';
}

// `history: 'last20'` reads the chat the way the agent did before the conversation window.
export type Run = {
  driver: LlmDriver;
  meter: EvalMeter;
  model: string;
  history?: 'last20';
};
type Note = (note: string) => void;
type ToolCall = { name: string; argumentsJson: string };

type ReplyCase = Pick<
  GoldenCase,
  | 'question'
  | 'memory'
  | 'earlier'
  | 'shownProducts'
  | 'adProducts'
  | 'handsOverDiscounts'
  | 'ownerSettings'
  | 'draftedOrder'
  | 'negotiation'
>;

function replyContext({
  history,
  golden,
  inChat,
  candidates,
  ad,
}: {
  history: Run['history'];
  golden: ReplyCase;
  inChat: object | undefined;
  candidates: object;
  ad: object | undefined;
}) {
  const conversation: ConversationEntry[] = [
    ...(golden.earlier ?? []),
    { from: 'customer', text: golden.question },
  ];
  return [
    shopBlock({ address: null, ...evalShop }, evalShopZones),
    shopRulesBlock(evalShopRules(golden)),
    ...(golden.memory
      ? [`<customer_memory untrusted="true">${golden.memory}</customer_memory>`]
      : []),
    ...(history === 'last20'
      ? [`<conversation untrusted="true">${JSON.stringify(conversation.slice(-20))}</conversation>`]
      : conversationBlocks(windowConversation(conversation, [golden.question]))),
    ...(inChat ? [`<products_in_this_chat>${JSON.stringify(inChat)}</products_in_this_chat>`] : []),
    ...(ad ? [`<ad_products>${JSON.stringify(ad)}</ad_products>`] : []),
    `<product_candidates>${JSON.stringify(candidates)}</product_candidates>`,
  ].join('\n');
}

// The shown products read from the eval catalog, as the agent reads them from the shop.
function evalProductsInChat(names: readonly string[] | undefined) {
  const products = (names ?? []).flatMap((name) => {
    const found = evalProducts.find((product) => product.name === name);
    return found
      ? [runFixtureTool('get_product', JSON.stringify({ productId: found.productId }))]
      : [];
  });
  return products.length ? productsInChat(products) : undefined;
}

// The ad's products read from the eval catalog, as the agent reads them from the shop.
function evalAdProducts(names: readonly string[] | undefined) {
  if (!names) return undefined;
  const found = names.flatMap((name) => evalProducts.filter((product) => product.name === name));
  const block = adProducts(
    found.map(({ productId }) => runFixtureTool('get_product', JSON.stringify({ productId }))),
  );
  return { block, productIds: found.map(({ productId }) => productId) };
}

// The key of the photo on the last product card the run sent, or null for a card with no photo.
function sentCardPhoto(toolResults: object[]) {
  const cards = toolResults.filter((result) => 'cardText' in result && 'photoFileId' in result);
  const last = cards.at(-1) as { photoFileId?: unknown } | undefined;
  return last ? evalPhotoKey(last.photoFileId) : undefined;
}

function factCheckFailure(
  reply: string,
  toolResults: object[],
  question: string,
  earlier: readonly ConversationEntry[] = [],
) {
  const checked = checkReplyFacts(
    reply,
    toolResults,
    {
      phone: evalShop.phone,
      linkBaseUrl: 'https://dkl.example',
      earlierCustomerTexts: earlier.flatMap(({ from, text }) =>
        from === 'customer' ? [text] : [],
      ),
    },
    [question],
  );
  return checked.isSafe ? undefined : checked.failure;
}

// A hand_over call ends the loop with its reason; any other call adds its result for the next round.
function answerToolCalls({
  calls,
  toolResults,
  note,
  shop,
  onlyProductIds,
}: {
  calls: ToolCall[];
  toolResults: object[];
  note: Note;
  shop: { rules: ShopRules; golden: Pick<ReplyCase, 'draftedOrder' | 'negotiation' | 'question'> };
  onlyProductIds: readonly string[] | undefined;
}) {
  const { rules, golden } = shop;
  const answered: { name: string; result: object }[] = [];
  for (const call of calls) {
    const refusal = refuseToolCall(rules, call);
    if (refusal?.kind === 'handover') return { handover: refusal.reason };
    const result =
      refusal?.result ??
      runFixtureTool(
        call.name,
        call.argumentsJson,
        {
          draftedOrder: golden.draftedOrder,
          suggestAddOns: rules.suggestAddOns,
          negotiation: golden.negotiation,
          customerText: golden.question,
        },
        onlyProductIds,
      );
    if (call.name === 'hand_over' && 'reason' in result) {
      note(`hand_over ${String(result.reason)}`);
      return { handover: result.reason as Reason };
    }
    toolResults.push(result);
    answered.push({ name: call.name, result });
  }
  return { answered };
}

// The photo match for a photo's text, else a search of what the customer wrote, as the real agent does.
function replyCandidates(
  question: string,
  onlyProductIds: readonly string[] | undefined,
): object | undefined {
  const photo = photoSearchText(question);
  if (photo !== undefined) return matchEvalPhoto(photo);
  const query = question.slice(0, 100).trim();
  return query.length >= MIN_SEARCH_LENGTH
    ? runFixtureTool('search_products', JSON.stringify({ query }), undefined, onlyProductIds)
    : undefined;
}

// The same flow as SalesAgentService.compose: a reply that fails the fact check is written once
// more with the failure named, and a second failure hands over.
export async function composeReply(
  run: Run,
  golden: ReplyCase,
  note: Note = () => undefined,
): Promise<EvalOutcome> {
  const first = await composeOnce(run, golden, note);
  if (first.kind !== 'reply') return first.outcome;
  const failure = factCheckFailure(first.text, first.toolResults, golden.question, golden.earlier);
  if (!failure) return replyOutcome(first);
  note(`fact check ${failure}: ${first.text}`);
  const second = await composeOnce(run, golden, note, { failure, reply: first.text });
  if (second.kind !== 'reply') return second.outcome;
  const failedAgain = factCheckFailure(
    second.text,
    second.toolResults,
    golden.question,
    golden.earlier,
  );
  if (!failedAgain) return replyOutcome(second);
  note(`fact check ${failedAgain} again: ${second.text}`);
  return { kind: 'handover', reason: 'out_of_scope' };
}

type Composed =
  { kind: 'reply'; text: string; toolResults: object[] } | { kind: 'ended'; outcome: EvalOutcome };

const replyOutcome = ({ text, toolResults }: { text: string; toolResults: object[] }) => ({
  kind: 'reply' as const,
  text,
  cardPhoto: sentCardPhoto(toolResults),
});

// The prompt blocks of a case, and the products its tools may see: the ad's own while the ad has any.
function replyBlocks(history: Run['history'], golden: ReplyCase, toolResults: object[]) {
  const inChat = evalProductsInChat(golden.shownProducts);
  if (inChat) toolResults.push(inChat);
  const ad = evalAdProducts(golden.adProducts);
  if (ad) toolResults.push(ad.block);
  const onlyProductIds = ad?.productIds.length ? ad.productIds : undefined;
  const candidates = replyCandidates(golden.question, onlyProductIds);
  if (candidates) toolResults.push(candidates);
  const context = replyContext({
    history,
    golden,
    inChat,
    candidates: candidates ?? { products: [] },
    ad: ad?.block,
  });
  return { context, onlyProductIds };
}

function replyModelConfiguration(rules: ShopRules, question: string, history: Run['history']) {
  if (history === 'last20') {
    return { instructions: chatReplyV9.instructions, tools: salesAgentToolsFor(rules) };
  }
  const canOffer = !rules.handover.discounts && Boolean(productDiscountRequest(question));
  return { instructions: chatReplyV18.instructions, tools: salesAgentToolsFor(rules, canOffer) };
}

// One pass of the loop, with fixture tools instead of the database.
async function composeOnce(
  { driver, meter, model, history }: Run,
  golden: ReplyCase,
  note: Note,
  rejected?: { failure: FactCheckFailure; reply: string },
): Promise<Composed> {
  const ended = (outcome: EvalOutcome): Composed => ({ kind: 'ended', outcome });
  const toolResults: object[] = [];
  const { context, onlyProductIds } = replyBlocks(history, golden, toolResults);
  const rules = evalShopRules(golden);
  const configuration = replyModelConfiguration(rules, golden.question, history);
  let transcript = rejected ? `\n${factCheckFailedBlock(rejected.failure, rejected.reply)}` : '';
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const result = await meteredRespond(
      driver,
      meter,
      history ? `reply:${model}:${history}` : `reply:${model}`,
      {
        model,
        ...configuration,
        input: context + transcript,
        output: chatReplyOutputSchema,
        timeoutMs: TIMEOUT_MS,
      },
    ).catch((error: unknown) => {
      if (error instanceof LlmError) return undefined;
      throw error;
    });
    if (!result) return ended({ kind: 'handover', reason: 'ai_unavailable' });
    if (result.kind === 'output') {
      const parsed = chatReplyOutputSchema.safeParse(result.output);
      return parsed.success
        ? { kind: 'reply', text: parsed.data.reply, toolResults }
        : ended({ kind: 'handover', reason: 'out_of_scope' });
    }
    const outcome = answerToolCalls({
      calls: result.toolCalls,
      toolResults,
      note,
      shop: { rules, golden },
      onlyProductIds,
    });
    if (outcome.handover) return ended({ kind: 'handover', reason: outcome.handover });
    transcript += `\n<tool_results untrusted="true" round="${round}">${JSON.stringify(outcome.answered)}</tool_results>`;
  }
  note('ran out of tool rounds');
  return ended({ kind: 'handover', reason: 'out_of_scope' });
}
