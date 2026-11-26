import { offerLowerPriceTool } from '@dakly/contracts/ai-agent-tools';

import type { PriceOffersService } from '../price-offers/price-offers.service';
import type { ProductSearchService } from '../product-search/product-search.service';
import { quotedPricesPoisha } from './manipulation-screen';
import type { ToolScope } from './tool-scope';

const recordedQuotes = new WeakMap<object, { ref: string; pricePoisha: number }>();
const offerWording =
  /\b(?:can (?:do|offer|sell|give)|(?:it|that)(?: is|['’]s)|price is|(?:last|final|best|lowest) (?:price|dam)|(?:dite|rakhte|korte) (?:pari|parbo))\b|দাম|দিতে পারি|দিতে পারব|রাখতে পারি|অফার/u;
const denialWording =
  /\b(?:can ?not|can['’]t|won['’]t|wouldn['’]t|unable|unavailable|not|no|na|nai|nei)\b|(?:^|[\s,])(?:না|নাই|নেই)(?![\p{L}\p{M}])|অসম্ভব/u;

export async function offerLowerPrice(
  offers: PriceOffersService,
  search: ProductSearchService,
  { storeId, contactId, chat, adProductIds }: ToolScope,
  raw: unknown,
) {
  const { productName, variantWords } = offerLowerPriceTool.input.parse(raw);
  if (!chat?.discountAskMessageId) return { error: 'NOT_A_DISCOUNT_ASK' };
  const query = variantWords ? `${productName} ${variantWords}` : productName;
  const product = await productNamedForOffer(search, storeId, query, adProductIds);
  if (!product) return { error: 'PRODUCT_NOT_FOUND' };
  const result = await offers.offer(
    storeId,
    {
      conversationId: chat.conversationId,
      contactId,
      customerMessageId: chat.discountAskMessageId,
    },
    product.id,
    chat.requestedPricePoisha,
  );
  // Offer references belong to the outbound message, outside the model's tool result.
  if (result.kind !== 'offered') return result;
  const { kind, pricePoisha, isFinal } = result;
  const quote = { kind, priceTaka: pricePoisha / 100, isFinal };
  recordedQuotes.set(quote, { ref: `${chat.discountAskMessageId}:${product.id}`, pricePoisha });
  return quote;
}

export function quotedOfferSources(results: readonly { result: object }[], reply: string) {
  const prices = new Set(
    reply
      .toLowerCase()
      .split(/\n|(?<=[.!?।])\s+/u)
      .filter(
        (sentence) =>
          offerWording.test(sentence) &&
          !denialWording.test(sentence) &&
          !sentence.trimEnd().endsWith('?'),
      )
      .flatMap((sentence) => [...quotedPricesPoisha(sentence)]),
  );
  const quoted = new Map<number, string | null>();
  for (const { result } of results) {
    const quote = recordedQuotes.get(result);
    if (!quote || !prices.has(quote.pricePoisha)) continue;
    const previous = quoted.get(quote.pricePoisha);
    quoted.set(
      quote.pricePoisha,
      previous === undefined || previous === quote.ref ? quote.ref : null,
    );
  }
  const refs = [...quoted.values()].filter((ref) => ref !== null);
  return refs.length ? [{ tool: 'price_offer', refs }] : [];
}

async function productNamedForOffer(
  search: ProductSearchService,
  storeId: string,
  query: string,
  adProductIds?: readonly string[],
) {
  if (adProductIds) {
    const found = await search.searchWithin(storeId, adProductIds, query, 2);
    return found.length === 1 ? found[0] : undefined;
  }
  const found = await search.matchPhoto(storeId, query);
  return found.kind === 'sure' ? found.product : undefined;
}
