import { conversationEntries, type HistoryMessage, SHOWN_PRODUCTS_SOURCE } from './chat-memory';
import { quotedOfferSources, type OfferQuote } from './offer-lower-price';

const SOURCE_KEYS = ['productId', 'itemId', 'orderNumber'];

// Saved with the reply, so the next turn knows which products "this one" can mean.
export function withShownProducts(sources: { tool: string; refs: string[] }[], shown: string[]) {
  return shown.length ? [...sources, { tool: SHOWN_PRODUCTS_SOURCE, refs: shown }] : sources;
}

export function customerLines(history: readonly HistoryMessage[] | undefined) {
  return conversationEntries(history ?? []).flatMap(({ from, text }) =>
    from === 'customer' ? [text] : [],
  );
}

export function sourcesOf(
  results: { tool: string; result: object }[],
  reply: string,
  offerQuotes: OfferQuote[],
) {
  return results
    .map(({ tool, result }) => ({ tool, refs: refsIn(result) }))
    .filter((s) => s.refs.length)
    .concat(quotedOfferSources(offerQuotes, reply));
}

function refsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(refsIn);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) =>
    SOURCE_KEYS.includes(key) ? [String(item)] : refsIn(item),
  );
}
