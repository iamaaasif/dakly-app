import { z } from 'zod';

import { getProductTool, sendProductCardTool } from '@dakly/contracts/ai-agent-tools';

import { productsInChatV2 } from './prompts/products-in-chat.v2';

// What the reply pipeline remembers of a chat between turns: the messages with their read photo
// or voice text, and the products the shop already put in front of the customer.

export type HistoryMessage = {
  id: string;
  direction: 'in' | 'out';
  body: string | null;
  mediaText: string | null;
  aiSources: unknown;
};

export type ConversationEntry = { from: 'customer' | 'shop'; text: string };

export const SHOWN_PRODUCTS_SOURCE = 'shown_products';
export const MATCH_PHOTO_TOOL = 'match_photo';
// The run records this beside the reply prompt's version when the block is sent.
export const productsInChatVersion = productsInChatV2.version;
export const PRODUCTS_IN_CHAT_TOOL = 'products_in_this_chat';
const SHOWN_PRODUCT_LIMIT = 3;
const ENTRY_LENGTH = 2000;
const NAMING_TOOLS: readonly string[] = [sendProductCardTool.name, getProductTool.name];

const storedSourcesSchema = z.array(z.object({ tool: z.string(), refs: z.array(z.string()) }));

// Oldest first. A photo's words sit with the message they came with, so "red ta ache?" after a
// photo still has the photo to point at.
export function conversationEntries(history: readonly HistoryMessage[]): ConversationEntry[] {
  return history.toReversed().flatMap(({ direction, body, mediaText }) => {
    const text = [mediaText, body].filter(Boolean).join('\n').slice(0, ENTRY_LENGTH);
    return text ? [{ from: direction === 'in' ? 'customer' : 'shop', text }] : [];
  });
}

// Newest first, from the sources each AI reply saved.
export function recentlyShownProductIds(history: readonly HistoryMessage[]): string[] {
  const ids = new Set<string>();
  for (const message of history) {
    if (message.direction !== 'out') continue;
    const sources = storedSourcesSchema.safeParse(message.aiSources).data ?? [];
    const shown = sources.find(({ tool }) => tool === SHOWN_PRODUCTS_SOURCE)?.refs ?? [];
    for (const id of shown) {
      ids.add(id);
      if (ids.size === SHOWN_PRODUCT_LIMIT) return [...ids];
    }
  }
  return [...ids];
}

type Product = { productId: string; name: string };

// The products this reply puts in front of the customer: a card, a product read on its own, a
// photo the shop is sure about, or any product the reply names. Search guesses it never names
// are left out, so they cannot become "the product" of a later "L ache?".
export function shownProductIds(
  results: readonly { tool: string; result: object }[],
  reply: string,
): string[] {
  const words = reply.toLowerCase();
  const ids = new Set<string>();
  for (const { tool, result } of results) {
    const products = productsIn(result);
    const [first] = products;
    if (NAMING_TOOLS.includes(tool) && first) ids.add(first.productId);
    if (tool === MATCH_PHOTO_TOOL && isSureMatch(result) && first) ids.add(first.productId);
    for (const product of products)
      if (words.includes(product.name.toLowerCase())) ids.add(product.productId);
  }
  return [...ids].slice(0, SHOWN_PRODUCT_LIMIT);
}

// The shown products as the reply model reads them, each read again for this turn.
export function productsInChat(products: object[]) {
  return { rule: productsInChatV2.rule, products };
}

// What the classifier reads: earlier messages for context and the latest burst to classify.
export function classifierInput(
  customerTexts: readonly string[],
  earlier: readonly ConversationEntry[],
) {
  return JSON.stringify({ earlier_messages: earlier, customer_messages: customerTexts });
}

function isSureMatch(result: object) {
  return (
    'photoMatch' in result && (result.photoMatch === 'sure' || result.photoMatch === 'sold_out')
  );
}

function productsIn(value: unknown): Product[] {
  if (Array.isArray(value)) return value.flatMap(productsIn);
  if (!value || typeof value !== 'object') return [];
  const own =
    'productId' in value &&
    typeof value.productId === 'string' &&
    'name' in value &&
    typeof value.name === 'string'
      ? [{ productId: value.productId, name: value.name }]
      : [];
  return [...own, ...Object.values(value).flatMap(productsIn)];
}

// A repeat discount ask is judged from what the customer wrote earlier in the same chat.
export const customerTexts = (entries: ConversationEntry[]) =>
  entries.filter(({ from }) => from === 'customer').map(({ text }) => text);
